import { randomUUID } from "crypto";
import { expect, test } from "vitest";
import { parseCommentary } from "@/server/cricbuzz/cricbuzz-parser";
import { normalizeCommentary } from "@/server/cricbuzz/cricbuzz-normalizer";
import { CricbuzzLiveSource } from "@/server/cricbuzz/cricbuzz-source";
import commentary from "@/server/cricbuzz/fixtures/commentary.json";
import commentaryEmpty from "@/server/cricbuzz/fixtures/commentary-empty.json";
import matches from "@/server/cricbuzz/fixtures/matches.json";
import {
  ensureFeedConfig,
  importDiscoveredMatch,
  ingestNormalizedEvent,
  mapFeedPlayer,
  runCricbuzzShadow,
  setSourceOperatingMode,
} from "@/server/feed";
import { applyPendingPricing } from "@/server/pricing";
import { prisma } from "@/server/prisma";
import { getSettings, setRealSourcePricingEnabled } from "@/server/settings";

function sourceFor(list: unknown, ball: unknown) {
  return new CricbuzzLiveSource({
    getMatchList: async () => list,
    getCommentary: async () => ball,
  });
}

async function makePlayer(name: string) {
  const player = await prisma.player.create({
    data: {
      slug: `cb-${randomUUID()}`,
      name,
      shortName: name.slice(0, 8),
      role: "BATTER",
      referenceMidPaise: 10_000n,
      basePricePaise: 10_000n,
      midPricePaise: 10_000n,
      matchAnchorPaise: 10_000n,
      fictional: true,
      blurb: "Cricbuzz test",
      tradable: true,
    },
  });
  await prisma.priceTick.create({ data: { playerId: player.id, midPaise: 10_000n, source: "test" } });
  return player;
}

async function withEngine(mode: "SIMULATION" | "EVENT_DRIVEN", run: () => Promise<void>) {
  const previous = await prisma.appSetting.findUnique({ where: { key: "pricing.engineMode" } });
  await prisma.appSetting.upsert({
    where: { key: "pricing.engineMode" },
    create: { key: "pricing.engineMode", value: mode },
    update: { value: mode },
  });
  try {
    await run();
  } finally {
    if (previous) await prisma.appSetting.update({ where: { key: "pricing.engineMode" }, data: { value: previous.value ?? "SIMULATION" } });
    else await prisma.appSetting.deleteMany({ where: { key: "pricing.engineMode" } });
  }
}

async function resetCricbuzz() {
  await ensureFeedConfig();
  await prisma.feedSourceState.update({
    where: { source: "Cricbuzz" },
    data: { enabled: true, operatingMode: "SHADOW", status: "HEALTHY", consecutiveFailures: 0, lastAttemptAt: null, lastPollOutcome: null },
  });
  await prisma.feedSourceState.update({
    where: { source: "DevelopmentSimulator" },
    data: { enabled: true, operatingMode: "ACTIVE", status: "HEALTHY" },
  });
}

test("shadow discovery imports only when staff ask, and unknown players stay unmapped", async () => {
  await resetCricbuzz();
  const discovered = await runCricbuzzShadow(new Date(), sourceFor(matches, commentaryEmpty));
  expect(discovered.outcome).toBe("OK");
  const india = await prisma.discoveredCricketMatch.findUnique({ where: { source_externalId: { source: "Cricbuzz", externalId: "88901" } } });
  expect(india).toMatchObject({ indiaInternational: true, importedMatchId: null });
  expect(await prisma.cricketMatch.count({ where: { homeTeam: "India", awayTeam: "Australia", competition: "India tour of Australia, 2026" } })).toBe(0);
  const imported = await importDiscoveredMatch({ discoveredId: india!.id, reason: "import the india odi" });
  expect(await prisma.cricketMatchExternalId.findFirst({ where: { matchId: imported.matchId, source: "Cricbuzz" } })).toMatchObject({ externalId: "88901" });
  const audit = await prisma.auditLog.findFirst({ where: { action: "feed.match_import", entityId: imported.matchId } });
  expect(audit?.reason).toBe("import the india odi");

  await prisma.feedSourceState.update({ where: { source: "Cricbuzz" }, data: { lastAttemptAt: null } });
  const live = await runCricbuzzShadow(new Date(), sourceFor(matches, commentary));
  expect(live.stored).toBeGreaterThan(0);
  const guest = await prisma.playerFeedMapping.findUnique({ where: { source_externalPlayerId: { source: "Cricbuzz", externalPlayerId: "424242" } } });
  expect(guest).toMatchObject({ mappingStatus: "UNMAPPED", internalPlayerId: null });
  expect(await prisma.player.count({ where: { name: "Guest Batter" } })).toBe(0);
  const source = await prisma.feedSourceState.findUniqueOrThrow({ where: { source: "Cricbuzz" } });
  expect(source.lastPollOutcome).toBe("MAPPING_REQUIRED");
  expect(source.status).not.toBe("DOWN");
  const storedEvents = await prisma.cricketEvent.findMany({ where: { matchId: imported.matchId, source: "Cricbuzz" }, select: { pricingKeys: true } });
  expect(storedEvents.every((row) => row.pricingKeys.length === 0)).toBe(true);
});

test("a known external id maps, the same ball dedupes, and a correction supersedes without a price", async () => {
  await withEngine("EVENT_DRIVEN", async () => {
    await resetCricbuzz();
    const player = await makePlayer("Mapped Batter");
    const match = await prisma.cricketMatch.create({
      data: {
        competition: "Mapped",
        homeTeam: "India",
        awayTeam: "Australia",
        scheduledAt: new Date(),
        status: "LIVE",
        externalIds: { create: { source: "Cricbuzz", externalId: "mapped-1" } },
      },
    });
    await mapFeedPlayer({
      matchId: match.id,
      source: "Cricbuzz",
      externalPlayerId: "1413",
      externalPlayerName: "Virat Kohli",
      internalPlayerId: player.id,
      participationStatus: "ACTIVE",
    });
    await mapFeedPlayer({
      matchId: match.id,
      source: "Cricbuzz",
      externalPlayerId: "625",
      externalPlayerName: "Pat Cummins",
      internalPlayerId: player.id,
      participationStatus: "ACTIVE",
    });
    const events = normalizeCommentary(match.id, parseCommentary(commentary, "mapped-1"), new Date("2026-09-28T12:00:00.000Z"));
    const found = events.find((event) => event.eventType === "FOUR" && event.battingExternalId === "1413");
    const four = { ...found!, sourceEventId: "cb:mapped-1:1:12.1" };
    expect(await ingestNormalizedEvent(four)).toMatchObject({ stored: true, priced: false, unmapped: false });
    expect(await ingestNormalizedEvent(four)).toMatchObject({ duplicate: true, priced: false });
    const corrected = { ...four, eventType: "SIX" as const, runsBatter: 6, runsTotal: 6, isFour: false, isSix: true, isBoundary: true };
    expect(await ingestNormalizedEvent(corrected)).toMatchObject({ corrected: true, priced: false });
    const original = await prisma.cricketEvent.findFirst({ where: { matchId: match.id, sourceEventId: four!.sourceEventId, correctionState: "SUPERSEDED" } });
    expect(original?.supersededById).toBeTruthy();
    expect(await prisma.matchEvent.count({ where: { playerId: player.id, kind: "SIX" } })).toBe(0);
    expect(await prisma.priceApplication.count({ where: { playerId: player.id } })).toBe(0);
  });
});

test("an exact unused name is only a suggestion", async () => {
  await resetCricbuzz();
  const player = await makePlayer("Virat Kohli");
  const match = await prisma.cricketMatch.create({
    data: { competition: "Suggest", homeTeam: "India", awayTeam: "Australia", scheduledAt: new Date(), status: "SCHEDULED" },
  });
  const [event] = normalizeCommentary(match.id, parseCommentary(commentary, "suggest-1"), new Date());
  const suggestion = { ...event!, battingExternalId: "name-only-1", battingName: "Virat Kohli", sourceEventId: "cb:suggest:name-only-1" };
  expect(await ingestNormalizedEvent(suggestion)).toMatchObject({ stored: true, priced: false, unmapped: true });
  const mapping = await prisma.playerFeedMapping.findUnique({ where: { source_externalPlayerId: { source: "Cricbuzz", externalPlayerId: "name-only-1" } } });
  expect(mapping).toMatchObject({ mappingStatus: "NEEDS_REVIEW", internalPlayerId: null });
  expect(mapping?.internalPlayerId).not.toBe(player.id);
});

test("shadow never prices, and active real events price only when the global lock is on", async () => {
  await withEngine("EVENT_DRIVEN", async () => {
    await resetCricbuzz();
    const actor = await prisma.user.create({ data: { phone: `+919${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`, displayName: "Feed Admin", role: "ADMIN" } });
    const player = await makePlayer("Locked Batter");
    const match = await prisma.cricketMatch.create({
      data: { competition: "Lock", homeTeam: "India", awayTeam: "Australia", scheduledAt: new Date(), status: "LIVE" },
    });
    await mapFeedPlayer({
      matchId: match.id,
      source: "Cricbuzz",
      externalPlayerId: "lock-batter",
      externalPlayerName: "Locked Batter",
      internalPlayerId: player.id,
      participationStatus: "ACTIVE",
    });
    const base = normalizeCommentary(match.id, parseCommentary(commentary, "lock-1"), new Date("2026-09-28T12:00:00.000Z")).find((event) => event.eventType === "SIX");
    const shadowEvent = { ...base!, battingExternalId: "lock-batter", bowlingExternalId: "lock-bowler", sourceEventId: "cb:lock:shadow" };
    expect(await ingestNormalizedEvent(shadowEvent)).toMatchObject({ stored: true, priced: false });
    expect(await prisma.matchEvent.count({ where: { playerId: player.id } })).toBe(0);

    await prisma.feedSourceState.update({ where: { source: "Cricbuzz" }, data: { operatingMode: "ACTIVE", lastPollOutcome: "OK", status: "HEALTHY" } });
    await prisma.feedActivation.create({
      data: {
        source: "Cricbuzz",
        matchId: match.id,
        activatedAt: new Date(Date.now() - 1000),
        activationInnings: 1,
        activationOver: 12,
        activationBall: 2,
        activationReason: "test boundary",
        baselinePending: false,
      },
    });
    const locked = { ...shadowEvent, sourceEventId: "cb:lock:active-off" };
    expect(await ingestNormalizedEvent(locked)).toMatchObject({ stored: true, priced: false });
    expect(await prisma.matchEvent.count({ where: { playerId: player.id } })).toBe(0);

    await setRealSourcePricingEnabled({ enabled: true, actorId: actor.id, reason: "open the real source lock" });
    expect((await getSettings()).realSourcePricingEnabled).toBe(true);
    const opened = { ...shadowEvent, over: 12, ball: 3, sequence: shadowEvent.sequence + 1, sourceEventId: "cb:lock:active-on" };
    expect(await ingestNormalizedEvent(opened)).toMatchObject({ stored: true, priced: false });
    await prisma.feedSourceState.update({ where: { source: "Consensus" }, data: { operatingMode: "ACTIVE", status: "HEALTHY" } });
    await prisma.feedActivation.create({
      data: {
        source: "Consensus",
        matchId: match.id,
        activatedAt: new Date(Date.now() - 1000),
        activationInnings: 1,
        activationOver: 12,
        activationBall: 2,
        activationReason: "consensus boundary",
        baselinePending: false,
      },
    });
    await prisma.feedHighWater.create({
      data: { source: "Consensus", matchId: match.id, startedMidMatch: false, continuity: "CONTINUOUS", latestInnings: 1, latestOver: 12, latestBall: 2 },
    });
    const agreed = { ...opened, source: "Consensus", sourceEventId: "consensus:lock:high", battingPlayerId: player.id, consensusConfidence: "CONFIDENCE_HIGH" as const, consensusIdentityConfirmed: true };
    expect(await ingestNormalizedEvent(agreed)).toMatchObject({ stored: true, priced: true });
    expect(await prisma.matchEvent.count({ where: { playerId: player.id, kind: "SIX", simulated: false } })).toBe(1);
    expect(await applyPendingPricing(player.id)).toBeGreaterThan(0);
    expect(await prisma.priceTick.count({ where: { playerId: player.id, eventType: "SIX" } })).toBe(1);
    const flagAudit = await prisma.auditLog.findFirst({ where: { entityId: "feed.realSourcePricingEnabled" }, orderBy: { createdAt: "desc" } });
    expect(flagAudit?.reason).toBe("open the real source lock");
    await setRealSourcePricingEnabled({ enabled: false, actorId: actor.id, reason: "close the real source lock" });
    await prisma.feedSourceState.update({ where: { source: "Consensus" }, data: { operatingMode: "SHADOW", enabled: false } });
    await expect(setRealSourcePricingEnabled({ enabled: true, actorId: actor.id, reason: "no" })).rejects.toThrow(/reason/i);
  });
});

test("no new event stays healthy, a parse error degrades the source, and activation rejects an unresolved mapping", async () => {
  try {
  await resetCricbuzz();
  const actor = await prisma.user.create({ data: { phone: `+919${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`, displayName: "Mode Admin", role: "ADMIN" } });
  const match = await prisma.cricketMatch.create({
    data: {
      competition: "Quiet provider",
      homeTeam: "India",
      awayTeam: "Australia",
      scheduledAt: new Date(),
      status: "LIVE",
      externalIds: { create: { source: "Cricbuzz", externalId: "quiet-1" } },
    },
  });
  await prisma.feedSourceState.update({ where: { source: "Cricbuzz" }, data: { lastAttemptAt: null, consecutiveFailures: 0 } });
  const quiet = await runCricbuzzShadow(new Date(), sourceFor(matches, commentaryEmpty));
  expect(quiet.outcome).toBe("NO_NEW_EVENT");
  let source = await prisma.feedSourceState.findUniqueOrThrow({ where: { source: "Cricbuzz" } });
  expect(source.status).toBe("HEALTHY");
  expect(source.consecutiveFailures).toBe(0);

  await prisma.feedSourceState.update({ where: { source: "Cricbuzz" }, data: { lastAttemptAt: null } });
  const broken = await runCricbuzzShadow(new Date(), sourceFor(matches, { unexpected: true }));
  expect(broken.outcome).toBe("PARSE_ERROR");
  source = await prisma.feedSourceState.findUniqueOrThrow({ where: { source: "Cricbuzz" } });
  expect(source.status).toBe("DEGRADED");
  expect(source.consecutiveFailures).toBeGreaterThan(0);

  await expect(setSourceOperatingMode({
    source: "Cricbuzz",
    mode: "ACTIVE",
    confirmSwitch: true,
    actorId: actor.id,
    reason: "try to activate",
  })).rejects.toThrow(/Map at least one participating/);

  const player = await makePlayer("Activation Batter");
  await mapFeedPlayer({
    matchId: match.id,
    source: "Cricbuzz",
    externalPlayerId: "activation-batter",
    externalPlayerName: "Activation Batter",
    internalPlayerId: player.id,
    participationStatus: "ACTIVE",
  });
  await prisma.playerFeedMapping.updateMany({
    where: { source: "Cricbuzz", mappingStatus: { not: "MAPPED" } },
    data: { mappingStatus: "MAPPED", internalPlayerId: player.id, participationStatus: "ACTIVE" },
  });
  await prisma.feedSourceState.update({
    where: { source: "Cricbuzz" },
    data: { status: "HEALTHY", consecutiveFailures: 0, lastPollOutcome: "OK", operatingMode: "SHADOW", enabled: true },
  });
  await expect(setSourceOperatingMode({
    source: "Cricbuzz",
    mode: "ACTIVE",
    confirmSwitch: false,
    actorId: actor.id,
    reason: "activate without switching",
  })).rejects.toThrow(/already active/i);
  await setSourceOperatingMode({
    source: "Cricbuzz",
    mode: "ACTIVE",
    confirmSwitch: true,
    actorId: actor.id,
    reason: "switch the live source",
  });
  expect(await prisma.feedSourceState.findUnique({ where: { source: "Cricbuzz" } })).toMatchObject({ operatingMode: "ACTIVE" });
  expect(await prisma.feedSourceState.findUnique({ where: { source: "DevelopmentSimulator" } })).toMatchObject({ operatingMode: "SHADOW" });
  const modeAudit = await prisma.auditLog.findFirst({ where: { action: "feed.source_mode", entityId: "Cricbuzz" }, orderBy: { createdAt: "desc" } });
  expect(modeAudit?.reason).toBe("switch the live source");
  } finally {
    await resetCricbuzz();
    await prisma.appSetting.deleteMany({ where: { key: { in: ["feed.realSourcePricingEnabled", "feed.realSourcePricingEnabledAt"] } } });
  }
});
