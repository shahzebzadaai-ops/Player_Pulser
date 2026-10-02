/**
 * Shadow consensus cycle. Raw provider events are stored first.
 * Only a medium or high consensus event can reach the pricing guard.
 */

import type { NormalizedCricketEvent } from "@/domain/cricket-feed";
import { nextPollDelayMs } from "@/domain/cricket-feed";
import {
  CONSENSUS_PROVIDERS,
  DEFAULT_CONSENSUS_PRIORITIES,
  consensusEventIdentity,
  decideConsensus,
  isUsableConsensusSource,
  rollReliability,
  type ConsensusCandidate,
  type ConsensusDecision,
  type ConsensusProvider,
} from "@/domain/consensus-feed";
import { CrexTransportError } from "./crex/crex-client";
import { CrexParseError } from "./crex/crex-parser";
import { CrexLiveSource } from "./crex/crex-source";
import { ensureFeedConfig, ingestNormalizedEvent } from "./feed";
import { prisma } from "./prisma";
import { SportskeedaTransportError } from "./sportskeeda/sportskeeda-client";
import { SportskeedaParseError } from "./sportskeeda/sportskeeda-parser";
import { SportskeedaLiveSource } from "./sportskeeda/sportskeeda-source";

function toCandidate(event: NormalizedCricketEvent): ConsensusCandidate | null {
  if (event.source !== "CREX" && event.source !== "Sportskeeda" && event.source !== "Cricbuzz") return null;
  return {
    source: event.source,
    sourceEventId: event.sourceEventId ?? `${event.source}:${event.innings}:${event.over}.${event.ball}`,
    matchId: event.matchId,
    innings: event.innings,
    over: event.over,
    ball: event.ball,
    eventType: event.eventType,
    runsTotal: event.runsTotal,
    wicketType: event.wicketType,
    battingPlayerId: event.battingPlayerId,
    bowlingPlayerId: event.bowlingPlayerId,
    battingName: event.battingName ?? null,
    bowlingName: event.bowlingName ?? null,
  };
}

async function priorities(): Promise<Record<ConsensusProvider, number>> {
  const row = await prisma.appSetting.findUnique({ where: { key: "feed.consensusPriorities" } });
  if (!row || typeof row.value !== "string") return DEFAULT_CONSENSUS_PRIORITIES;
  try {
    const parsed = JSON.parse(row.value) as Partial<Record<ConsensusProvider, number>>;
    return { ...DEFAULT_CONSENSUS_PRIORITIES, ...parsed };
  } catch {
    return DEFAULT_CONSENSUS_PRIORITIES;
  }
}

async function notePoll(source: string, input: { ok: boolean; outcome: string; latencyMs: number; agreementPercent: number }) {
  const current = await prisma.feedSourceState.findUnique({ where: { source } });
  if (!current) return;
  const consecutiveFailures = input.ok ? 0 : current.consecutiveFailures + 1;
  const status = consecutiveFailures >= 3 ? "DOWN" : consecutiveFailures >= 1 ? "DEGRADED" : "HEALTHY";
  const reliability = rollReliability({
    score: current.reliabilityScore,
    agreementPercent: current.agreementPercent,
    gapPercent: current.gapPercent,
    correctionPercent: current.correctionPercent,
  }, {
    parseSuccess: input.ok,
    agreementPercent: input.agreementPercent,
    latencyMs: input.latencyMs,
    gapPercent: current.gapPercent,
    correctionPercent: current.correctionPercent,
  });
  await prisma.feedSourceState.update({
    where: { source },
    data: {
      consecutiveFailures,
      status,
      lastPollOutcome: input.outcome,
      lastPollLatencyMs: input.latencyMs,
      lastSuccessfulPoll: input.ok ? new Date() : current.lastSuccessfulPoll,
      lastAttemptAt: new Date(),
      lastEventAt: input.ok ? new Date() : current.lastEventAt,
      latencyTotalMs: current.latencyTotalMs + Math.max(0, input.latencyMs),
      latencySamples: current.latencySamples + 1,
      successCount: current.successCount + (input.ok ? 1 : 0),
      failureCount: current.failureCount + (input.ok ? 0 : 1),
      reliabilityScore: reliability.score,
      agreementPercent: reliability.agreementPercent,
      gapPercent: reliability.gapPercent,
      correctionPercent: reliability.correctionPercent,
    },
  });
}

async function rememberDecision(decision: ConsensusDecision) {
  const identity = consensusEventIdentity(decision);
  const existing = await prisma.consensusEvent.findFirst({
    where: {
      matchId: decision.matchId,
      innings: decision.innings,
      overNumber: decision.over,
      ballNumber: decision.ball,
      confidence: decision.confidence,
      sourceEventIds: { equals: decision.sourceEventIds },
    },
  });
  if (!existing) {
    await prisma.consensusEvent.create({
      data: {
        matchId: decision.matchId,
        innings: decision.innings,
        overNumber: decision.over,
        ballNumber: decision.ball,
        acceptedEvent: decision.acceptedEvent ?? undefined,
        confidence: decision.confidence,
        supportingSources: decision.supportingSources,
        conflictingSources: decision.conflictingSources,
        sourceEventIds: decision.sourceEventIds,
      },
    });
  }
  if (decision.confidence === "CONFLICT") {
    const open = await prisma.feedIncident.findFirst({
      where: { source: "Consensus", type: "FEED_CONFLICT", matchId: decision.matchId, resolvedAt: null },
    });
    if (!open) {
      await prisma.feedIncident.create({
        data: { source: "Consensus", type: "FEED_CONFLICT", severity: "high", matchId: decision.matchId },
      });
    }
    return identity;
  }
  await prisma.feedIncident.updateMany({
    where: { source: "Consensus", type: "FEED_CONFLICT", matchId: decision.matchId, resolvedAt: null },
    data: { resolvedAt: new Date(), resolution: "Later polls agreed" },
  });
  return identity;
}

function due(row: { lastAttemptAt: Date | null; consecutiveFailures: number } | undefined, intervalSeconds: number, now: Date): boolean {
  if (!row?.lastAttemptAt) return true;
  return now.getTime() - row.lastAttemptAt.getTime() >= nextPollDelayMs(intervalSeconds, row.consecutiveFailures);
}

export async function runConsensusShadow(now = new Date(), sources?: {
  crex?: CrexLiveSource;
  sportskeeda?: SportskeedaLiveSource;
}): Promise<{ stored: number; decisions: number }> {
  await ensureFeedConfig();
  const [rows, control] = await Promise.all([
    prisma.feedSourceState.findMany({ where: { source: { in: [...CONSENSUS_PROVIDERS] } } }),
    prisma.feedControl.findUnique({ where: { id: "default" } }),
  ]);
  const interval = control?.pollIntervalSeconds ?? 15;
  const byName = new Map(rows.map((row) => [row.source, row]));
  const available = CONSENSUS_PROVIDERS.filter((source) => {
    const row = byName.get(source);
    return row ? isUsableConsensusSource(row) : false;
  });
  const crex = sources?.crex ?? new CrexLiveSource();
  const sportskeeda = sources?.sportskeeda ?? new SportskeedaLiveSource();
  const fresh = new Map<string, NormalizedCricketEvent>();

  async function pollProvider(source: "CREX" | "Sportskeeda", adapter: { poll(input: { matches: { matchId: string; cursor: number; battingExternalId: string; bowlingExternalId: string; externalMatchId: string }[]; now: Date }): Promise<NormalizedCricketEvent[]> }) {
    const row = byName.get(source);
    if (!row || row.operatingMode === "DISABLED" || !due(row, interval, now)) return;
    const started = Date.now();
    try {
      const links = await prisma.cricketMatchExternalId.findMany({
        where: { source, match: { status: { notIn: ["COMPLETED", "ABANDONED"] } } },
        take: 4,
      });
      const events = links.length === 0 ? [] : await adapter.poll({
        matches: links.map((link) => ({
          matchId: link.matchId,
          cursor: 0,
          battingExternalId: "",
          bowlingExternalId: "",
          externalMatchId: link.externalId,
        })),
        now,
      });
      for (const event of events) {
        await ingestNormalizedEvent(event);
        const candidate = toCandidate(event);
        if (candidate) fresh.set(candidate.sourceEventId, event);
      }
      await notePoll(source, { ok: true, outcome: events.length > 0 ? "OK" : "NO_NEW_EVENT", latencyMs: Date.now() - started, agreementPercent: row.agreementPercent });
    } catch (error) {
      const outcome = error instanceof CrexTransportError || error instanceof SportskeedaTransportError
        ? error.outcome
        : error instanceof CrexParseError || error instanceof SportskeedaParseError
          ? "PARSE_ERROR"
          : "HTTP_ERROR";
      await notePoll(source, { ok: false, outcome, latencyMs: Date.now() - started, agreementPercent: row.agreementPercent });
    }
  }

  if (available.includes("CREX") || byName.get("CREX")?.operatingMode === "SHADOW") await pollProvider("CREX", crex);
  if (available.includes("Sportskeeda") || byName.get("Sportskeeda")?.operatingMode === "SHADOW") await pollProvider("Sportskeeda", sportskeeda);

  const matchIds = [...new Set([...fresh.values()].map((event) => event.matchId))];
  const cricbuzzRows = matchIds.length === 0 ? [] : await prisma.cricketEvent.findMany({
    where: { source: "Cricbuzz", matchId: { in: matchIds }, correctionState: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const candidates: ConsensusCandidate[] = [];
  for (const event of fresh.values()) {
    const candidate = toCandidate(event);
    if (candidate && available.includes(candidate.source)) candidates.push(candidate);
  }
  for (const row of cricbuzzRows) {
    if (!available.includes("Cricbuzz")) continue;
    candidates.push({
      source: "Cricbuzz",
      sourceEventId: row.sourceEventId ?? row.id,
      matchId: row.matchId,
      innings: row.innings,
      over: row.over,
      ball: row.ball,
      eventType: row.eventType,
      runsTotal: row.runsTotal,
      wicketType: row.wicketType,
      battingPlayerId: row.battingPlayerId,
      bowlingPlayerId: row.bowlingPlayerId,
      battingName: null,
      bowlingName: null,
    });
  }
  const decisions = decideConsensus({ candidates, availableSources: available, priorities: await priorities() });
  let stored = 0;
  for (const decision of decisions) {
    const identity = await rememberDecision(decision);
    if (!decision.acceptedEvent || decision.confidence === "CONFLICT" || decision.confidence === "CONFIDENCE_LOW") continue;
    const original = fresh.get(decision.acceptedEvent.sourceEventId);
    if (!original) continue;
    const result = await ingestNormalizedEvent({
      ...original,
      source: "Consensus",
      sourceEventId: identity,
      consensusConfidence: decision.confidence,
      consensusIdentityConfirmed: decision.priceableIdentity,
    });
    if (result.stored) stored += 1;
  }
  const agreementBySource = new Map<ConsensusProvider, number>();
  for (const decision of decisions) {
    for (const source of decision.supportingSources) agreementBySource.set(source, 100);
    for (const source of decision.conflictingSources) agreementBySource.set(source, 0);
  }
  for (const [source, agreementPercent] of agreementBySource) {
    const row = await prisma.feedSourceState.findUnique({ where: { source } });
    if (!row) continue;
    const reliability = rollReliability({
      score: row.reliabilityScore,
      agreementPercent: row.agreementPercent,
      gapPercent: row.gapPercent,
      correctionPercent: row.correctionPercent,
    }, { parseSuccess: true, agreementPercent, latencyMs: row.lastPollLatencyMs, gapPercent: row.gapPercent, correctionPercent: row.correctionPercent });
    await prisma.feedSourceState.update({
      where: { source },
      data: { reliabilityScore: reliability.score, agreementPercent: reliability.agreementPercent },
    });
  }
  return { stored, decisions: decisions.length };
}

export async function consensusAdminReport() {
  await ensureFeedConfig();
  const [sources, latest] = await Promise.all([
    prisma.feedSourceState.findMany({
      where: { source: { in: ["CREX", "Sportskeeda", "Cricbuzz", "Consensus"] } },
      orderBy: { priority: "asc" },
    }),
    prisma.consensusEvent.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);
  const lastEvents = await prisma.cricketEvent.findMany({
    where: { source: { in: ["CREX", "Sportskeeda", "Cricbuzz", "Consensus"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { source: true, normalizedDescription: true, createdAt: true },
  });
  const usable = sources.filter((source) => source.source !== "Consensus" && isUsableConsensusSource(source)).length;
  return { sources, latest, lastEvents, usable };
}
