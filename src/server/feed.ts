import { Prisma } from "@prisma/client";
import { AppError } from "@/domain/errors";
import {
  activationBlockers,
  chooseActiveSource,
  correctionIngestionKey,
  deliveryChanged,
  ingestionKey,
  ingestLatencyMs,
  isParticipationStatus,
  isSourceOperatingMode,
  latencyP50Ms,
  MATCH_STATUSES,
  nextPollDelayMs,
  nextSourceHealth,
  normalizePlayerName,
  participationJoinsLive,
  planPlayerLiveTransition,
  playerIdentity,
  pollCountsAsFailure,
  pricingActions,
  pricingKey,
  sourceAdapter,
  suggestPlayerMatch,
  wouldPriceAs,
  type MatchStatus,
  type NormalizedCricketEvent,
  type SourceHealth,
} from "@/domain/cricket-feed";
import {
  activationChecklist,
  canProviderEventAffectPricing,
  compareDeliveries,
  detectDeliveryGap,
  isAfterDelivery,
  isUnderway,
  latencyP95Ms,
  nextContinuity,
  reconcileSnapshot,
  shadowQuality,
  slotsBetween,
  type DeliveryPoint,
} from "@/domain/feed-continuity";
import { buildShadowValidation, isCompletionSummary, type ReconciliationConflict, type ShadowCompletionSummary } from "@/domain/shadow-validation";
import { feedPricingEnabled } from "@/domain/pricing-engine";
import { requireReason, writeAudit } from "./audit";
import { CricbuzzTransportError } from "./cricbuzz/cricbuzz-client";
import { CricbuzzParseError } from "./cricbuzz/cricbuzz-parser";
import type { UnclassifiedProviderEvent } from "./cricbuzz/cricbuzz-normalizer";
import { CricbuzzLiveSource } from "./cricbuzz/cricbuzz-source";
import { publishMarketStatus, publishMatchEvent } from "./realtime";
import { prisma } from "./prisma";
import { getSettings } from "./settings";

function isUnique(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const DEFAULT_SOURCES = [
  { source: "DevelopmentSimulator", enabled: true, priority: 1, status: "HEALTHY", operatingMode: "ACTIVE" },
  { source: "CREX", enabled: false, priority: 2, status: "DISABLED", operatingMode: "DISABLED" },
  { source: "Cricbuzz", enabled: true, priority: 3, status: "HEALTHY", operatingMode: "SHADOW" },
  { source: "Sportskeeda", enabled: false, priority: 4, status: "DISABLED", operatingMode: "DISABLED" },
  { source: "PaidProvider", enabled: false, priority: 5, status: "DISABLED", operatingMode: "DISABLED" },
  { source: "Consensus", enabled: false, priority: 9, status: "HEALTHY", operatingMode: "SHADOW" },
] as const;

const SNAPSHOT_KEEP = 12;
const SNAPSHOT_CHARS = 12_000;
const SHADOW_MATCH_LIMIT = 4;

function feedSource(name: string) {
  if (name === "Cricbuzz") return new CricbuzzLiveSource();
  return sourceAdapter(name);
}

function pollOutcomeOf(error: unknown): "HTTP_ERROR" | "TIMEOUT" | "PARSE_ERROR" {
  if (error instanceof CricbuzzTransportError) return error.outcome;
  if (error instanceof CricbuzzParseError) return "PARSE_ERROR";
  return "HTTP_ERROR";
}

function boundedJson(value: unknown): string {
  const text = JSON.stringify(value) ?? "";
  return text.length > SNAPSHOT_CHARS ? text.slice(0, SNAPSHOT_CHARS) : text;
}

export async function ensureFeedConfig() {
  await prisma.feedControl.upsert({
    where: { id: "default" },
    create: { id: "default", activeSource: "DevelopmentSimulator", pollIntervalSeconds: 15 },
    update: {},
  });
  for (const source of DEFAULT_SOURCES) {
    await prisma.feedSourceState.upsert({
      where: { source: source.source },
      create: source,
      update: {},
    });
  }
  await prisma.feedSourceState.updateMany({
    where: { source: { in: ["CREX", "Sportskeeda"] }, enabled: false, operatingMode: "DISABLED", lastAttemptAt: null },
    data: { operatingMode: "SHADOW", status: "HEALTHY" },
  });
}

async function priceableConsensusConfidences(): Promise<string[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: "feed.consensusPriceable" } });
  const fallback = ["CONFIDENCE_HIGH", "CONFIDENCE_MEDIUM"];
  if (!row || typeof row.value !== "string") return fallback;
  try {
    const parsed = JSON.parse(row.value) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const allowed = parsed.filter((item) => item === "CONFIDENCE_HIGH" || item === "CONFIDENCE_MEDIUM");
    return allowed.length > 0 ? allowed : fallback;
  } catch {
    return fallback;
  }
}

async function exactNameNeedsReview(name: string, externalId: string): Promise<boolean> {
  if (!name || name === externalId || /^\d+$/.test(name)) return false;
  const players = await prisma.player.findMany({ select: { id: true, name: true } });
  return suggestPlayerMatch(name, players) !== null;
}

async function resolveExternal(input: {
  source: string;
  externalId: string | null;
  name: string;
  matchId: string;
}): Promise<{ playerId: string | null; unresolved: boolean }> {
  if (!input.externalId) {
    const key = normalizePlayerName(input.name);
    if (key.length < 3) return { playerId: null, unresolved: false };
    return resolveExternal({ ...input, externalId: `name:${key}` });
  }
  const existing = await prisma.playerFeedMapping.findUnique({
    where: { source_externalPlayerId: { source: input.source, externalPlayerId: input.externalId } },
  });
  if (existing?.mappingStatus === "MAPPED" && existing.internalPlayerId) return { playerId: existing.internalPlayerId, unresolved: false };
  if (existing) return { playerId: null, unresolved: true };
  const needsReview = await exactNameNeedsReview(input.name, input.externalId);
  try {
    await prisma.playerFeedMapping.create({
      data: {
        source: input.source,
        externalPlayerId: input.externalId,
        externalPlayerName: input.name || input.externalId,
        mappingStatus: needsReview ? "NEEDS_REVIEW" : "UNMAPPED",
        matchId: input.matchId,
      },
    });
  } catch (error) {
    if (!isUnique(error)) throw error;
  }
  return { playerId: null, unresolved: true };
}

type StoredCricketEvent = {
  id: string;
  ingestionKey: string;
  eventType: string;
  runsBatter: number;
  runsExtras: number;
  runsTotal: number;
  wicketType: string | null;
  supersededById: string | null;
};

async function latestVersion(start: StoredCricketEvent): Promise<StoredCricketEvent> {
  let current = start;
  const seen = new Set<string>();
  while (current.supersededById && !seen.has(current.id)) {
    seen.add(current.id);
    const next = await prisma.cricketEvent.findUnique({
      where: { id: current.supersededById },
      select: {
        id: true,
        ingestionKey: true,
        eventType: true,
        runsBatter: true,
        runsExtras: true,
        runsTotal: true,
        wicketType: true,
        supersededById: true,
      },
    });
    if (!next) break;
    current = next;
  }
  return current;
}

export async function ingestNormalizedEvent(event: NormalizedCricketEvent): Promise<{
  stored: boolean;
  duplicate: boolean;
  priced: boolean;
  corrected: boolean;
  unmapped: boolean;
}> {
  const key = ingestionKey({
    source: event.source,
    sourceEventId: event.sourceEventId,
    matchId: event.matchId,
    innings: event.innings,
    over: event.over,
    ball: event.ball,
    eventType: event.eventType,
    playerIdentity: playerIdentity(event),
    sequence: event.sequence,
  });
  const prior = await prisma.cricketEvent.findUnique({
    where: { ingestionKey: key },
    select: {
      id: true,
      ingestionKey: true,
      eventType: true,
      runsBatter: true,
      runsExtras: true,
      runsTotal: true,
      wicketType: true,
      supersededById: true,
    },
  });
  const [batting, bowling, fielder] = await Promise.all([
    event.battingPlayerId
      ? Promise.resolve({ playerId: event.battingPlayerId, unresolved: false })
      : resolveExternal({ source: event.source, externalId: event.battingExternalId, name: event.battingName ?? event.battingExternalId ?? "", matchId: event.matchId }),
    event.bowlingPlayerId
      ? Promise.resolve({ playerId: event.bowlingPlayerId, unresolved: false })
      : resolveExternal({ source: event.source, externalId: event.bowlingExternalId, name: event.bowlingName ?? event.bowlingExternalId ?? "", matchId: event.matchId }),
    event.fielderPlayerIds[0]
      ? Promise.resolve({ playerId: event.fielderPlayerIds[0], unresolved: false })
      : resolveExternal({
          source: event.source,
          externalId: event.fielderExternalIds[0] ?? null,
          name: event.fielderNames?.[0] ?? event.fielderExternalIds[0] ?? "",
          matchId: event.matchId,
        }),
  ]);
  const battingPlayerId = batting.playerId;
  const bowlingPlayerId = bowling.playerId;
  const fielderId = fielder.playerId;
  const unmapped = batting.unresolved || bowling.unresolved || fielder.unresolved;
  if (prior) {
    const current = await latestVersion(prior);
    if (!deliveryChanged(current, event)) {
      await noteDuplicate(event);
      return { stored: false, duplicate: true, priced: false, corrected: false, unmapped };
    }
    const revisions = await prisma.cricketEvent.count({ where: { ingestionKey: { startsWith: `${key}:correction:` } } });
    try {
      const correction = await prisma.cricketEvent.create({
        data: {
          matchId: event.matchId,
          innings: event.innings,
          over: event.over,
          ball: event.ball,
          sequence: event.sequence,
          occurredAt: new Date(event.occurredAt),
          eventType: event.eventType,
          battingPlayerId,
          bowlingPlayerId,
          fielderPlayerIds: fielderId ? [fielderId] : [],
          runsBatter: event.runsBatter,
          runsExtras: event.runsExtras,
          runsTotal: event.runsTotal,
          wicketType: event.wicketType,
          isBoundary: event.isBoundary,
          isSix: event.isSix,
          isFour: event.isFour,
          rawDescription: event.rawDescription,
          normalizedDescription: event.normalizedDescription,
          source: event.source,
          sourceEventId: event.sourceEventId,
          sourceTimestamp: event.sourceTimestamp ? new Date(event.sourceTimestamp) : null,
          receivedAt: new Date(),
          confidence: event.confidence,
          ingestionKey: correctionIngestionKey(key, revisions + 1),
          pricingKeys: [],
          correctionState: "ACTIVE",
          correctsEventId: current.id,
        },
      });
      await prisma.cricketEvent.update({
        where: { id: current.id },
        data: { correctionState: "SUPERSEDED", supersededById: correction.id },
      });
      await publishMatchEvent({
        matchId: event.matchId,
        playerId: battingPlayerId,
        eventId: correction.id,
        publishedAt: correction.createdAt.toISOString(),
      });
      return { stored: true, duplicate: false, priced: false, corrected: true, unmapped };
    } catch (error) {
      if (!isUnique(error)) throw error;
      return { stored: false, duplicate: true, priced: false, corrected: false, unmapped };
    }
  }

  const [settings, sourceRow, matchRow, activation, water] = await Promise.all([
    getSettings(),
    prisma.feedSourceState.findUnique({ where: { source: event.source } }),
    prisma.cricketMatch.findUnique({ where: { id: event.matchId }, select: { status: true } }),
    prisma.feedActivation.findUnique({ where: { source_matchId: { source: event.source, matchId: event.matchId } } }),
    prisma.feedHighWater.findUnique({ where: { source_matchId: { source: event.source, matchId: event.matchId } } }),
  ]);
  const operatingMode = sourceRow?.operatingMode ?? (event.source === "DevelopmentSimulator" ? "ACTIVE" : "SHADOW");
  const point: DeliveryPoint = {
    innings: event.innings,
    over: event.over,
    ball: event.ball,
    eventType: event.eventType,
    sourceEventId: event.sourceEventId,
    sequence: event.sequence,
  };
  const context = water && water.contextInnings !== null && water.contextOver !== null && water.contextBall !== null
    ? { innings: water.contextInnings, over: water.contextOver, ball: water.contextBall }
    : null;
  const historicalContext = event.source !== "DevelopmentSimulator" && (
    (!water && isUnderway(point))
    || Boolean(water?.startedMidMatch && context && !isAfterDelivery(point, context))
  );
  const pricedPlayers = pricingActions({
    eventType: event.eventType,
    battingPlayerId,
    bowlingPlayerId,
    fielderPlayerIds: fielderId ? [fielderId] : [],
    wicketType: event.wicketType,
  });
  const priceFeed = canProviderEventAffectPricing({
    source: event.source,
    operatingMode,
    engineAllowsPricing: feedPricingEnabled(settings.engineMode),
    realSourcePricingEnabled: settings.realSourcePricingEnabled,
    eventIngestedAtMs: Date.now(),
    sourceActivatedAtMs: activation?.activatedAt.getTime() ?? null,
    globalPricingEnabledAtMs: settings.realSourcePricingEnabledAt ? Date.parse(settings.realSourcePricingEnabledAt) : null,
    activationCursor: cursorFrom(activation),
    baselinePending: activation?.baselinePending ?? false,
    event: point,
    superseded: false,
    mapped: pricedPlayers.length > 0,
    alreadyPriced: false,
    matchStatus: matchRow?.status ?? "SCHEDULED",
    continuity: water?.continuity ?? "CONTINUOUS",
    historicalContext,
    consensusConfidence: event.consensusConfidence ?? null,
    priceableConfidences: await priceableConsensusConfidences(),
    consensusIdentityConfirmed: event.consensusIdentityConfirmed === true,
  });
  const actions = priceFeed ? pricedPlayers : [];
  const pricingKeys: string[] = [];
  let priced = false;
  for (const action of actions) {
    const applicationKey = pricingKey({
      matchId: event.matchId,
      innings: event.innings,
      over: event.over,
      ball: event.ball,
      kind: action.kind,
      playerId: action.playerId,
    });
    pricingKeys.push(applicationKey);
    try {
      await prisma.matchEvent.create({
        data: {
          playerId: action.playerId,
          overLabel: `${event.over}.${event.ball}`,
          kind: action.kind,
          summary: event.normalizedDescription,
          simulated: false,
          context: "NORMAL",
          idempotencyKey: applicationKey,
        },
      });
      priced = true;
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
  }
  let createdId = "";
  let createdAt = new Date();
  try {
    const created = await prisma.cricketEvent.create({
      data: {
        matchId: event.matchId,
        innings: event.innings,
        over: event.over,
        ball: event.ball,
        sequence: event.sequence,
        occurredAt: new Date(event.occurredAt),
        eventType: event.eventType,
        battingPlayerId,
        bowlingPlayerId,
        fielderPlayerIds: fielderId ? [fielderId] : [],
        runsBatter: event.runsBatter,
        runsExtras: event.runsExtras,
        runsTotal: event.runsTotal,
        wicketType: event.wicketType,
        isBoundary: event.isBoundary,
        isSix: event.isSix,
        isFour: event.isFour,
        rawDescription: event.rawDescription,
        normalizedDescription: event.normalizedDescription,
        source: event.source,
        sourceEventId: event.sourceEventId,
        sourceTimestamp: event.sourceTimestamp ? new Date(event.sourceTimestamp) : null,
        receivedAt: new Date(),
        confidence: event.confidence,
        ingestionKey: key,
        pricingKeys,
        correctionState: "ACTIVE",
      },
    });
    createdId = created.id;
    createdAt = created.createdAt;
  } catch (error) {
    if (!isUnique(error)) throw error;
    return { stored: false, duplicate: true, priced, corrected: false, unmapped };
  }
  await prisma.cricketMatch.update({
    where: { id: event.matchId },
    data: { innings: event.innings, overLabel: `${event.over}.${event.ball}` },
  });
  await advanceHighWater(event, createdAt);
  await publishMatchEvent({
    matchId: event.matchId,
    playerId: battingPlayerId,
    eventId: createdId,
    publishedAt: createdAt.toISOString(),
  });
  return { stored: true, duplicate: false, priced, corrected: false, unmapped };
}

function cursorFrom(row: { activationInnings: number | null; activationOver: number | null; activationBall: number | null } | null): DeliveryPoint | null {
  if (!row || row.activationInnings === null || row.activationOver === null || row.activationBall === null) return null;
  return { innings: row.activationInnings, over: row.activationOver, ball: row.activationBall };
}

async function noteDuplicate(event: NormalizedCricketEvent) {
  if (event.source === "DevelopmentSimulator") return;
  await prisma.feedHighWater.updateMany({
    where: { source: event.source, matchId: event.matchId },
    data: { duplicateCount: { increment: 1 }, lastIngestAt: new Date() },
  });
}

async function advanceHighWater(event: NormalizedCricketEvent, ingestedAt: Date) {
  if (event.source === "DevelopmentSimulator") return;
  const point = { innings: event.innings, over: event.over, ball: event.ball };
  const current = await prisma.feedHighWater.findUnique({ where: { source_matchId: { source: event.source, matchId: event.matchId } } });
  const providerAt = event.sourceTimestamp ? new Date(event.sourceTimestamp) : null;
  if (!current) {
    const mid = isUnderway(point);
    try {
      await prisma.feedHighWater.create({
        data: {
          source: event.source,
          matchId: event.matchId,
          latestProviderEventId: event.sourceEventId,
          latestInnings: event.innings,
          latestOver: event.over,
          latestBall: event.ball,
          latestProviderTimestamp: providerAt,
          latestSequence: event.sequence,
          lastIngestAt: ingestedAt,
          startedMidMatch: mid,
          contextInnings: mid ? event.innings : null,
          contextOver: mid ? event.over : null,
          contextBall: mid ? event.ball : null,
          observedSince: ingestedAt,
        },
      });
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
    return;
  }
  const cursor = current.latestInnings === null || current.latestOver === null || current.latestBall === null
    ? null
    : { innings: current.latestInnings, over: current.latestOver, ball: current.latestBall };
  if (cursor && compareDeliveries(point, cursor) < 0) {
    await prisma.feedHighWater.update({ where: { id: current.id }, data: { lastIngestAt: ingestedAt } });
    return;
  }
  await prisma.feedHighWater.update({
    where: { id: current.id },
    data: {
      latestProviderEventId: event.sourceEventId ?? current.latestProviderEventId,
      latestInnings: event.innings,
      latestOver: event.over,
      latestBall: event.ball,
      latestProviderTimestamp: providerAt ?? current.latestProviderTimestamp,
      latestSequence: event.sequence,
      lastIngestAt: ingestedAt,
    },
  });
}

async function openFeedIncident(input: { matchId?: string | null; source: string; type: string; severity: string }) {
  const matchId = input.matchId ?? null;
  const existing = await prisma.feedIncident.findFirst({
    where: { source: input.source, type: input.type, matchId, resolvedAt: null },
  });
  if (existing) return;
  await prisma.feedIncident.create({
    data: { matchId, source: input.source, type: input.type, severity: input.severity },
  });
}

async function resolveFeedIncidents(input: { matchId?: string | null; source: string; type: string; resolution: string }) {
  await prisma.feedIncident.updateMany({
    where: { source: input.source, type: input.type, matchId: input.matchId ?? null, resolvedAt: null },
    data: { resolvedAt: new Date(), resolution: input.resolution },
  });
}

async function recordPoll(source: string, input: { ok?: boolean; outcome?: string; latencyMs: number; eventAt: Date | null }) {
  const current = await prisma.feedSourceState.findUnique({ where: { source } });
  if (!current) return;
  const outcome = input.outcome ?? (input.ok === false ? "HTTP_ERROR" : "OK");
  const failure = pollCountsAsFailure(outcome);
  const consecutiveFailures = failure ? current.consecutiveFailures + 1 : 0;
  const status = nextSourceHealth({ enabled: current.enabled, consecutiveFailures });
  await prisma.feedSourceState.update({
    where: { source },
    data: {
      consecutiveFailures,
      successCount: current.successCount + (failure ? 0 : 1),
      failureCount: current.failureCount + (failure ? 1 : 0),
      latencyTotalMs: current.latencyTotalMs + Math.max(0, input.latencyMs),
      latencySamples: current.latencySamples + 1,
      lastSuccessfulPoll: failure ? current.lastSuccessfulPoll : new Date(),
      lastEventAt: input.eventAt ?? current.lastEventAt,
      lastPollLatencyMs: Math.max(0, input.latencyMs),
      lastPollOutcome: outcome,
      lastAttemptAt: new Date(),
      status,
    },
  });
  if (status === "DOWN") await openFeedIncident({ source, type: "SOURCE_DOWN", severity: "high" });
  else if (status === "HEALTHY") await resolveFeedIncidents({ source, type: "SOURCE_DOWN", resolution: "Source recovered" });
  if (outcome === "PARSE_ERROR" && consecutiveFailures >= 3) {
    await openFeedIncident({ source, type: "REPEATED_PARSE_FAILURE", severity: "high" });
  }
  if (!failure) await resolveFeedIncidents({ source, type: "REPEATED_PARSE_FAILURE", resolution: "Parsing succeeded" });
}

export async function runFeedCycle(now = new Date()): Promise<{ polled: boolean; source: string | null; stored: number }> {
  await ensureFeedConfig();
  const control = await prisma.feedControl.findUniqueOrThrow({ where: { id: "default" } });
  if (control.lastPolledAt && now.getTime() - control.lastPolledAt.getTime() < control.pollIntervalSeconds * 1000) {
    return { polled: false, source: control.activeSource, stored: 0 };
  }
  const sources = await prisma.feedSourceState.findMany({ orderBy: { priority: "asc" } });
  const chosen = chooseActiveSource(
    sources.map((source) => ({
      source: source.source,
      priority: source.priority,
      enabled: source.enabled,
      status: source.status as SourceHealth,
    })),
  );
  if (chosen !== control.activeSource) {
    await prisma.feedFailover.create({
      data: {
        oldSource: control.activeSource,
        newSource: chosen,
        reason: chosen ? `${control.activeSource ?? "none"} is not the healthiest eligible source` : "No eligible source is healthy",
      },
    });
  }
  await prisma.feedControl.update({
    where: { id: "default" },
    data: { activeSource: chosen, lastPolledAt: now },
  });
  if (!chosen) return { polled: true, source: null, stored: 0 };

  const started = Date.now();
  try {
    const matches = await prisma.cricketMatch.findMany({ where: { status: "LIVE" } });
    const externalIds = await prisma.cricketMatchExternalId.findMany({
      where: { source: chosen, matchId: { in: matches.map((match) => match.id) } },
    });
    const externalByMatch = new Map(externalIds.map((row) => [row.matchId, row.externalId]));
    const polls = [];
    for (const match of matches) {
      const mapped = await prisma.playerFeedMapping.findMany({
        where: { source: chosen, matchId: match.id, mappingStatus: "MAPPED" },
        orderBy: { externalPlayerId: "asc" },
      });
      const batter = mapped[0];
      const bowler = mapped[1] ?? mapped[0];
      if (!batter || !bowler) continue;
      const cursor = await prisma.cricketEvent.count({ where: { matchId: match.id, source: chosen, correctsEventId: null } });
      polls.push({
        matchId: match.id,
        cursor,
        battingExternalId: batter.externalPlayerId,
        bowlingExternalId: bowler.externalPlayerId,
        externalMatchId: externalByMatch.get(match.id) ?? null,
      });
    }
    const events = await feedSource(chosen).poll({ matches: polls, now });
    let stored = 0;
    let unresolved = false;
    for (const event of events) {
      const result = await ingestNormalizedEvent(event);
      if (result.stored) stored += 1;
      if (result.unmapped) unresolved = true;
    }
    const openMappings = await prisma.playerFeedMapping.count({
      where: { source: chosen, mappingStatus: { in: ["UNMAPPED", "NEEDS_REVIEW"] } },
    });
    const outcome = events.length === 0 ? "NO_NEW_EVENT" : unresolved || openMappings > 0 ? "MAPPING_REQUIRED" : "OK";
    await recordPoll(chosen, {
      outcome,
      latencyMs: Date.now() - started,
      eventAt: events[0] ? new Date(events[0].occurredAt) : null,
    });
    return { polled: true, source: chosen, stored };
  } catch (error) {
    await recordPoll(chosen, { outcome: pollOutcomeOf(error), latencyMs: Date.now() - started, eventAt: null });
    console.error(JSON.stringify({
      level: "error",
      message: error instanceof Error ? error.message : "feed poll failed",
      at: new Date().toISOString(),
    }));
    return { polled: true, source: chosen, stored: 0 };
  }
}

export async function feedBoard() {
  await ensureFeedConfig();
  const [matches, sources, control, failovers, unmapped, discovered, latencyRows, cricbuzzActivation] = await Promise.all([
    prisma.cricketMatch.findMany({ orderBy: { scheduledAt: "desc" }, include: { events: { orderBy: { createdAt: "desc" }, take: 1 }, _count: { select: { events: true } } } }),
    prisma.feedSourceState.findMany({ orderBy: { priority: "asc" } }),
    prisma.feedControl.findUniqueOrThrow({ where: { id: "default" } }),
    prisma.feedFailover.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.playerFeedMapping.count({ where: { mappingStatus: { in: ["UNMAPPED", "NEEDS_REVIEW"] } } }),
    prisma.discoveredCricketMatch.findMany({ orderBy: [{ indiaInternational: "desc" }, { scheduledAt: "asc" }], take: 40 }),
    prisma.cricketEvent.findMany({
      where: { source: "Cricbuzz", sourceTimestamp: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { createdAt: true, sourceTimestamp: true },
    }),
    sourceActivationBlockers("Cricbuzz"),
  ]);
  const ingestLatencyP50Ms = latencyP50Ms(
    latencyRows.flatMap((row) => {
      const latency = ingestLatencyMs(row.sourceTimestamp?.getTime() ?? null, row.createdAt.getTime());
      return latency === null ? [] : [latency];
    }),
  );
  const applicationKeys = matches.flatMap((match) => match.events.flatMap((event) => event.pricingKeys));
  const applications = applicationKeys.length
    ? await prisma.priceApplication.count({ where: { eventKey: { in: applicationKeys.map((key) => `match:${key}`) } } })
    : 0;
  return { matches, sources, control, failovers, unmapped, applications, discovered, ingestLatencyP50Ms, cricbuzzActivation };
}

export async function matchFeedDetail(matchId: string) {
  await ensureFeedConfig();
  const match = await prisma.cricketMatch.findUnique({
    where: { id: matchId },
    include: {
      externalIds: true,
      events: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
  if (!match) return null;
  const pricingKeys = match.events.flatMap((event) => event.pricingKeys);
  const externalMatchId = match.externalIds.find((row) => row.source === "Cricbuzz")?.externalId ?? null;
  const [mappings, players, sources, applications, priceApplications, snapshots, settings] = await Promise.all([
    prisma.playerFeedMapping.findMany({ where: { matchId }, orderBy: { externalPlayerName: "asc" } }),
    prisma.player.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.feedSourceState.findMany({ orderBy: { priority: "asc" } }),
    prisma.matchEvent.findMany({
      where: { idempotencyKey: { in: pricingKeys } },
      select: { idempotencyKey: true, kind: true, playerId: true },
    }),
    prisma.priceApplication.findMany({
      where: { eventKey: { in: pricingKeys.map((key) => `match:${key}`) } },
      select: { eventKey: true, tickId: true },
    }),
    externalMatchId
      ? prisma.feedSnapshot.findMany({
          where: { source: "Cricbuzz", externalMatchId },
          orderBy: { createdAt: "desc" },
          take: 8,
        })
      : Promise.resolve([]),
    getSettings(),
  ]);
  const tickByKey = new Map(priceApplications.map((row) => [row.eventKey, row.tickId]));
  const debug = match.events.map((event) => ({
    eventId: event.id,
    source: event.source,
    sourceEventId: event.sourceEventId,
    eventType: event.eventType,
    description: event.normalizedDescription,
    ingestionKey: event.ingestionKey,
    pricingKeys: event.pricingKeys,
    tickId: event.pricingKeys.map((key) => tickByKey.get(`match:${key}`) ?? null).find((id) => id) ?? null,
    createdAt: event.createdAt.toISOString(),
    sourceTimestamp: event.sourceTimestamp?.toISOString() ?? null,
    latencyMs: ingestLatencyMs(event.sourceTimestamp?.getTime() ?? null, event.createdAt.getTime()),
    mapping: event.battingPlayerId || event.bowlingPlayerId ? "MAPPED" : "UNMAPPED",
    wouldPriceAs: wouldPriceAs(event),
    correctionState: event.correctionState,
    correctsEventId: event.correctsEventId,
    supersededById: event.supersededById,
    acknowledgedAt: event.acknowledgedAt?.toISOString() ?? null,
  }));
  const cricbuzz = match.events.find((event) => event.source === "Cricbuzz") ?? null;
  const reference = match.events.find((event) => event.source !== "Cricbuzz") ?? null;
  const cricbuzzSource = sources.find((source) => source.source === "Cricbuzz");
  const shadow = {
    cricbuzz,
    reference,
    providerTimestamp: cricbuzz?.sourceTimestamp?.toISOString() ?? null,
    ingestTimestamp: cricbuzz?.createdAt.toISOString() ?? null,
    latencyMs: cricbuzz ? ingestLatencyMs(cricbuzz.sourceTimestamp?.getTime() ?? null, cricbuzz.createdAt.getTime()) : null,
    mapping: cricbuzz ? (cricbuzz.battingPlayerId || cricbuzz.bowlingPlayerId ? "MAPPED" : "UNMAPPED") : "NONE",
    dedupe: cricbuzz ? (cricbuzz.correctsEventId ? "correction" : cricbuzz.correctionState) : "NONE",
    wouldPriceAs: cricbuzz ? wouldPriceAs(cricbuzz) : [],
    operatingMode: cricbuzzSource?.operatingMode ?? "SHADOW",
    realSourcePricingEnabled: settings.realSourcePricingEnabled,
    pollLatencyMs: cricbuzzSource?.lastPollLatencyMs ?? null,
    pollOutcome: cricbuzzSource?.lastPollOutcome ?? null,
  };
  const suggestions = mappings.map((mapping) => ({
    mappingId: mapping.id,
    suggestion: mapping.mappingStatus === "MAPPED" ? null : suggestPlayerMatch(mapping.externalPlayerName, players),
  }));
  const [highWater, activation, score, incidents, control] = await Promise.all([
    prisma.feedHighWater.findUnique({ where: { source_matchId: { source: "Cricbuzz", matchId } } }),
    prisma.feedActivation.findUnique({ where: { source_matchId: { source: "Cricbuzz", matchId } } }),
    prisma.matchScoreSnapshot.findFirst({ where: { matchId, source: "Cricbuzz" }, orderBy: { ingestedAt: "desc" } }),
    prisma.feedIncident.findMany({ where: { matchId, resolvedAt: null }, orderBy: { openedAt: "desc" }, take: 8 }),
    prisma.feedControl.findUnique({ where: { id: "default" } }),
  ]);
  const [observedCount, mappedCount, correctionCount] = await Promise.all([
    prisma.cricketEvent.count({ where: { matchId, source: "Cricbuzz" } }),
    prisma.cricketEvent.count({ where: { matchId, source: "Cricbuzz", OR: [{ battingPlayerId: { not: null } }, { bowlingPlayerId: { not: null } }] } }),
    prisma.cricketEvent.count({ where: { matchId, source: "Cricbuzz", OR: [{ correctsEventId: { not: null } }, { correctionState: "SUPERSEDED" }] } }),
  ]);
  const cricbuzzEvents = match.events.filter((event) => event.source === "Cricbuzz");
  const samples = cricbuzzEvents.flatMap((event) => {
    const latency = ingestLatencyMs(event.sourceTimestamp?.getTime() ?? null, event.createdAt.getTime());
    return latency === null ? [] : [latency];
  });
  const participatingMapped = mappings.filter((mapping) => mapping.mappingStatus === "MAPPED" && mapping.internalPlayerId && participationJoinsLive(mapping.participationStatus)).length;
  const unresolvedMappings = mappings.filter((mapping) => mapping.mappingStatus !== "MAPPED").length;
  const continuityView = {
    highWater,
    activation,
    score,
    incidents,
    gapPolicy: control?.gapSafetyPolicy ?? "PAUSE_NEW_BUYS_FOR_AFFECTED_PLAYERS",
    globalPricingEnabledAt: settings.realSourcePricingEnabledAt,
    quality: shadowQuality({
      observed: observedCount,
      mapped: mappedCount,
      duplicates: highWater?.duplicateCount ?? 0,
      corrections: correctionCount,
      possibleGaps: highWater?.possibleGapCount ?? 0,
      recoveredGaps: highWater?.recoveredGapCount ?? 0,
      unresolvedGaps: highWater?.unresolvedGapCount ?? 0,
      parseFailures: highWater?.parseFailureCount ?? 0,
      pollLatencyMs: cricbuzzSource?.lastPollLatencyMs ?? null,
      ingestP50Ms: latencyP50Ms(samples),
      ingestP95Ms: latencyP95Ms(samples),
      startedAtMs: highWater?.observedSince?.getTime() ?? null,
      nowMs: Date.now(),
    }),
    checklist: activationChecklist({
      imported: Boolean(externalMatchId),
      participatingMapped,
      unresolved: unresolvedMappings,
      health: cricbuzzSource?.status ?? "DISABLED",
      lastOutcome: cricbuzzSource?.lastPollOutcome ?? null,
      continuity: highWater?.continuity ?? "CONTINUOUS",
      reconciliation: score?.reconciliation ?? "UNKNOWN",
      shadowEvents: observedCount,
      shadowStartedAtMs: highWater?.observedSince?.getTime() ?? null,
      nowMs: Date.now(),
      realSourcePricingEnabled: settings.realSourcePricingEnabled,
    }),
  };
  const validation = await shadowValidationForMatch(matchId);
  return { match, mappings, players, sources, applications, debug, shadow, snapshots, suggestions, continuity: continuityView, validation };
}

export async function listFeedHealth() {
  await ensureFeedConfig();
  const [sources, control, failovers] = await Promise.all([
    prisma.feedSourceState.findMany({ orderBy: { priority: "asc" } }),
    prisma.feedControl.findUniqueOrThrow({ where: { id: "default" } }),
    prisma.feedFailover.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  return { sources, control, failovers };
}

export function averageLatencyMs(total: number, samples: number): number | null {
  if (samples <= 0) return null;
  return Math.round(total / samples);
}

export async function createCricketMatch(input: {
  competition: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  scheduledAt: Date;
  source: string;
  externalId: string;
}) {
  return prisma.cricketMatch.create({
    data: {
      competition: input.competition,
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      venue: input.venue,
      scheduledAt: input.scheduledAt,
      externalIds: { create: { source: input.source, externalId: input.externalId } },
    },
  });
}

async function stillLiveElsewhere(playerId: string, matchId: string): Promise<boolean> {
  const mappings = await prisma.playerFeedMapping.findMany({
    where: { internalPlayerId: playerId, matchId: { not: matchId }, mappingStatus: "MAPPED" },
    select: { matchId: true, participationStatus: true },
  });
  const matchIds = mappings
    .filter((row) => row.matchId && participationJoinsLive(row.participationStatus))
    .map((row) => row.matchId)
    .filter((id): id is string => Boolean(id));
  if (matchIds.length === 0) return false;
  const live = await prisma.cricketMatch.count({ where: { id: { in: matchIds }, status: { in: ["LIVE", "INNINGS_BREAK"] } } });
  return live > 0;
}

async function applyLiveTransition(matchId: string, previous: string, next: string) {
  const mappings = await prisma.playerFeedMapping.findMany({
    where: { matchId, mappingStatus: "MAPPED", internalPlayerId: { not: null } },
    select: { internalPlayerId: true, participationStatus: true },
  });
  for (const mapping of mappings) {
    if (!mapping.internalPlayerId || !participationJoinsLive(mapping.participationStatus)) continue;
    const player = await prisma.player.findUnique({
      where: { id: mapping.internalPlayerId },
      select: { id: true, liveMatch: true, midPricePaise: true },
    });
    if (!player) continue;
    const elsewhere = await stillLiveElsewhere(player.id, matchId);
    const plan = planPlayerLiveTransition({
      previousMatchStatus: previous,
      nextMatchStatus: next,
      playerAlreadyLive: player.liveMatch,
      stillLiveElsewhere: elsewhere,
    });
    await prisma.player.update({
      where: { id: player.id },
      data: {
        liveMatch: plan.liveMatch,
        ...(plan.setAnchor ? { matchAnchorPaise: player.midPricePaise, performanceMatchBps: 0 } : {}),
        ...(!plan.setAnchor && plan.clearPerformance ? { performanceMatchBps: 0 } : {}),
      },
    });
  }
}

export async function setMatchStatus(matchId: string, status: MatchStatus) {
  if (!(MATCH_STATUSES as readonly string[]).includes(status)) throw new AppError("INVALID", "That match status is not recognised.", 400);
  const match = await prisma.cricketMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new AppError("NOT_FOUND", "That match was not found.", 404);
  if (match.status === status) return match.status;
  await prisma.cricketMatch.update({ where: { id: matchId }, data: { status } });
  await applyLiveTransition(matchId, match.status, status);
  if (status === "COMPLETED" || status === "ABANDONED") await freezeShadowSummary(matchId);
  await publishMarketStatus({ matchId, publishedAt: new Date().toISOString() });
  return match.status;
}

export async function mapFeedPlayer(input: {
  matchId: string;
  source: string;
  externalPlayerId: string;
  externalPlayerName: string;
  internalPlayerId: string;
  participationStatus?: string;
}) {
  const participation = input.participationStatus ?? "SQUAD";
  if (!isParticipationStatus(participation)) throw new AppError("INVALID", "That participation status is not recognised.", 400);
  const player = await prisma.player.findUnique({ where: { id: input.internalPlayerId }, select: { id: true } });
  if (!player) throw new AppError("NOT_FOUND", "That player was not found.", 404);
  const match = await prisma.cricketMatch.findUnique({ where: { id: input.matchId }, select: { id: true, status: true } });
  if (!match) throw new AppError("NOT_FOUND", "That match was not found.", 404);
  await prisma.playerFeedMapping.upsert({
    where: { source_externalPlayerId: { source: input.source, externalPlayerId: input.externalPlayerId } },
    create: {
      matchId: input.matchId,
      source: input.source,
      externalPlayerId: input.externalPlayerId,
      externalPlayerName: input.externalPlayerName,
      internalPlayerId: input.internalPlayerId,
      mappingStatus: "MAPPED",
      participationStatus: participation,
      lastVerifiedAt: new Date(),
    },
    update: {
      matchId: input.matchId,
      externalPlayerName: input.externalPlayerName,
      internalPlayerId: input.internalPlayerId,
      mappingStatus: "MAPPED",
      participationStatus: participation,
      lastVerifiedAt: new Date(),
    },
  });
  if (match.status === "LIVE" || match.status === "INNINGS_BREAK") {
    if (participationJoinsLive(participation)) {
      await applyLiveTransition(match.id, "SCHEDULED", match.status);
    } else if (!(await stillLiveElsewhere(input.internalPlayerId, match.id))) {
      await prisma.player.update({
        where: { id: input.internalPlayerId },
        data: { liveMatch: false, performanceMatchBps: 0 },
      });
    }
  }
}

export async function setSourceEnabled(source: string, enabled: boolean) {
  const row = await prisma.feedSourceState.findUnique({ where: { source } });
  if (!row) throw new AppError("NOT_FOUND", "That source was not found.", 404);
  const status = nextSourceHealth({ enabled, consecutiveFailures: enabled ? row.consecutiveFailures : 0 });
  await prisma.feedSourceState.update({
    where: { source },
    data: { enabled, status, consecutiveFailures: enabled ? row.consecutiveFailures : 0 },
  });
}

export async function setSourcePriority(source: string, priority: number) {
  if (!Number.isInteger(priority) || priority < 1 || priority > 20) throw new AppError("INVALID", "Priority must be from 1 to 20.", 400);
  const row = await prisma.feedSourceState.findUnique({ where: { source } });
  if (!row) throw new AppError("NOT_FOUND", "That source was not found.", 404);
  await prisma.feedSourceState.update({ where: { source }, data: { priority } });
}

export async function failoverTo(source: string, reason: string) {
  const row = await prisma.feedSourceState.findUnique({ where: { source } });
  if (!row?.enabled || row.status === "DOWN" || row.status === "DISABLED") {
    throw new AppError("INVALID", "Choose an enabled source that is not down.", 400);
  }
  const control = await prisma.feedControl.findUniqueOrThrow({ where: { id: "default" } });
  await prisma.feedFailover.create({
    data: { oldSource: control.activeSource, newSource: source, reason },
  });
  await prisma.feedControl.update({ where: { id: "default" }, data: { activeSource: source } });
}

export async function restartFeedSource(source: string) {
  const row = await prisma.feedSourceState.findUnique({ where: { source } });
  if (!row) throw new AppError("NOT_FOUND", "That source was not found.", 404);
  const status = nextSourceHealth({ enabled: row.enabled, consecutiveFailures: 0 });
  await prisma.feedSourceState.update({
    where: { source },
    data: { consecutiveFailures: 0, status },
  });
}

async function storeFeedSnapshot(input: { source: string; externalMatchId?: string | null; kind: string; outcome: string; body: unknown }) {
  const text = boundedJson(input.body);
  await prisma.feedSnapshot.create({
    data: {
      source: input.source,
      externalMatchId: input.externalMatchId ?? null,
      kind: input.kind,
      outcome: input.outcome,
      body: text,
      bytes: text.length,
    },
  });
  const stale = await prisma.feedSnapshot.findMany({
    where: { source: input.source },
    orderBy: { createdAt: "desc" },
    skip: SNAPSHOT_KEEP,
    select: { id: true },
  });
  if (stale.length > 0) await prisma.feedSnapshot.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
}

export async function sourceActivationBlockers(source: string): Promise<string[]> {
  const row = await prisma.feedSourceState.findUnique({ where: { source } });
  const links = await prisma.cricketMatchExternalId.findMany({ where: { source }, include: { match: true } });
  const open = links.filter((link) => link.match.status !== "COMPLETED" && link.match.status !== "ABANDONED");
  const matches = [];
  for (const link of open) {
    const mappings = await prisma.playerFeedMapping.findMany({ where: { source, matchId: link.matchId } });
    matches.push({
      label: `${link.match.homeTeam} vs ${link.match.awayTeam}`,
      participatingMapped: mappings.filter((mapping) => mapping.mappingStatus === "MAPPED" && mapping.internalPlayerId && participationJoinsLive(mapping.participationStatus)).length,
      unresolved: mappings.filter((mapping) => mapping.mappingStatus !== "MAPPED" && participationJoinsLive(mapping.participationStatus)).length,
    });
  }
  const waters = open.length
    ? await prisma.feedHighWater.findMany({ where: { source, matchId: { in: open.map((link) => link.matchId) } } })
    : [];
  const snapshots = open.length
    ? await prisma.matchScoreSnapshot.findMany({
        where: { source, matchId: { in: open.map((link) => link.matchId) } },
        orderBy: { ingestedAt: "desc" },
        take: 20,
      })
    : [];
  const continuity = waters.some((item) => item.continuity === "UNRESOLVED_GAP")
    ? "UNRESOLVED_GAP"
    : waters.some((item) => item.continuity === "POSSIBLE_GAP")
      ? "POSSIBLE_GAP"
      : null;
  const latestByMatch = new Map<string, string>();
  for (const snapshot of snapshots) {
    if (!latestByMatch.has(snapshot.matchId)) latestByMatch.set(snapshot.matchId, snapshot.reconciliation);
  }
  const reconciliation = [...latestByMatch.values()].includes("CONFLICT")
    ? "CONFLICT"
    : [...latestByMatch.values()].includes("BEHIND")
      ? "BEHIND"
      : null;
  return activationBlockers({
    matches,
    health: row?.status ?? "DISABLED",
    lastOutcome: row?.lastPollOutcome ?? null,
    continuity,
    reconciliation,
  });
}

export async function importDiscoveredMatch(input: { discoveredId: string; actorId?: string | null; reason: string; ip?: string | null }) {
  const reason = requireReason(input.reason);
  const discovered = await prisma.discoveredCricketMatch.findUnique({ where: { id: input.discoveredId } });
  if (!discovered) throw new AppError("NOT_FOUND", "That discovered match was not found.", 404);
  if (discovered.importedMatchId) return { matchId: discovered.importedMatchId };
  const existing = await prisma.cricketMatchExternalId.findUnique({
    where: { source_externalId: { source: discovered.source, externalId: discovered.externalId } },
  });
  const match = existing
    ? await prisma.cricketMatch.findUniqueOrThrow({ where: { id: existing.matchId } })
    : await createCricketMatch({
        competition: discovered.competition,
        homeTeam: discovered.homeTeam,
        awayTeam: discovered.awayTeam,
        venue: discovered.venue,
        scheduledAt: discovered.scheduledAt,
        source: discovered.source,
        externalId: discovered.externalId,
      });
  await prisma.discoveredCricketMatch.update({ where: { id: discovered.id }, data: { importedMatchId: match.id } });
  await writeAudit({
    actorId: input.actorId,
    action: "feed.match_import",
    entityType: "CricketMatch",
    entityId: match.id,
    after: { source: discovered.source, externalId: discovered.externalId, status: match.status },
    reason,
    ip: input.ip,
  });
  return { matchId: match.id };
}

export async function setSourceOperatingMode(input: {
  source: string;
  mode: string;
  confirmSwitch: boolean;
  actorId?: string | null;
  reason: string;
  ip?: string | null;
}) {
  const reason = requireReason(input.reason);
  if (!isSourceOperatingMode(input.mode)) throw new AppError("INVALID", "That source mode is not recognised.", 400);
  const row = await prisma.feedSourceState.findUnique({ where: { source: input.source } });
  if (!row) throw new AppError("NOT_FOUND", "That source was not found.", 404);
  if (input.mode === "ACTIVE") {
    const others = await prisma.feedSourceState.findMany({ where: { operatingMode: "ACTIVE", source: { not: input.source } } });
    if (others.length > 0 && !input.confirmSwitch) {
      throw new AppError(
        "CONFIRM_REQUIRED",
        `Another source is already active (${others.map((item) => item.source).join(", ")}). Confirm the source switch.`,
        409,
      );
    }
    const blockers = await sourceActivationBlockers(input.source);
    if (blockers.length > 0) {
      throw new AppError("INVALID", blockers.join(" "), 400, Object.fromEntries(blockers.map((item, index) => [`check${index + 1}`, item])));
    }
    if (input.confirmSwitch && others.length > 0) {
      await prisma.feedSourceState.updateMany({
        where: { source: { in: others.map((item) => item.source) } },
        data: { operatingMode: "SHADOW" },
      });
    }
  }
  const enabled = input.mode !== "DISABLED";
  const status = nextSourceHealth({ enabled, consecutiveFailures: enabled ? row.consecutiveFailures : 0 });
  await prisma.feedSourceState.update({
    where: { source: input.source },
    data: {
      operatingMode: input.mode,
      enabled,
      status,
      consecutiveFailures: enabled ? row.consecutiveFailures : 0,
    },
  });
  if (input.mode === "ACTIVE") {
    const activatedAt = new Date();
    const links = await prisma.cricketMatchExternalId.findMany({ where: { source: input.source }, include: { match: true } });
    for (const link of links) {
      if (link.match.status === "COMPLETED" || link.match.status === "ABANDONED") continue;
      const water = await prisma.feedHighWater.findUnique({ where: { source_matchId: { source: input.source, matchId: link.matchId } } });
      const hasCursor = water?.latestInnings !== null && water?.latestInnings !== undefined && water.latestOver !== null && water.latestBall !== null;
      await prisma.feedActivation.upsert({
        where: { source_matchId: { source: input.source, matchId: link.matchId } },
        create: {
          source: input.source,
          matchId: link.matchId,
          activatedAt,
          activationEventCursor: water?.latestProviderEventId ?? null,
          activationInnings: hasCursor ? water?.latestInnings ?? null : null,
          activationOver: hasCursor ? water?.latestOver ?? null : null,
          activationBall: hasCursor ? water?.latestBall ?? null : null,
          activationSequence: water?.latestSequence ?? null,
          baselinePending: !hasCursor,
          activatedBy: input.actorId ?? null,
          activationReason: reason,
        },
        update: {
          activatedAt,
          activationEventCursor: water?.latestProviderEventId ?? null,
          activationInnings: hasCursor ? water?.latestInnings ?? null : null,
          activationOver: hasCursor ? water?.latestOver ?? null : null,
          activationBall: hasCursor ? water?.latestBall ?? null : null,
          activationSequence: water?.latestSequence ?? null,
          baselinePending: !hasCursor,
          activatedBy: input.actorId ?? null,
          activationReason: reason,
        },
      });
    }
  }
  await writeAudit({
    actorId: input.actorId,
    action: "feed.source_mode",
    entityType: "FeedSourceState",
    entityId: input.source,
    before: { operatingMode: row.operatingMode },
    after: { operatingMode: input.mode },
    reason,
    ip: input.ip,
  });
}

export async function acknowledgeCorrection(input: { eventId: string; actorId?: string | null; reason: string; ip?: string | null }) {
  const reason = requireReason(input.reason);
  const event = await prisma.cricketEvent.findUnique({ where: { id: input.eventId } });
  if (!event || (!event.correctsEventId && event.correctionState !== "SUPERSEDED")) {
    throw new AppError("INVALID", "Choose a corrected event.", 400);
  }
  await prisma.cricketEvent.update({
    where: { id: event.id },
    data: { acknowledgedAt: new Date(), acknowledgedBy: input.actorId ?? null },
  });
  await writeAudit({
    actorId: input.actorId,
    action: "feed.correction_acknowledge",
    entityType: "CricketEvent",
    entityId: event.id,
    before: { correctionState: event.correctionState, correctsEventId: event.correctsEventId },
    after: { acknowledged: true },
    reason,
    ip: input.ip,
  });
}

async function rememberObservedGap(input: {
  source: string;
  matchId: string;
  previous: DeliveryPoint;
  next: DeliveryPoint;
  recoveryResult: string;
}) {
  const slotSpan = Math.max(0, slotsBetween(input.previous, input.next));
  const existing = await prisma.feedGapRecord.findFirst({
    where: {
      matchId: input.matchId,
      source: input.source,
      previousInnings: input.previous.innings,
      previousOver: input.previous.over,
      previousBall: input.previous.ball,
      nextInnings: input.next.innings,
      nextOver: input.next.over,
      nextBall: input.next.ball,
    },
  });
  if (existing) {
    if (existing.recoveryResult !== input.recoveryResult) {
      await prisma.feedGapRecord.update({ where: { id: existing.id }, data: { recoveryResult: input.recoveryResult, slotSpan } });
    }
    return;
  }
  await prisma.feedGapRecord.create({
    data: {
      matchId: input.matchId,
      source: input.source,
      previousInnings: input.previous.innings,
      previousOver: input.previous.over,
      previousBall: input.previous.ball,
      previousProviderEventId: input.previous.sourceEventId ?? null,
      previousSequence: input.previous.sequence ?? null,
      nextInnings: input.next.innings,
      nextOver: input.next.over,
      nextBall: input.next.ball,
      nextProviderEventId: input.next.sourceEventId ?? null,
      nextSequence: input.next.sequence ?? null,
      slotSpan,
      recoveryResult: input.recoveryResult,
    },
  });
}

export async function storeUnclassifiedEvents(rows: UnclassifiedProviderEvent[]) {
  for (const row of rows) {
    await prisma.feedUnclassifiedEvent.upsert({
      where: { source_sourceEventId: { source: row.source, sourceEventId: row.sourceEventId } },
      create: {
        matchId: row.matchId,
        source: row.source,
        innings: row.innings,
        over: row.over,
        ball: row.ball,
        sequence: row.sequence,
        providerCode: row.providerCode,
        rawDescription: row.rawDescription,
        sourceEventId: row.sourceEventId,
        sourceTimestamp: row.sourceTimestamp ? new Date(row.sourceTimestamp) : null,
      },
      update: {},
    });
  }
}

export async function shadowValidationForMatch(matchId: string, now = new Date()) {
  const match = await prisma.cricketMatch.findUnique({
    where: { id: matchId },
    select: { id: true, homeTeam: true, awayTeam: true, externalIds: { where: { source: "Cricbuzz" }, select: { externalId: true } } },
  });
  if (!match) return null;
  const sourceName = "Cricbuzz";
  const [events, unclassified, mappings, players, gaps, water, score, notes, source, incidents, downtime, signoff] = await Promise.all([
    prisma.cricketEvent.findMany({
      where: { matchId, source: sourceName },
      orderBy: { createdAt: "asc" },
      select: {
        eventType: true,
        wicketType: true,
        battingPlayerId: true,
        bowlingPlayerId: true,
        fielderPlayerIds: true,
        sourceTimestamp: true,
        receivedAt: true,
        createdAt: true,
        correctsEventId: true,
        correctionState: true,
        acknowledgedAt: true,
        over: true,
        ball: true,
        normalizedDescription: true,
      },
    }),
    prisma.feedUnclassifiedEvent.findMany({ where: { matchId, source: sourceName }, select: { providerCode: true } }),
    prisma.playerFeedMapping.findMany({ where: { matchId, source: sourceName } }),
    prisma.player.findMany({ select: { id: true, name: true } }),
    prisma.feedGapRecord.findMany({ where: { matchId, source: sourceName }, orderBy: { createdAt: "asc" } }),
    prisma.feedHighWater.findUnique({ where: { source_matchId: { source: sourceName, matchId } } }),
    prisma.matchScoreSnapshot.findFirst({ where: { matchId, source: sourceName }, orderBy: { ingestedAt: "desc" } }),
    prisma.feedReconciliationNote.findMany({ where: { matchId, source: sourceName, state: "CONFLICT" }, orderBy: { observedAt: "desc" }, take: 20 }),
    prisma.feedSourceState.findUnique({ where: { source: sourceName } }),
    prisma.feedIncident.findMany({ where: { matchId, source: sourceName, resolvedAt: null }, select: { type: true } }),
    prisma.feedIncident.findMany({ where: { source: sourceName, type: "SOURCE_DOWN" }, select: { openedAt: true, resolvedAt: true, matchId: true } }),
    prisma.shadowMatchSignoff.findUnique({ where: { matchId_source: { matchId, source: sourceName } } }),
  ]);
  const startedAt = water?.observedSince ?? null;
  const sourceSwitches = startedAt
    ? await prisma.auditLog.count({ where: { action: "feed.source_mode", createdAt: { gte: startedAt } } })
    : null;
  const openIncidents = incidents.map((incident) => incident.type);
  if (downtime.some((incident) => incident.matchId === null && incident.resolvedAt === null)) openIncidents.push("SOURCE_DOWN");
  const conflicts: ReconciliationConflict[] = notes.map((note) => ({
    expectedRuns: note.expectedRuns,
    expectedWickets: note.expectedWickets,
    providerRuns: note.providerRuns,
    providerWickets: note.providerWickets,
    providerOvers: note.providerOvers,
    lastKnownEvent: note.lastKnownEvent,
    observedAt: note.observedAt.toISOString(),
  }));
  const stored = signoff?.summaryFrozenAt ? storedCompletion(signoff.summary) : null;
  return buildShadowValidation({
    match: `${match.homeTeam} vs ${match.awayTeam}`,
    source: sourceName,
    nowMs: now.getTime(),
    imported: match.externalIds.length > 0,
    shadowStartedAt: startedAt?.toISOString() ?? null,
    events: events.map((event) => ({
      eventType: event.eventType,
      wicketType: event.wicketType,
      battingPlayerId: event.battingPlayerId,
      bowlingPlayerId: event.bowlingPlayerId,
      fielderPlayerIds: event.fielderPlayerIds,
      sourceTimestampMs: event.sourceTimestamp?.getTime() ?? null,
      receivedAtMs: event.receivedAt?.getTime() ?? null,
      storedAtMs: event.createdAt.getTime(),
      correctsEventId: event.correctsEventId,
      correctionState: event.correctionState,
      acknowledgedAt: event.acknowledgedAt?.toISOString() ?? null,
      label: `${event.eventType} · ${event.over}.${event.ball} · ${event.normalizedDescription}`,
    })),
    unclassified,
    mappings: mappings.map((mapping) => ({
      externalPlayerId: mapping.externalPlayerId,
      externalPlayerName: mapping.externalPlayerName,
      mappingStatus: mapping.mappingStatus,
      participationStatus: mapping.participationStatus,
      internalPlayerId: mapping.internalPlayerId,
      suggestionName: mapping.mappingStatus === "MAPPED" ? null : suggestPlayerMatch(mapping.externalPlayerName, players)?.name ?? null,
    })),
    gaps: gaps.map((gap) => ({
      lastKnownEvent: `${gap.previousInnings}:${gap.previousOver}.${gap.previousBall}${gap.previousProviderEventId ? ` · ${gap.previousProviderEventId}` : ""}`,
      nextKnownEvent: `${gap.nextInnings}:${gap.nextOver}.${gap.nextBall}${gap.nextProviderEventId ? ` · ${gap.nextProviderEventId}` : ""}`,
      previousSequence: gap.previousSequence,
      nextSequence: gap.nextSequence,
      slotSpan: gap.slotSpan,
      recoveryResult: gap.recoveryResult,
    })),
    recoveryAttempts: water?.recoveryAttemptCount ?? 0,
    possibleGaps: water?.possibleGapCount ?? 0,
    recoveredGaps: water?.recoveredGapCount ?? 0,
    unresolvedGaps: water?.unresolvedGapCount ?? 0,
    duplicates: water?.duplicateCount ?? 0,
    parserFailures: water?.parseFailureCount ?? 0,
    continuity: water?.continuity ?? "CONTINUOUS",
    reconciliationState: score?.reconciliation ?? "UNKNOWN",
    conflicts,
    health: source?.status ?? "DISABLED",
    lastOutcome: source?.lastPollOutcome ?? null,
    currentPollLatencyMs: source?.lastAttemptAt ? source.lastPollLatencyMs : null,
    lastSuccessfulPoll: source?.lastSuccessfulPoll?.toISOString() ?? null,
    sourceSwitches,
    downtimeIncidents: downtime.map((incident) => ({ openedAtMs: incident.openedAt.getTime(), resolvedAtMs: incident.resolvedAt?.getTime() ?? null })),
    openIncidents,
    activationCursorReady: water?.latestOver !== null && water?.latestOver !== undefined && water?.latestBall !== null && water?.latestBall !== undefined,
    signoff: signoff?.validatedAt ? { validatedBy: signoff.validatedBy, validatedAt: signoff.validatedAt.toISOString(), validationReason: signoff.validationReason } : null,
    frozenCompletion: stored,
  });
}

function storedCompletion(value: Prisma.JsonValue): ShadowCompletionSummary | null {
  return isCompletionSummary(value) ? value : null;
}

export async function freezeShadowSummary(matchId: string, now = new Date()) {
  const link = await prisma.cricketMatchExternalId.findFirst({ where: { matchId, source: "Cricbuzz" } });
  if (!link) return null;
  const existing = await prisma.shadowMatchSignoff.findUnique({ where: { matchId_source: { matchId, source: "Cricbuzz" } } });
  if (existing?.summaryFrozenAt) return existing;
  const view = await shadowValidationForMatch(matchId, now);
  if (!view) return null;
  const summary = JSON.parse(JSON.stringify(view.completionDraft)) as Prisma.InputJsonValue;
  return prisma.shadowMatchSignoff.upsert({
    where: { matchId_source: { matchId, source: "Cricbuzz" } },
    create: { matchId, source: "Cricbuzz", summaryFrozenAt: now, summary },
    update: { summaryFrozenAt: now, summary },
  });
}

export async function markShadowValidated(input: { matchId: string; actorId?: string | null; reason: string; ip?: string | null; source?: string }) {
  const reason = requireReason(input.reason);
  const source = input.source ?? "Cricbuzz";
  const match = await prisma.cricketMatch.findUnique({ where: { id: input.matchId }, select: { id: true } });
  if (!match) throw new AppError("NOT_FOUND", "That match was not found.", 404);
  const [sourceRow, settings] = await Promise.all([
    prisma.feedSourceState.findUnique({ where: { source } }),
    getSettings(),
  ]);
  const unchanged = {
    operatingMode: sourceRow?.operatingMode ?? null,
    realSourcePricingEnabled: settings.realSourcePricingEnabled,
    engineMode: settings.engineMode,
  };
  await prisma.shadowMatchSignoff.upsert({
    where: { matchId_source: { matchId: input.matchId, source } },
    create: {
      matchId: input.matchId,
      source,
      validatedBy: input.actorId ?? null,
      validatedAt: new Date(),
      validationReason: reason,
    },
    update: {
      validatedBy: input.actorId ?? null,
      validatedAt: new Date(),
      validationReason: reason,
    },
  });
  await writeAudit({
    actorId: input.actorId,
    action: "feed.shadow_validated",
    entityType: "ShadowMatchSignoff",
    entityId: input.matchId,
    before: unchanged,
    after: { validated: true, ...unchanged },
    reason,
    ip: input.ip,
  });
}

export async function observeProviderWindow(input: {
  source: string;
  matchId: string;
  events: NormalizedCricketEvent[];
  recovered?: NormalizedCricketEvent[];
  recoveryRan?: boolean;
  snapshot?: {
    innings: number;
    scoreRuns: number;
    wickets: number;
    overs: string;
    strikerExternalId?: string | null;
    nonStrikerExternalId?: string | null;
    bowlerExternalId?: string | null;
    status: string;
    providerTimestamp?: string | null;
  } | null;
  now?: Date;
}): Promise<{ continuity: string; startedMidMatch: boolean; stored: number; reconciliation: string }> {
  const now = input.now ?? new Date();
  const prior = await prisma.feedHighWater.findUnique({ where: { source_matchId: { source: input.source, matchId: input.matchId } } });
  const priorPoint = prior && prior.latestInnings !== null && prior.latestOver !== null && prior.latestBall !== null
    ? { innings: prior.latestInnings, over: prior.latestOver, ball: prior.latestBall, sourceEventId: prior.latestProviderEventId, sequence: prior.latestSequence }
    : null;
  const incoming = [...input.events].sort(compareDeliveries);
  const recovered = [...(input.recovered ?? [])].sort(compareDeliveries);
  const seen = new Set<string>();
  const pool = [...recovered, ...incoming].filter((event) => {
    const key = event.sourceEventId ?? `${event.innings}:${event.over}.${event.ball}:${event.eventType}:${event.sequence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort(compareDeliveries);
  const firstIncoming = priorPoint ? incoming.find((event) => isAfterDelivery(event, priorPoint)) ?? null : null;
  const firstAfter = priorPoint ? pool.find((event) => isAfterDelivery(event, priorPoint)) ?? null : null;
  const rawGap = Boolean(priorPoint && firstIncoming && detectDeliveryGap(priorPoint, firstIncoming) === "POSSIBLE_GAP");
  const remainingGap = Boolean(priorPoint && firstAfter && detectDeliveryGap(priorPoint, firstAfter) === "POSSIBLE_GAP");
  const continuity = nextContinuity({ gap: rawGap, recoveryRan: Boolean(input.recoveryRan), filled: rawGap && !remainingGap });
  if (rawGap && priorPoint && firstIncoming) {
    await rememberObservedGap({
      source: input.source,
      matchId: input.matchId,
      previous: priorPoint,
      next: {
        innings: firstIncoming.innings,
        over: firstIncoming.over,
        ball: firstIncoming.ball,
        sourceEventId: firstIncoming.sourceEventId,
        sequence: firstIncoming.sequence,
      },
      recoveryResult: !remainingGap ? "RECOVERED" : input.recoveryRan ? "UNRESOLVED" : "POSSIBLE",
    });
  }
  const activation = await prisma.feedActivation.findUnique({ where: { source_matchId: { source: input.source, matchId: input.matchId } } });
  if (activation?.baselinePending && pool.length > 0) {
    const max = pool[pool.length - 1];
    if (max) {
      await prisma.feedActivation.update({
        where: { id: activation.id },
        data: {
          baselinePending: false,
          activationEventCursor: max.sourceEventId,
          activationInnings: max.innings,
          activationOver: max.over,
          activationBall: max.ball,
          activationSequence: max.sequence,
        },
      });
    }
  }
  if (prior) {
    await prisma.feedHighWater.update({
      where: { id: prior.id },
      data: {
        continuity,
        possibleGapCount: rawGap && !input.recoveryRan && prior.continuity !== "POSSIBLE_GAP" ? { increment: 1 } : undefined,
        recoveredGapCount: rawGap && !remainingGap ? { increment: 1 } : undefined,
        unresolvedGapCount: continuity === "UNRESOLVED_GAP" && prior.continuity !== "UNRESOLVED_GAP" ? { increment: 1 } : undefined,
        recoveryAttemptCount: input.recoveryRan ? { increment: 1 } : undefined,
      },
    });
  }
  if (!prior && pool.some((event) => isUnderway(event))) {
    const max = pool[pool.length - 1];
    if (max) {
      await prisma.feedHighWater.create({
        data: {
          source: input.source,
          matchId: input.matchId,
          startedMidMatch: true,
          contextInnings: max.innings,
          contextOver: max.over,
          contextBall: max.ball,
          observedSince: now,
          continuity,
          latestProviderEventId: max.sourceEventId,
          latestInnings: max.innings,
          latestOver: max.over,
          latestBall: max.ball,
          latestSequence: max.sequence,
          lastIngestAt: now,
          recoveryAttemptCount: input.recoveryRan ? 1 : 0,
        },
      });
    }
  }
  let stored = 0;
  for (const event of pool) {
    const result = await ingestNormalizedEvent(event);
    if (result.stored) stored += 1;
  }
  const water = await prisma.feedHighWater.findUnique({ where: { source_matchId: { source: input.source, matchId: input.matchId } } });
  if (water && water.continuity !== continuity) {
    await prisma.feedHighWater.update({ where: { id: water.id }, data: { continuity } });
  }
  if (continuity === "UNRESOLVED_GAP") {
    await openFeedIncident({ matchId: input.matchId, source: input.source, type: "UNRESOLVED_GAP", severity: "high" });
  } else if (continuity === "CONTINUOUS") {
    await resolveFeedIncidents({ matchId: input.matchId, source: input.source, type: "UNRESOLVED_GAP", resolution: "Feed continuity restored" });
  }
  let reconciliation = "UNKNOWN";
  if (input.snapshot) {
    const startedMidMatch = water?.startedMidMatch ?? false;
    const summed = startedMidMatch
      ? { runs: null as number | null, wickets: null as number | null }
      : await summedScore(input.matchId, input.source);
    reconciliation = reconcileSnapshot({
      snapshot: { runs: input.snapshot.scoreRuns, wickets: input.snapshot.wickets, overs: input.snapshot.overs },
      highWater: water && water.latestOver !== null && water.latestBall !== null ? { innings: water.latestInnings ?? 1, over: water.latestOver, ball: water.latestBall } : null,
      summedRuns: summed.runs,
      summedWickets: summed.wickets,
      startedMidMatch,
    });
    await prisma.matchScoreSnapshot.create({
      data: {
        matchId: input.matchId,
        source: input.source,
        innings: input.snapshot.innings,
        scoreRuns: input.snapshot.scoreRuns,
        wickets: input.snapshot.wickets,
        overs: input.snapshot.overs,
        strikerExternalId: input.snapshot.strikerExternalId ?? null,
        nonStrikerExternalId: input.snapshot.nonStrikerExternalId ?? null,
        bowlerExternalId: input.snapshot.bowlerExternalId ?? null,
        status: input.snapshot.status,
        providerTimestamp: input.snapshot.providerTimestamp ? new Date(input.snapshot.providerTimestamp) : null,
        reconciliation,
        ingestedAt: now,
      },
    });
    const stale = await prisma.matchScoreSnapshot.findMany({
      where: { matchId: input.matchId, source: input.source },
      orderBy: { ingestedAt: "desc" },
      skip: 20,
      select: { id: true },
    });
    if (stale.length > 0) await prisma.matchScoreSnapshot.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
    if (reconciliation === "CONFLICT") {
      const lastKnownEvent = water && water.latestOver !== null && water.latestBall !== null
        ? `${water.latestInnings ?? 1}:${water.latestOver}.${water.latestBall}`
        : null;
      const previousNote = await prisma.feedReconciliationNote.findFirst({
        where: { matchId: input.matchId, source: input.source },
        orderBy: { observedAt: "desc" },
      });
      const sameNote = previousNote
        && previousNote.state === "CONFLICT"
        && previousNote.providerRuns === input.snapshot.scoreRuns
        && previousNote.providerWickets === input.snapshot.wickets
        && previousNote.providerOvers === input.snapshot.overs
        && previousNote.expectedRuns === summed.runs
        && previousNote.expectedWickets === summed.wickets;
      if (!sameNote) {
        await prisma.feedReconciliationNote.create({
          data: {
            matchId: input.matchId,
            source: input.source,
            state: "CONFLICT",
            expectedRuns: summed.runs,
            expectedWickets: summed.wickets,
            providerRuns: input.snapshot.scoreRuns,
            providerWickets: input.snapshot.wickets,
            providerOvers: input.snapshot.overs,
            lastKnownEvent,
            observedAt: now,
          },
        });
      }
      await openFeedIncident({ matchId: input.matchId, source: input.source, type: "RECONCILIATION_CONFLICT", severity: "medium" });
    } else if (reconciliation === "MATCHED") {
      await resolveFeedIncidents({ matchId: input.matchId, source: input.source, type: "RECONCILIATION_CONFLICT", resolution: "Snapshot matched" });
    }
  }
  const unresolved = await prisma.playerFeedMapping.count({
    where: {
      source: input.source,
      matchId: input.matchId,
      mappingStatus: { in: ["UNMAPPED", "NEEDS_REVIEW"] },
      participationStatus: { in: ["PLAYING_XI", "ACTIVE", "SUBSTITUTE"] },
    },
  });
  if (unresolved > 0) await openFeedIncident({ matchId: input.matchId, source: input.source, type: "MAPPING_BLOCKER", severity: "medium" });
  else await resolveFeedIncidents({ matchId: input.matchId, source: input.source, type: "MAPPING_BLOCKER", resolution: "Mappings resolved" });
  return { continuity, startedMidMatch: water?.startedMidMatch ?? false, stored, reconciliation };
}

async function summedScore(matchId: string, source: string): Promise<{ runs: number | null; wickets: number | null }> {
  const events = await prisma.cricketEvent.findMany({
    where: { matchId, source, correctionState: "ACTIVE", correctsEventId: null },
    select: { runsTotal: true, eventType: true },
  });
  if (events.length === 0) return { runs: null, wickets: null };
  return {
    runs: events.reduce((sum, event) => sum + event.runsTotal, 0),
    wickets: events.filter((event) => event.eventType === "WICKET" || event.eventType === "RUN_OUT").length,
  };
}

export async function runCricbuzzShadow(now = new Date(), source = new CricbuzzLiveSource()): Promise<{ polled: boolean; outcome: string | null; stored: number }> {
  await ensureFeedConfig();
  const row = await prisma.feedSourceState.findUnique({ where: { source: "Cricbuzz" } });
  if (!row || !row.enabled || row.operatingMode === "DISABLED") return { polled: false, outcome: null, stored: 0 };
  const control = await prisma.feedControl.findUniqueOrThrow({ where: { id: "default" } });
  const delay = nextPollDelayMs(control.pollIntervalSeconds, row.consecutiveFailures);
  if (row.lastAttemptAt && now.getTime() - row.lastAttemptAt.getTime() < delay) {
    return { polled: false, outcome: row.lastPollOutcome, stored: 0 };
  }
  await prisma.feedSourceState.update({ where: { source: "Cricbuzz" }, data: { lastAttemptAt: now } });
  const started = Date.now();
  let outcome = "OK";
  let stored = 0;
  let eventAt: Date | null = null;
  try {
    const discovered = await source.discover();
    for (const match of discovered) {
      await prisma.discoveredCricketMatch.upsert({
        where: { source_externalId: { source: "Cricbuzz", externalId: match.externalId } },
        create: {
          source: "Cricbuzz",
          externalId: match.externalId,
          competition: match.competition,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          venue: match.venue,
          scheduledAt: new Date(match.scheduledAt),
          providerStatus: match.providerStatus,
          matchFormat: match.matchFormat,
          indiaInternational: match.indiaInternational,
        },
        update: {
          competition: match.competition,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          venue: match.venue,
          providerStatus: match.providerStatus,
          matchFormat: match.matchFormat,
          indiaInternational: match.indiaInternational,
        },
      });
    }
    await storeFeedSnapshot({
      source: "Cricbuzz",
      kind: "discovery",
      outcome: discovered.length > 0 ? "OK" : "NO_MATCH",
      body: { count: discovered.length, matches: discovered.slice(0, 20) },
    });
    const imported = await prisma.cricketMatchExternalId.findMany({ where: { source: "Cricbuzz" }, include: { match: true } });
    const targets = imported
      .filter((link) => link.match.status !== "COMPLETED" && link.match.status !== "ABANDONED")
      .sort((left, right) => {
        const leftIndia = left.match.homeTeam === "India" || left.match.awayTeam === "India" ? 1 : 0;
        const rightIndia = right.match.homeTeam === "India" || right.match.awayTeam === "India" ? 1 : 0;
        return rightIndia - leftIndia || left.match.scheduledAt.getTime() - right.match.scheduledAt.getTime();
      })
      .slice(0, SHADOW_MATCH_LIMIT);
    let parsedEvents = 0;
    let unresolved = false;
    for (const target of targets) {
      try {
        const polled = await source.poll({
          matches: [{ matchId: target.matchId, cursor: 0, battingExternalId: "", bowlingExternalId: "", externalMatchId: target.externalId }],
          now,
        });
        const marker = await prisma.feedHighWater.findUnique({ where: { source_matchId: { source: "Cricbuzz", matchId: target.matchId } } });
        const markerPoint = marker && marker.latestInnings !== null && marker.latestOver !== null && marker.latestBall !== null
          ? { innings: marker.latestInnings, over: marker.latestOver, ball: marker.latestBall, sourceEventId: marker.latestProviderEventId, sequence: marker.latestSequence }
          : null;
        const gap = Boolean(markerPoint && polled.some((event) => isAfterDelivery(event, markerPoint) && detectDeliveryGap(markerPoint, event) === "POSSIBLE_GAP"));
        let recovered: NormalizedCricketEvent[] = [];
        if (gap && markerPoint) {
          recovered = await source.recoverEvents({
            match: { matchId: target.matchId, cursor: 0, battingExternalId: "", bowlingExternalId: "", externalMatchId: target.externalId },
            cursor: { ...markerPoint, providerEventId: marker?.latestProviderEventId ?? null },
            now,
          });
        }
        const state = await source.readScore(target.externalId);
        const unclassified = source.drainUnclassified();
        if (unclassified.length > 0) await storeUnclassifiedEvents(unclassified);
        const observed = await observeProviderWindow({
          source: "Cricbuzz",
          matchId: target.matchId,
          events: polled,
          recovered,
          recoveryRan: gap,
          snapshot: state.score
            ? {
                innings: state.innings ?? 1,
                scoreRuns: state.score.runs,
                wickets: state.score.wickets,
                overs: state.score.overs,
                strikerExternalId: state.score.strikerId,
                nonStrikerExternalId: state.score.nonStrikerId,
                bowlerExternalId: state.score.bowlerId,
                status: state.status,
              }
            : null,
          now,
        });
        const events = polled;
        parsedEvents += events.length;
        stored += observed.stored;
        if (events.some((event) => !event.battingPlayerId && event.battingExternalId)) unresolved = true;
        if (!eventAt && events[0]?.sourceTimestamp) eventAt = new Date(events[0].sourceTimestamp);
        await storeFeedSnapshot({
          source: "Cricbuzz",
          externalMatchId: target.externalId,
          kind: "commentary",
          outcome: events.length === 0 ? "NO_NEW_EVENT" : "OK",
          body: {
            externalMatchId: target.externalId,
            parsed: events.map((event) => ({
              eventType: event.eventType,
              over: `${event.over}.${event.ball}`,
              batterId: event.battingExternalId,
              batterName: event.battingName ?? null,
              bowlerId: event.bowlingExternalId,
              text: event.rawDescription,
              timestamp: event.sourceTimestamp,
              wicketType: event.wicketType,
            })),
            normalized: events.map((event) => ({
              eventType: event.eventType,
              sourceEventId: event.sourceEventId,
              dedupe: event.sourceEventId ? `Cricbuzz:${event.sourceEventId}` : null,
              wouldPriceAs: wouldPriceAs(event),
            })),
          },
        });
      } catch (error) {
        await storeUnclassifiedEvents(source.drainUnclassified());
        outcome = pollOutcomeOf(error);
        if (outcome === "PARSE_ERROR") {
          await prisma.feedHighWater.updateMany({
            where: { source: "Cricbuzz", matchId: target.matchId },
            data: { parseFailureCount: { increment: 1 } },
          });
        }
        await storeFeedSnapshot({
          source: "Cricbuzz",
          externalMatchId: target.externalId,
          kind: "commentary-failure",
          outcome,
          body: { message: error instanceof Error ? error.message : "commentary failed" },
        });
      }
    }
    if (!pollCountsAsFailure(outcome)) {
      const openMappings = await prisma.playerFeedMapping.count({
        where: { source: "Cricbuzz", mappingStatus: { in: ["UNMAPPED", "NEEDS_REVIEW"] } },
      });
      if (targets.length > 0 && parsedEvents === 0) outcome = "NO_NEW_EVENT";
      else if (unresolved || (targets.length > 0 && openMappings > 0)) outcome = "MAPPING_REQUIRED";
      else if (targets.length === 0 && discovered.length === 0) outcome = "NO_MATCH";
      else outcome = "OK";
    }
  } catch (error) {
    outcome = pollOutcomeOf(error);
    await storeFeedSnapshot({
      source: "Cricbuzz",
      kind: "discovery-failure",
      outcome,
      body: { message: error instanceof Error ? error.message : "discovery failed" },
    });
  }
  await recordPoll("Cricbuzz", { outcome, latencyMs: Date.now() - started, eventAt });
  return { polled: true, outcome, stored };
}
