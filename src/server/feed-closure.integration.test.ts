import { randomUUID } from "crypto";
import { expect, test } from "vitest";
import { nextSimulatorDelivery } from "@/domain/cricket-feed";
import { PERFORMANCE_RULES } from "@/domain/pricing-engine";
import type { RealtimeNotice } from "@/domain/realtime";
import { ensureFeedConfig, ingestNormalizedEvent, mapFeedPlayer, runFeedCycle, setMatchStatus } from "@/server/feed";
import { postJournal, withUserLock } from "@/server/ledger";
import { maintainPrices } from "@/server/price-cycle";
import { applyPendingPricing } from "@/server/pricing";
import { prisma } from "@/server/prisma";
import { publicPricePayload } from "@/server/queries";
import { onRealtimeNotice, startRealtimeListener, stopRealtimeListener } from "@/server/realtime";
import { backfillPlayerRiskControls, ensurePlayerRiskControl } from "@/server/risk";
import { createQuote, executeTrade } from "@/server/trading";

async function makeUser(cashPaise: bigint) {
  const phone = `+91${9}${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`;
  const user = await prisma.user.create({ data: { phone, displayName: "Feed Fan", role: "CUSTOMER" } });
  await withUserLock(user.id, (tx) =>
    postJournal(tx, {
      entryType: "TEST_CASH",
      description: "Test cash",
      lines: [
        { userId: user.id, account: "USER_CASH", amountPaise: cashPaise, lineKey: `test:${user.id}:cash` },
        { userId: null, account: "OFFSET_CASH", amountPaise: -cashPaise, lineKey: `test:${user.id}:offset` },
      ],
    }),
  );
  return user;
}

async function makePlayer(midPaise: bigint) {
  const player = await prisma.player.create({
    data: {
      slug: `feed-${randomUUID()}`,
      name: "Feed Batter",
      shortName: "Feed",
      role: "BATTER",
      referenceMidPaise: midPaise,
      basePricePaise: midPaise,
      midPricePaise: midPaise,
      matchAnchorPaise: midPaise,
      fictional: true,
      blurb: "Feed test player",
      tradable: true,
    },
  });
  await prisma.priceTick.create({
    data: { playerId: player.id, midPaise, source: "test" },
  });
  return player;
}

async function buy(userId: string, playerId: string, quantity: number) {
  const quote = await createQuote({
    userId,
    playerId,
    side: "BUY",
    quantity,
    requestedBonusPaise: 0n,
    seenMidPaise: null,
    confirmPriceChange: true,
  });
  return executeTrade({ userId, quoteId: quote.quoteId, idempotencyKey: randomUUID() });
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

test("a simulator six prices once, reevaluates risk, and crosses postgres notify", async () => {
  await withEngine("EVENT_DRIVEN", async () => {
    const previousLimit = await prisma.appSetting.findUnique({ where: { key: "risk.maxPlatformPlayerLiabilityPaise" } });
    await prisma.appSetting.upsert({
      where: { key: "risk.maxPlatformPlayerLiabilityPaise" },
      create: { key: "risk.maxPlatformPlayerLiabilityPaise", value: "10000000" },
      update: { value: "10000000" },
    });
    try {
      const user = await makeUser(20_000_000n);
      const player = await makePlayer(10_000n);
      await ensurePlayerRiskControl(player.id);
      const match = await prisma.cricketMatch.create({
        data: { competition: "Closure", homeTeam: "India", awayTeam: "Australia", scheduledAt: new Date(), status: "SCHEDULED" },
      });
      await mapFeedPlayer({
        matchId: match.id,
        source: "DevelopmentSimulator",
        externalPlayerId: "ext-six",
        externalPlayerName: "Feed Batter",
        internalPlayerId: player.id,
        participationStatus: "ACTIVE",
      });
      await setMatchStatus(match.id, "LIVE");
      await buy(user.id, player.id, 699);
      expect((await prisma.playerRiskControl.findUniqueOrThrow({ where: { playerId: player.id } })).lastState).toBe("NORMAL");
      const anchor = (await prisma.player.findUniqueOrThrow({ where: { id: player.id } })).matchAnchorPaise;
      const event = nextSimulatorDelivery({
        matchId: match.id,
        cursor: 3,
        battingExternalId: "ext-six",
        bowlingExternalId: "ext-bowl",
        now: new Date("2026-09-28T14:12:11.000Z"),
      });
      expect(event.eventType).toBe("SIX");
      const stored = await ingestNormalizedEvent(event);
      expect(stored).toMatchObject({ stored: true, priced: true, corrected: false });
      expect(await prisma.cricketEvent.count({ where: { matchId: match.id, eventType: "SIX" } })).toBe(1);
      expect(await prisma.matchEvent.count({ where: { playerId: player.id, kind: "SIX", simulated: false } })).toBe(1);
      await startRealtimeListener();
      const received = new Promise<RealtimeNotice>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("listener timeout")), 8_000);
        const stop = onRealtimeNotice((notice) => {
          if (notice.type !== "price" || notice.playerId !== player.id) return;
          clearTimeout(timer);
          stop();
          resolve(notice);
        });
      });
      const beforeSimulation = await prisma.priceTick.count({ where: { source: "SIMULATION_ONLY" } });
      expect(await maintainPrices()).toBe("event-driven");
      expect(await prisma.priceTick.count({ where: { source: "SIMULATION_ONLY" } })).toBe(beforeSimulation);
      const notice = await received;
      const tick = await prisma.priceTick.findFirstOrThrow({
        where: { playerId: player.id, source: "performance", eventType: "SIX" },
      });
      expect(await prisma.priceTick.count({ where: { playerId: player.id, source: "performance", eventType: "SIX" } })).toBe(1);
      expect(tick.performanceBps).toBe(PERFORMANCE_RULES.SIX?.bps);
      expect(notice.priceTickId).toBe(tick.id);
      expect((await prisma.player.findUniqueOrThrow({ where: { id: player.id } })).matchAnchorPaise).toBe(anchor);
      expect((await prisma.playerRiskControl.findUniqueOrThrow({ where: { playerId: player.id } })).lastState).toBe("WARNING");
      const snapshot = await publicPricePayload();
      const row = snapshot.players.find((item) => item.id === player.id);
      expect(row?.midPaise).toBe(tick.midPaise.toString());
      expect(row?.lastEvent).toMatch(/six/i);
      expect(row?.whyLine).toBe("Six");
      expect(row?.live).toBe(true);
      const recovered = await publicPricePayload();
      expect(recovered.players.find((item) => item.id === player.id)?.midPaise).toBe(row?.midPaise);
      await applyPendingPricing(player.id);
      expect(await prisma.priceTick.count({ where: { playerId: player.id, source: "performance", eventType: "SIX" } })).toBe(1);
    } finally {
      await stopRealtimeListener();
      if (previousLimit) {
        await prisma.appSetting.update({ where: { key: "risk.maxPlatformPlayerLiabilityPaise" }, data: { value: previousLimit.value ?? "10000000" } });
      } else {
        await prisma.appSetting.deleteMany({ where: { key: "risk.maxPlatformPlayerLiabilityPaise" } });
      }
    }
  });
});

test("simulation stores a feed event without pricing it", async () => {
  await withEngine("SIMULATION", async () => {
    const player = await makePlayer(10_000n);
    const match = await prisma.cricketMatch.create({
      data: { competition: "Sim", homeTeam: "India", awayTeam: "Australia", scheduledAt: new Date(), status: "LIVE" },
    });
    await prisma.playerFeedMapping.create({
      data: {
        matchId: match.id,
        source: "DevelopmentSimulator",
        externalPlayerId: `ext-${player.id}`,
        externalPlayerName: "Feed Batter",
        internalPlayerId: player.id,
        mappingStatus: "MAPPED",
        participationStatus: "ACTIVE",
      },
    });
    const event = nextSimulatorDelivery({
      matchId: match.id,
      cursor: 3,
      battingExternalId: `ext-${player.id}`,
      bowlingExternalId: "ext-bowl",
      now: new Date("2026-09-28T15:00:00.000Z"),
    });
    expect(await ingestNormalizedEvent(event)).toMatchObject({ stored: true, priced: false });
    expect(await prisma.matchEvent.count({ where: { playerId: player.id, simulated: false } })).toBe(0);
    expect(await applyPendingPricing(player.id)).toBe(0);
    expect(await prisma.priceTick.count({ where: { playerId: player.id, source: "performance" } })).toBe(0);
  });
});

test("repeated live status keeps the anchor and a second live match keeps the player live", async () => {
  const player = await makePlayer(8_000n);
  await prisma.player.update({ where: { id: player.id }, data: { matchAnchorPaise: 1n, performanceMatchBps: 25, liveMatch: false } });
  const first = await prisma.cricketMatch.create({
    data: { competition: "Life", homeTeam: "India", awayTeam: "England", scheduledAt: new Date(), status: "SCHEDULED" },
  });
  const second = await prisma.cricketMatch.create({
    data: { competition: "Life", homeTeam: "India", awayTeam: "Pakistan", scheduledAt: new Date(), status: "SCHEDULED" },
  });
  await mapFeedPlayer({
    matchId: first.id,
    source: "DevelopmentSimulator",
    externalPlayerId: `life-${player.id}`,
    externalPlayerName: "Feed Batter",
    internalPlayerId: player.id,
    participationStatus: "ACTIVE",
  });
  await setMatchStatus(first.id, "LIVE");
  let row = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
  expect(row.liveMatch).toBe(true);
  expect(row.matchAnchorPaise).toBe(8_000n);
  expect(row.performanceMatchBps).toBe(0);
  await prisma.player.update({ where: { id: player.id }, data: { performanceMatchBps: 40 } });
  await setMatchStatus(first.id, "LIVE");
  row = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
  expect(row.matchAnchorPaise).toBe(8_000n);
  expect(row.performanceMatchBps).toBe(40);
  await setMatchStatus(first.id, "INNINGS_BREAK");
  row = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
  expect(row.liveMatch).toBe(true);
  expect(row.matchAnchorPaise).toBe(8_000n);
  await setMatchStatus(first.id, "DELAYED");
  row = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
  expect(row.matchAnchorPaise).toBe(8_000n);
  expect(row.performanceMatchBps).toBe(40);
  await prisma.playerFeedMapping.create({
    data: {
      matchId: second.id,
      source: "Cricbuzz",
      externalPlayerId: `life-b-${player.id}`,
      externalPlayerName: "Feed Batter",
      internalPlayerId: player.id,
      mappingStatus: "MAPPED",
      participationStatus: "ACTIVE",
    },
  });
  await setMatchStatus(second.id, "LIVE");
  await setMatchStatus(first.id, "COMPLETED");
  row = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
  expect(row.liveMatch).toBe(true);
  expect(row.performanceMatchBps).toBe(40);
  await prisma.cricketEvent.create({
    data: {
      matchId: first.id,
      innings: 1,
      over: 1,
      ball: 1,
      sequence: 1,
      occurredAt: new Date(),
      eventType: "DOT_BALL",
      normalizedDescription: "kept for history",
      source: "DevelopmentSimulator",
      ingestionKey: `history:${first.id}`,
      pricingKeys: [],
      fielderPlayerIds: [],
    },
  });
  await setMatchStatus(second.id, "ABANDONED");
  row = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
  expect(row.liveMatch).toBe(false);
  expect(await prisma.cricketEvent.count({ where: { matchId: first.id } })).toBe(1);
});

test("a successful empty poll is not a source failure and a historical backup ball is not repriced", async () => {
  await withEngine("EVENT_DRIVEN", async () => {
    await ensureFeedConfig();
    await prisma.cricketMatch.updateMany({ data: { status: "COMPLETED" } });
    await prisma.feedControl.update({ where: { id: "default" }, data: { activeSource: "DevelopmentSimulator", lastPolledAt: null } });
    await prisma.feedSourceState.update({
      where: { source: "DevelopmentSimulator" },
      data: { enabled: true, priority: 1, status: "HEALTHY", consecutiveFailures: 0 },
    });
    for (const source of ["CREX", "Cricbuzz", "Sportskeeda", "PaidProvider"]) {
      await prisma.feedSourceState.update({
        where: { source },
        data: { enabled: false, status: "DISABLED", consecutiveFailures: 0 },
      });
    }
    await prisma.cricketMatch.create({
      data: { competition: "Quiet", homeTeam: "India", awayTeam: "Australia", scheduledAt: new Date(), status: "LIVE" },
    });
    const beforeSuccess = (await prisma.feedSourceState.findUniqueOrThrow({ where: { source: "DevelopmentSimulator" } })).successCount;
    const cycle = await runFeedCycle(new Date());
    expect(cycle.stored).toBe(0);
    expect(cycle.source).toBe("DevelopmentSimulator");
    const source = await prisma.feedSourceState.findUniqueOrThrow({ where: { source: "DevelopmentSimulator" } });
    expect(source.consecutiveFailures).toBe(0);
    expect(source.status).toBe("HEALTHY");
    expect(source.successCount).toBe(beforeSuccess + 1);

    const player = await makePlayer(9_000n);
    const anchor = 4_321n;
    await prisma.player.update({ where: { id: player.id }, data: { matchAnchorPaise: anchor, performanceMatchBps: 12 } });
    const match = await prisma.cricketMatch.create({
      data: { competition: "Failover", homeTeam: "India", awayTeam: "Australia", scheduledAt: new Date(), status: "LIVE" },
    });
    await prisma.playerFeedMapping.create({
      data: {
        matchId: match.id,
        source: "DevelopmentSimulator",
        externalPlayerId: `fail-${player.id}`,
        externalPlayerName: "Feed Batter",
        internalPlayerId: player.id,
        mappingStatus: "MAPPED",
        participationStatus: "ACTIVE",
      },
    });
    const event = nextSimulatorDelivery({
      matchId: match.id,
      cursor: 3,
      battingExternalId: `fail-${player.id}`,
      bowlingExternalId: "ext-bowl",
      now: new Date("2026-09-28T16:00:00.000Z"),
    });
    expect(await ingestNormalizedEvent(event)).toMatchObject({ priced: true });
    await applyPendingPricing(player.id);
    const priced = await prisma.priceTick.count({ where: { playerId: player.id, eventType: "SIX" } });
    const backup = await ingestNormalizedEvent({ ...event, source: "Cricbuzz", sourceEventId: "historical-same-ball" });
    expect(backup).toMatchObject({ stored: true, priced: false });
    expect(await prisma.priceTick.count({ where: { playerId: player.id, eventType: "SIX" } })).toBe(priced);
    const after = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(after.matchAnchorPaise).toBe(anchor);
    expect(after.performanceMatchBps).toBe(42);
  });
});

test("a provider correction keeps the original event and does not reprice", async () => {
  await withEngine("EVENT_DRIVEN", async () => {
    const player = await makePlayer(7_500n);
    const match = await prisma.cricketMatch.create({
      data: { competition: "Correction", homeTeam: "India", awayTeam: "Australia", scheduledAt: new Date(), status: "LIVE" },
    });
    await prisma.playerFeedMapping.create({
      data: {
        matchId: match.id,
        source: "DevelopmentSimulator",
        externalPlayerId: `corr-${player.id}`,
        externalPlayerName: "Feed Batter",
        internalPlayerId: player.id,
        mappingStatus: "MAPPED",
        participationStatus: "ACTIVE",
      },
    });
    const event = nextSimulatorDelivery({
      matchId: match.id,
      cursor: 2,
      battingExternalId: `corr-${player.id}`,
      bowlingExternalId: "ext-bowl",
      now: new Date("2026-09-28T17:00:00.000Z"),
    });
    expect(await ingestNormalizedEvent(event)).toMatchObject({ stored: true, priced: true });
    const correction = await ingestNormalizedEvent({ ...event, eventType: "SIX", runsBatter: 6, runsTotal: 6, isSix: true, isFour: false, isBoundary: true });
    expect(correction).toMatchObject({ stored: true, priced: false, corrected: true });
    const original = await prisma.cricketEvent.findFirstOrThrow({ where: { matchId: match.id, correctsEventId: null } });
    expect(original.eventType).toBe("FOUR");
    expect(original.correctionState).toBe("SUPERSEDED");
    const next = await prisma.cricketEvent.findFirstOrThrow({ where: { correctsEventId: original.id } });
    expect(next.eventType).toBe("SIX");
    expect(next.pricingKeys).toEqual([]);
    expect(original.supersededById).toBe(next.id);
    expect(await prisma.matchEvent.count({ where: { playerId: player.id, kind: "SIX" } })).toBe(0);
    expect(await prisma.matchEvent.count({ where: { playerId: player.id, kind: "FOUR" } })).toBe(1);
  });
});

test("a new tradable player gets an auto risk-control row and backfill does not reset it", async () => {
  const player = await makePlayer(5_000n);
  expect(await prisma.playerRiskControl.findUnique({ where: { playerId: player.id } })).toBeNull();
  await ensurePlayerRiskControl(player.id);
  expect(await prisma.playerRiskControl.findUniqueOrThrow({ where: { playerId: player.id } })).toMatchObject({
    manualMode: "AUTO",
    lastState: "NORMAL",
  });
  await prisma.playerRiskControl.update({ where: { playerId: player.id }, data: { lastState: "WARNING" } });
  const other = await makePlayer(5_100n);
  expect(await backfillPlayerRiskControls()).toBeGreaterThanOrEqual(1);
  expect((await prisma.playerRiskControl.findUniqueOrThrow({ where: { playerId: player.id } })).lastState).toBe("WARNING");
  expect((await prisma.playerRiskControl.findUniqueOrThrow({ where: { playerId: other.id } })).lastState).toBe("NORMAL");
  expect(await backfillPlayerRiskControls()).toBe(0);
});
