import { randomUUID } from "crypto";
import { afterAll, expect, test } from "vitest";
import type { NormalizedCricketEvent } from "@/domain/cricket-feed";
import { canProviderEventAffectPricing } from "@/domain/feed-continuity";
import { acknowledgeCorrection, ensureFeedConfig, ingestNormalizedEvent, mapFeedPlayer, observeProviderWindow, setSourceOperatingMode } from "@/server/feed";
import { prisma } from "@/server/prisma";
import { setRealSourcePricingEnabled } from "@/server/settings";

function phone() {
  return `+919${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`;
}

function delivery(matchId: string, over: number, ball: number, source = "Cricbuzz", eventType: NormalizedCricketEvent["eventType"] = "SINGLE"): NormalizedCricketEvent {
  const runs = eventType === "SIX" ? 6 : eventType === "FOUR" ? 4 : eventType === "SINGLE" ? 1 : 0;
  return {
    matchId,
    innings: 1,
    over,
    ball,
    sequence: over * 6 + ball,
    occurredAt: new Date().toISOString(),
    eventType,
    battingPlayerId: null,
    bowlingPlayerId: null,
    fielderPlayerIds: [],
    battingExternalId: "continuity-batter",
    bowlingExternalId: null,
    fielderExternalIds: [],
    battingName: "Continuity Batter",
    runsBatter: runs,
    runsExtras: 0,
    runsTotal: runs,
    wicketType: null,
    isBoundary: runs >= 4,
    isSix: eventType === "SIX",
    isFour: eventType === "FOUR",
    rawDescription: null,
    normalizedDescription: `${eventType.toLowerCase()} at ${over}.${ball}`,
    source,
    sourceEventId: `${source}:${matchId}:${over}.${ball}`,
    sourceTimestamp: new Date().toISOString(),
    confidence: 90,
  };
}

async function makePlayer(name: string) {
  const player = await prisma.player.create({
    data: {
      slug: `cont-${randomUUID()}`,
      name,
      shortName: name.slice(0, 8),
      role: "BATTER",
      referenceMidPaise: 10_000n,
      basePricePaise: 10_000n,
      midPricePaise: 10_000n,
      matchAnchorPaise: 10_000n,
      performanceMatchBps: 40,
      fictional: true,
      blurb: "Continuity test",
      tradable: true,
    },
  });
  await prisma.priceTick.create({ data: { playerId: player.id, midPaise: 10_000n, source: "test" } });
  return player;
}

async function liveMatch(label: string) {
  return prisma.cricketMatch.create({
    data: {
      competition: label,
      homeTeam: "India",
      awayTeam: "Australia",
      scheduledAt: new Date(),
      status: "LIVE",
      externalIds: { create: { source: "Cricbuzz", externalId: `cont-${randomUUID()}` } },
    },
  });
}

async function withEngine(run: () => Promise<void>) {
  const previous = await prisma.appSetting.findUnique({ where: { key: "pricing.engineMode" } });
  await prisma.appSetting.upsert({
    where: { key: "pricing.engineMode" },
    create: { key: "pricing.engineMode", value: "EVENT_DRIVEN" },
    update: { value: "EVENT_DRIVEN" },
  });
  try {
    await run();
  } finally {
    if (previous) await prisma.appSetting.update({ where: { key: "pricing.engineMode" }, data: { value: previous.value ?? "SIMULATION" } });
    else await prisma.appSetting.deleteMany({ where: { key: "pricing.engineMode" } });
    await prisma.appSetting.deleteMany({ where: { key: { in: ["feed.realSourcePricingEnabled", "feed.realSourcePricingEnabledAt"] } } });
    await prisma.feedSourceState.update({ where: { source: "Cricbuzz" }, data: { operatingMode: "SHADOW", enabled: true, status: "HEALTHY" } });
    await prisma.feedSourceState.update({ where: { source: "DevelopmentSimulator" }, data: { operatingMode: "ACTIVE", enabled: true, status: "HEALTHY" } });
  }
}

afterAll(async () => {
  await prisma.feedGapRecord.deleteMany();
  await prisma.feedUnclassifiedEvent.deleteMany();
  await prisma.feedReconciliationNote.deleteMany();
  await prisma.shadowMatchSignoff.deleteMany();
  await prisma.feedIncident.deleteMany();
  await prisma.matchScoreSnapshot.deleteMany();
  await prisma.feedHighWater.deleteMany();
  await prisma.feedActivation.deleteMany();
  await prisma.cricketMatchExternalId.deleteMany({ where: { source: { in: ["Cricbuzz", "CREX"] } } });
  await prisma.feedSourceState.update({ where: { source: "Cricbuzz" }, data: { operatingMode: "SHADOW", enabled: true, status: "HEALTHY", lastPollOutcome: "OK", consecutiveFailures: 0, lastAttemptAt: null } }).catch(() => undefined);
  await prisma.feedSourceState.update({ where: { source: "Consensus" }, data: { operatingMode: "SHADOW", enabled: false, status: "HEALTHY" } }).catch(() => undefined);
  await prisma.feedSourceState.update({ where: { source: "DevelopmentSimulator" }, data: { operatingMode: "ACTIVE", enabled: true, status: "HEALTHY" } }).catch(() => undefined);
});

test("shadow history stays unpriced after activation and the global flag", async () => {
  await ensureFeedConfig();
  await withEngine(async () => {
    const actor = await prisma.user.create({ data: { phone: phone(), displayName: "Continuity Admin", role: "ADMIN" } });
    const player = await makePlayer("Boundary Batter");
    const match = await liveMatch("Boundaries");
    await mapFeedPlayer({
      matchId: match.id,
      source: "Cricbuzz",
      externalPlayerId: "continuity-batter",
      externalPlayerName: "Boundary Batter",
      internalPlayerId: player.id,
      participationStatus: "ACTIVE",
    });
    const oldEvent = delivery(match.id, 0, 1, "Cricbuzz", "FOUR");
    expect(await ingestNormalizedEvent(oldEvent)).toMatchObject({ stored: true, priced: false });
    await prisma.feedSourceState.update({ where: { source: "Cricbuzz" }, data: { operatingMode: "ACTIVE", status: "HEALTHY", lastPollOutcome: "OK" } });
    await prisma.feedActivation.create({
      data: {
        source: "Cricbuzz",
        matchId: match.id,
        activatedAt: new Date(),
        activationInnings: 1,
        activationOver: 0,
        activationBall: 1,
        activationReason: "test activation",
        baselinePending: false,
      },
    });
    expect(await ingestNormalizedEvent(oldEvent)).toMatchObject({ duplicate: true, priced: false });
    const beforeFlag = delivery(match.id, 0, 2, "Cricbuzz", "SIX");
    expect(await ingestNormalizedEvent(beforeFlag)).toMatchObject({ stored: true, priced: false });
    await setRealSourcePricingEnabled({ enabled: true, actorId: actor.id, reason: "open the pricing boundary" });
    expect(await ingestNormalizedEvent(beforeFlag)).toMatchObject({ duplicate: true, priced: false });
    expect(canProviderEventAffectPricing({
      source: "Cricbuzz",
      operatingMode: "ACTIVE",
      engineAllowsPricing: true,
      realSourcePricingEnabled: true,
      eventIngestedAtMs: beforeFlag.occurredAt ? Date.now() - 60_000 : 0,
      sourceActivatedAtMs: Date.now() - 30_000,
      globalPricingEnabledAtMs: Date.now(),
      activationCursor: { innings: 1, over: 0, ball: 1 },
      baselinePending: false,
      event: { innings: 1, over: 0, ball: 2 },
      superseded: false,
      mapped: true,
      alreadyPriced: false,
      matchStatus: "LIVE",
      continuity: "CONTINUOUS",
      historicalContext: false,
    })).toBe(false);
    const fresh = delivery(match.id, 0, 3, "Cricbuzz", "SIX");
    expect(await ingestNormalizedEvent(fresh)).toMatchObject({ stored: true, priced: false });
    await prisma.feedSourceState.update({ where: { source: "Consensus" }, data: { operatingMode: "ACTIVE", status: "HEALTHY" } });
    await prisma.feedActivation.create({
      data: {
        source: "Consensus",
        matchId: match.id,
        activatedAt: new Date(),
        activationInnings: 1,
        activationOver: 0,
        activationBall: 1,
        activationReason: "consensus activation",
        baselinePending: false,
      },
    });
    await prisma.feedHighWater.create({
      data: { source: "Consensus", matchId: match.id, startedMidMatch: false, continuity: "CONTINUOUS", latestInnings: 1, latestOver: 0, latestBall: 1 },
    });
    const agreed = { ...fresh, source: "Consensus", sourceEventId: "consensus:continuity:high", battingPlayerId: player.id, consensusConfidence: "CONFIDENCE_HIGH" as const, consensusIdentityConfirmed: true };
    expect(await ingestNormalizedEvent(agreed)).toMatchObject({ stored: true, priced: true });
    expect(await prisma.matchEvent.count({ where: { playerId: player.id, simulated: false } })).toBe(1);
  });
});

test("restart, overlap, gaps, mid-match context, and snapshots stay out of pricing", async () => {
  await ensureFeedConfig();
  const player = await makePlayer("Gap Batter");
  const match = await liveMatch("Gaps");
  await mapFeedPlayer({
    matchId: match.id,
    source: "Cricbuzz",
    externalPlayerId: "continuity-batter",
    externalPlayerName: "Gap Batter",
    internalPlayerId: player.id,
    participationStatus: "ACTIVE",
  });
  const priceBefore = player.midPricePaise;
  await observeProviderWindow({ source: "Cricbuzz", matchId: match.id, events: [delivery(match.id, 10, 1), delivery(match.id, 10, 2)] });
  let water = await prisma.feedHighWater.findUniqueOrThrow({ where: { source_matchId: { source: "Cricbuzz", matchId: match.id } } });
  expect(water.startedMidMatch).toBe(true);
  expect(water.latestBall).toBe(2);
  const resumed = await observeProviderWindow({
    source: "Cricbuzz",
    matchId: match.id,
    events: [delivery(match.id, 10, 1), delivery(match.id, 10, 2), delivery(match.id, 10, 3)],
  });
  expect(resumed.stored).toBe(1);
  water = await prisma.feedHighWater.findUniqueOrThrow({ where: { source_matchId: { source: "Cricbuzz", matchId: match.id } } });
  expect(water.latestBall).toBe(3);
  expect(water.duplicateCount).toBeGreaterThan(0);

  const gapMatch = await liveMatch("Missing");
  await observeProviderWindow({ source: "Cricbuzz", matchId: gapMatch.id, events: [delivery(gapMatch.id, 17, 3)] });
  const possible = await observeProviderWindow({ source: "Cricbuzz", matchId: gapMatch.id, events: [delivery(gapMatch.id, 17, 6)] });
  expect(possible.continuity).toBe("POSSIBLE_GAP");

  const recoverMatch = await liveMatch("Recover");
  await observeProviderWindow({ source: "Cricbuzz", matchId: recoverMatch.id, events: [delivery(recoverMatch.id, 17, 3)] });
  const recovered = await observeProviderWindow({
    source: "Cricbuzz",
    matchId: recoverMatch.id,
    events: [delivery(recoverMatch.id, 17, 6)],
    recovered: [delivery(recoverMatch.id, 17, 4), delivery(recoverMatch.id, 17, 5)],
    recoveryRan: true,
  });
  expect(recovered.continuity).toBe("CONTINUOUS");
  expect((await prisma.feedHighWater.findUniqueOrThrow({ where: { source_matchId: { source: "Cricbuzz", matchId: recoverMatch.id } } })).recoveredGapCount).toBeGreaterThan(0);

  const lost = await liveMatch("Lost");
  await observeProviderWindow({ source: "Cricbuzz", matchId: lost.id, events: [delivery(lost.id, 17, 3)] });
  const unresolved = await observeProviderWindow({
    source: "Cricbuzz",
    matchId: lost.id,
    events: [delivery(lost.id, 17, 6)],
    recovered: [],
    recoveryRan: true,
  });
  expect(unresolved.continuity).toBe("UNRESOLVED_GAP");
  expect(await prisma.feedIncident.count({ where: { matchId: lost.id, type: "UNRESOLVED_GAP", resolvedAt: null } })).toBe(1);

  const mid = await liveMatch("Mid");
  const actor = await prisma.user.create({ data: { phone: phone(), displayName: "Mid Admin", role: "ADMIN" } });
  await prisma.appSetting.upsert({
    where: { key: "pricing.engineMode" },
    create: { key: "pricing.engineMode", value: "EVENT_DRIVEN" },
    update: { value: "EVENT_DRIVEN" },
  });
  await setRealSourcePricingEnabled({ enabled: true, actorId: actor.id, reason: "check mid-match history stays unpriced" });
  await prisma.feedSourceState.update({ where: { source: "Cricbuzz" }, data: { operatingMode: "ACTIVE" } });
  await prisma.feedActivation.create({
    data: { source: "Cricbuzz", matchId: mid.id, activatedAt: new Date(Date.now() - 1000), activationReason: "mid", baselinePending: false },
  });
  await observeProviderWindow({ source: "Cricbuzz", matchId: mid.id, events: [delivery(mid.id, 41, 4, "Cricbuzz", "SIX")] });
  expect((await prisma.feedHighWater.findUniqueOrThrow({ where: { source_matchId: { source: "Cricbuzz", matchId: mid.id } } })).startedMidMatch).toBe(true);
  expect(await prisma.matchEvent.count({ where: { playerId: player.id } })).toBe(0);
  expect(await ingestNormalizedEvent(delivery(mid.id, 8, 1, "Cricbuzz", "SIX"))).toMatchObject({ priced: false });
  await prisma.appSetting.deleteMany({ where: { key: { in: ["feed.realSourcePricingEnabled", "feed.realSourcePricingEnabledAt"] } } });
  await prisma.appSetting.upsert({
    where: { key: "pricing.engineMode" },
    create: { key: "pricing.engineMode", value: "SIMULATION" },
    update: { value: "SIMULATION" },
  });

  const board = await liveMatch("Board");
  const boardEvent = delivery(board.id, 0, 1);
  await observeProviderWindow({
    source: "Cricbuzz",
    matchId: board.id,
    events: [boardEvent],
    snapshot: { innings: 1, scoreRuns: 143, wickets: 4, overs: "0.1", status: "In progress" },
  });
  expect(await prisma.matchEvent.count({ where: { idempotencyKey: { contains: board.id } } })).toBe(0);
  const snapshot = await prisma.matchScoreSnapshot.findFirstOrThrow({ where: { matchId: board.id } });
  expect(snapshot.reconciliation).toBe("CONFLICT");
  expect(await prisma.feedIncident.count({ where: { matchId: board.id, type: "RECONCILIATION_CONFLICT", resolvedAt: null } })).toBe(1);
  expect((await prisma.player.findUniqueOrThrow({ where: { id: player.id } })).midPricePaise).toBe(priceBefore);
  await prisma.feedSourceState.update({ where: { source: "Cricbuzz" }, data: { operatingMode: "SHADOW", enabled: true, status: "HEALTHY" } });
  await prisma.feedSourceState.update({ where: { source: "DevelopmentSimulator" }, data: { operatingMode: "ACTIVE", enabled: true, status: "HEALTHY" } });
});

test("a source switch does not replay the recent window or reset performance", async () => {
  await ensureFeedConfig();
  const player = await makePlayer("Switch Batter");
  const match = await liveMatch("Switch");
  await mapFeedPlayer({
    matchId: match.id,
    source: "CREX",
    externalPlayerId: "continuity-batter",
    externalPlayerName: "Switch Batter",
    internalPlayerId: player.id,
    participationStatus: "ACTIVE",
  });
  await prisma.player.update({ where: { id: player.id }, data: { performanceMatchBps: 40, matchAnchorPaise: 10_000n } });
  await prisma.feedActivation.create({
    data: {
      source: "CREX",
      matchId: match.id,
      activatedAt: new Date(),
      baselinePending: true,
      activationReason: "switch baseline",
    },
  });
  await observeProviderWindow({
    source: "CREX",
    matchId: match.id,
    events: [delivery(match.id, 4, 2, "CREX", "SIX"), delivery(match.id, 4, 3, "CREX", "FOUR")],
  });
  expect(await prisma.matchEvent.count({ where: { playerId: player.id } })).toBe(0);
  expect((await prisma.player.findUniqueOrThrow({ where: { id: player.id } })).performanceMatchBps).toBe(40);
  const activation = await prisma.feedActivation.findUniqueOrThrow({ where: { source_matchId: { source: "CREX", matchId: match.id } } });
  expect(activation.baselinePending).toBe(false);
  expect(activation.activationBall).toBe(3);
});

test("acknowledging a correction audits it and does not reprice", async () => {
  await ensureFeedConfig();
  const actor = await prisma.user.create({ data: { phone: phone(), displayName: "Correction Admin", role: "ADMIN" } });
  const player = await makePlayer("Correction Batter");
  const match = await liveMatch("Correction");
  await mapFeedPlayer({
    matchId: match.id,
    source: "Cricbuzz",
    externalPlayerId: "continuity-batter",
    externalPlayerName: "Correction Batter",
    internalPlayerId: player.id,
    participationStatus: "ACTIVE",
  });
  const original = delivery(match.id, 3, 1, "Cricbuzz", "FOUR");
  await ingestNormalizedEvent(original);
  const corrected = { ...original, eventType: "SIX" as const, runsBatter: 6, runsTotal: 6, isSix: true, isFour: false, isBoundary: true };
  expect(await ingestNormalizedEvent(corrected)).toMatchObject({ corrected: true, priced: false });
  const correction = await prisma.cricketEvent.findFirstOrThrow({ where: { matchId: match.id, correctsEventId: { not: null } } });
  const ticks = await prisma.priceTick.count({ where: { playerId: player.id } });
  await acknowledgeCorrection({ eventId: correction.id, actorId: actor.id, reason: "staff reviewed the changed ball" });
  expect(await prisma.priceTick.count({ where: { playerId: player.id } })).toBe(ticks);
  expect(await prisma.matchEvent.count({ where: { playerId: player.id } })).toBe(0);
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "feed.correction_acknowledge", entityId: correction.id } });
  expect(audit.reason).toBe("staff reviewed the changed ball");
  expect(canProviderEventAffectPricing({
    source: "Cricbuzz",
    operatingMode: "ACTIVE",
    engineAllowsPricing: true,
    realSourcePricingEnabled: true,
    eventIngestedAtMs: Date.now(),
    sourceActivatedAtMs: Date.now() - 1000,
    globalPricingEnabledAtMs: Date.now() - 1000,
    activationCursor: null,
    baselinePending: false,
    event: { innings: 1, over: 3, ball: 1 },
    superseded: true,
    mapped: true,
    alreadyPriced: false,
    matchStatus: "LIVE",
    continuity: "CONTINUOUS",
    historicalContext: false,
  })).toBe(false);
});

test("activation rejects an unresolved gap", async () => {
  await ensureFeedConfig();
  const actor = await prisma.user.create({ data: { phone: phone(), displayName: "Gap Admin", role: "ADMIN" } });
  const player = await makePlayer("Guard Batter");
  const match = await liveMatch("Guard");
  await mapFeedPlayer({
    matchId: match.id,
    source: "Cricbuzz",
    externalPlayerId: "guard-batter",
    externalPlayerName: "Guard Batter",
    internalPlayerId: player.id,
    participationStatus: "ACTIVE",
  });
  await prisma.playerFeedMapping.updateMany({
    where: { source: "Cricbuzz", mappingStatus: { not: "MAPPED" } },
    data: { mappingStatus: "MAPPED", internalPlayerId: player.id, participationStatus: "ACTIVE" },
  });
  await prisma.feedHighWater.create({
    data: { source: "Cricbuzz", matchId: match.id, continuity: "UNRESOLVED_GAP", latestInnings: 1, latestOver: 17, latestBall: 3 },
  });
  await prisma.feedSourceState.update({ where: { source: "Cricbuzz" }, data: { operatingMode: "SHADOW", status: "HEALTHY", lastPollOutcome: "OK", enabled: true } });
  await expect(setSourceOperatingMode({
    source: "Cricbuzz",
    mode: "ACTIVE",
    confirmSwitch: true,
    actorId: actor.id,
    reason: "try to activate through a gap",
  })).rejects.toThrow(/gap/i);
  expect(await prisma.feedSourceState.findUnique({ where: { source: "Cricbuzz" } })).toMatchObject({ operatingMode: "SHADOW" });
});
