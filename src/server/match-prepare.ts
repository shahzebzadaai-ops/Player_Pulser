/**
 * Staff preparation for one canonical shadow match.
 * It does not enable real-source pricing or change the pricing engine.
 */

import { AppError } from "@/domain/errors";
import { participationJoinsLive } from "@/domain/cricket-feed";
import {
  isIndiaTeam,
  isLiveProviderStatus,
  nextIndiaMatch,
  type MatchProvider,
  type ProviderMatchRecord,
  type ResolvedCricketMatch,
} from "@/domain/match-resolver";
import { planPlayerMappings, safeMappings, type ProviderPlayerRef } from "@/domain/player-mapping-plan";
import { requireReason, writeAudit } from "./audit";
import { parseCrexDiscoveries } from "./crex/crex-parser";
import { createCrexClient } from "./crex/crex-client";
import { CricbuzzLiveSource } from "./cricbuzz/cricbuzz-source";
import { ensureFeedConfig, mapFeedPlayer, setMatchStatus } from "./feed";
import { prisma } from "./prisma";
import { parseSportskeedaMatches } from "./sportskeeda/sportskeeda-parser";
import { createSportskeedaClient } from "./sportskeeda/sportskeeda-client";
import { getSettings } from "./settings";

const PROVIDERS: MatchProvider[] = ["CREX", "Sportskeeda", "Cricbuzz"];

function recordFromDiscovery(row: {
  source: string;
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  scheduledAt: Date;
  matchFormat: string;
  venue: string;
  providerStatus: string;
}): ProviderMatchRecord | null {
  if (row.source !== "CREX" && row.source !== "Sportskeeda" && row.source !== "Cricbuzz") return null;
  return {
    source: row.source,
    externalId: row.externalId,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    competition: row.competition,
    scheduledAt: row.scheduledAt.toISOString(),
    matchFormat: row.matchFormat,
    venue: row.venue,
    providerStatus: row.providerStatus,
  };
}

export async function storedProviderMatches(): Promise<ProviderMatchRecord[]> {
  const rows = await prisma.discoveredCricketMatch.findMany({
    where: { source: { in: PROVIDERS }, indiaInternational: true },
    orderBy: { scheduledAt: "asc" },
  });
  return rows.flatMap((row) => {
    const record = recordFromDiscovery(row);
    return record ? [record] : [];
  });
}

export async function indiaMatchPreview(now = new Date()): Promise<ResolvedCricketMatch | null> {
  return nextIndiaMatch(await storedProviderMatches(), now.getTime());
}

async function rememberDiscovery(record: ProviderMatchRecord) {
  if (!isIndiaTeam(record.homeTeam) && !isIndiaTeam(record.awayTeam)) return;
  await prisma.discoveredCricketMatch.upsert({
    where: { source_externalId: { source: record.source, externalId: record.externalId } },
    create: {
      source: record.source,
      externalId: record.externalId,
      competition: record.competition,
      homeTeam: record.homeTeam,
      awayTeam: record.awayTeam,
      venue: record.venue,
      scheduledAt: new Date(record.scheduledAt),
      providerStatus: record.providerStatus,
      matchFormat: record.matchFormat,
      indiaInternational: true,
    },
    update: {
      competition: record.competition,
      homeTeam: record.homeTeam,
      awayTeam: record.awayTeam,
      venue: record.venue,
      providerStatus: record.providerStatus,
      matchFormat: record.matchFormat,
      indiaInternational: true,
    },
  });
}

export async function refreshIndiaDiscoveries(sources?: {
  crexPage?: () => Promise<string>;
  sportskeedaMatches?: () => Promise<unknown>;
  cricbuzz?: () => Promise<ProviderMatchRecord[]>;
}): Promise<{ CREX: string; Sportskeeda: string; Cricbuzz: string }> {
  await ensureFeedConfig();
  const result = { CREX: "NOT FOUND", Sportskeeda: "NOT FOUND", Cricbuzz: "NOT FOUND" };
  try {
    const page = sources?.crexPage ? await sources.crexPage() : await createCrexClient().getLivePage();
    const found = parseCrexDiscoveries(page).filter((match) => isIndiaTeam(match.homeTeam) || isIndiaTeam(match.awayTeam));
    for (const match of found) {
      await rememberDiscovery({ ...match, source: "CREX" });
    }
    if (found.length > 0) result.CREX = "FOUND";
  } catch {
    result.CREX = "NOT FOUND";
  }
  try {
    const payload = sources?.sportskeedaMatches ? await sources.sportskeedaMatches() : await createSportskeedaClient().getMatches();
    const found = parseSportskeedaMatches(payload).filter((match) => isIndiaTeam(match.homeTeam) || isIndiaTeam(match.awayTeam));
    for (const match of found) await rememberDiscovery({ ...match, source: "Sportskeeda" });
    if (found.length > 0) result.Sportskeeda = "FOUND";
  } catch {
    result.Sportskeeda = "NOT FOUND";
  }
  try {
    const found = sources?.cricbuzz
      ? await sources.cricbuzz()
      : (await new CricbuzzLiveSource().discover()).filter((match) => match.indiaInternational).map((match) => ({
          source: "Cricbuzz" as const,
          externalId: match.externalId,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          competition: match.competition,
          scheduledAt: match.scheduledAt,
          matchFormat: match.matchFormat,
          venue: match.venue,
          providerStatus: match.providerStatus,
        }));
    for (const match of found) await rememberDiscovery(match);
    if (found.length > 0) result.Cricbuzz = "FOUND";
  } catch {
    result.Cricbuzz = "NOT FOUND";
  }
  return result;
}

export async function prepareShadowMatch(input: {
  match: ResolvedCricketMatch;
  actorId?: string | null;
  reason: string;
  ip?: string | null;
}): Promise<{ matchId: string; foundCount: number; monitoring: "READY" | "DEGRADED" }> {
  const reason = requireReason(input.reason);
  if (input.match.foundCount < 1) throw new AppError("INVALID", "No provider match was found.", 400);
  await ensureFeedConfig();
  const links = Object.values(input.match.providers).filter((provider): provider is ProviderMatchRecord => Boolean(provider));
  const existingIds = await prisma.cricketMatchExternalId.findMany({
    where: { OR: links.map((link) => ({ source: link.source, externalId: link.externalId })) },
  });
  const matchIds = [...new Set(existingIds.map((row) => row.matchId))];
  if (matchIds.length > 1) throw new AppError("INVALID", "Those provider matches are already attached to different PlayerPulser matches.", 409);
  const scheduledAt = new Date(input.match.scheduledAt);
  const match = matchIds[0]
    ? await prisma.cricketMatch.findUniqueOrThrow({ where: { id: matchIds[0] } })
    : await prisma.cricketMatch.create({
        data: {
          competition: input.match.competition || "India international",
          homeTeam: input.match.homeTeam,
          awayTeam: input.match.awayTeam,
          venue: input.match.venue,
          scheduledAt: Number.isNaN(scheduledAt.getTime()) ? new Date() : scheduledAt,
          status: "SCHEDULED",
        },
      });
  for (const link of links) {
    await prisma.cricketMatchExternalId.upsert({
      where: { source_externalId: { source: link.source, externalId: link.externalId } },
      create: { matchId: match.id, source: link.source, externalId: link.externalId },
      update: { matchId: match.id },
    });
    await prisma.discoveredCricketMatch.updateMany({
      where: { source: link.source, externalId: link.externalId },
      data: { importedMatchId: match.id },
    });
  }
  for (const source of links.map((link) => link.source)) {
    const row = await prisma.feedSourceState.findUnique({ where: { source } });
    if (!row) continue;
    await prisma.feedSourceState.update({
      where: { source },
      data: {
        operatingMode: row.operatingMode === "DISABLED" ? "SHADOW" : row.operatingMode,
        status: row.status === "DISABLED" ? "HEALTHY" : row.status,
        enabled: row.enabled,
      },
    });
  }
  await prisma.feedSourceState.update({
    where: { source: "Consensus" },
    data: { operatingMode: "SHADOW", enabled: false },
  }).catch(() => undefined);
  await writeAudit({
    actorId: input.actorId,
    action: "feed.shadow_prepare",
    entityType: "CricketMatch",
    entityId: match.id,
    ip: input.ip,
    reason,
    after: {
      providers: links.map((link) => link.source),
      monitoring: input.match.monitoring,
      realSourcePricingEnabled: false,
    },
  });
  return { matchId: match.id, foundCount: input.match.foundCount, monitoring: input.match.monitoring };
}

export async function confirmSafePlayerMappings(input: { matchId: string; actorId?: string | null; reason: string; ip?: string | null }) {
  const reason = requireReason(input.reason);
  const [mappings, players] = await Promise.all([
    prisma.playerFeedMapping.findMany({ where: { matchId: input.matchId } }),
    prisma.player.findMany({ select: { id: true, name: true, slug: true } }),
  ]);
  const refs: ProviderPlayerRef[] = mappings.flatMap((mapping) => {
    if (mapping.source !== "CREX" && mapping.source !== "Sportskeeda" && mapping.source !== "Cricbuzz") return [];
    return [{
      source: mapping.source,
      externalPlayerId: mapping.externalPlayerId,
      externalPlayerName: mapping.externalPlayerName,
      participationStatus: mapping.participationStatus,
      knownPlayerId: mapping.mappingStatus === "MAPPED" ? mapping.internalPlayerId : null,
    }];
  });
  const safe = safeMappings(planPlayerMappings(refs, players));
  for (const row of safe) {
    if (!row.playerId) continue;
    for (const source of PROVIDERS) {
      const provider = row.providers[source];
      if (!provider) continue;
      await mapFeedPlayer({
        matchId: input.matchId,
        source,
        externalPlayerId: provider.externalPlayerId,
        externalPlayerName: provider.name,
        internalPlayerId: row.playerId,
        participationStatus: row.participation,
      });
    }
  }
  await writeAudit({
    actorId: input.actorId,
    action: "feed.mapping_confirm_safe",
    entityType: "CricketMatch",
    entityId: input.matchId,
    ip: input.ip,
    reason,
    after: { confirmed: safe.length },
  });
  return { confirmed: safe.length };
}

export async function advancePreparedShadowMatches() {
  const scheduled = await prisma.cricketMatch.findMany({
    where: { status: "SCHEDULED", externalIds: { some: { source: { in: PROVIDERS } } } },
    include: { externalIds: true },
  });
  for (const match of scheduled) {
    const links = match.externalIds.filter((link) => PROVIDERS.includes(link.source as MatchProvider));
    if (links.length === 0) continue;
    const discoveries = await prisma.discoveredCricketMatch.findMany({
      where: { OR: links.map((link) => ({ source: link.source, externalId: link.externalId })) },
    });
    if (!discoveries.some((row) => isLiveProviderStatus(row.providerStatus))) continue;
    await setMatchStatus(match.id, "LIVE");
  }
}

export async function shadowOperatorSummary(matchId: string) {
  const [match, sources, settings, eventCount, mappings, players] = await Promise.all([
    prisma.cricketMatch.findUnique({ where: { id: matchId }, include: { externalIds: true } }),
    prisma.feedSourceState.findMany({ where: { source: { in: [...PROVIDERS, "Consensus"] } } }),
    getSettings(),
    prisma.cricketEvent.count({ where: { matchId } }),
    prisma.playerFeedMapping.findMany({ where: { matchId, source: { in: PROVIDERS } } }),
    prisma.player.findMany({ select: { id: true, name: true, slug: true } }),
  ]);
  if (!match) return null;
  const refs: ProviderPlayerRef[] = mappings.flatMap((mapping) => {
    if (mapping.source !== "CREX" && mapping.source !== "Sportskeeda" && mapping.source !== "Cricbuzz") return [];
    return [{
      source: mapping.source,
      externalPlayerId: mapping.externalPlayerId,
      externalPlayerName: mapping.externalPlayerName,
      participationStatus: mapping.participationStatus,
      knownPlayerId: mapping.mappingStatus === "MAPPED" ? mapping.internalPlayerId : null,
    }];
  });
  const plan = planPlayerMappings(refs, players);
  const resolved = plan.filter((row) => row.status === "CONFIRMED" || row.status === "SAFE").length;
  const sourceState = (name: MatchProvider) => {
    const linked = match.externalIds.some((row) => row.source === name);
    const health = sources.find((row) => row.source === name);
    return { linked, status: health?.status ?? "DOWN" };
  };
  return {
    crex: sourceState("CREX"),
    sportskeeda: sourceState("Sportskeeda"),
    cricbuzz: sourceState("Cricbuzz"),
    playersResolved: resolved,
    playersTotal: plan.length,
    plan,
    shadowEvents: eventCount,
    consensusMode: sources.find((row) => row.source === "Consensus")?.operatingMode ?? "SHADOW",
    realPricing: settings.realSourcePricingEnabled,
    engineMode: settings.engineMode,
    participatingOpen: plan.filter((row) => row.status !== "CONFIRMED" && participationJoinsLive(row.participation)).length,
  };
}
