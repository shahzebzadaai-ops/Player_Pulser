import { randomUUID } from "crypto";
import { expect, test } from "vitest";
import { assertAdmin } from "@/server/auth";
import { accountBalance, postJournal, withUserLock } from "@/server/ledger";
import { applyProviderResult, createDeposit, requestWithdrawal, signWebhook } from "@/server/payments";
import { prisma } from "@/server/prisma";
import { createQuote, executeTrade } from "@/server/trading";
import { AppError } from "@/domain/errors";
import { grantWelcomeBonus } from "@/server/bonus";
import { invalidateFeatureFlags } from "@/server/features";
import { portfolio } from "@/server/queries";
import { nextSimulatorDelivery } from "@/domain/cricket-feed";
import { ingestNormalizedEvent, runFeedCycle } from "@/server/feed";
import { applyPendingPricing } from "@/server/pricing";
import { evaluatePlayerRisk, onMidPricePersisted, setPlayerRiskMode } from "@/server/risk";
import { getSettings } from "@/server/settings";

async function setFlag(key: string, enabled: boolean) {
  const settingKey = `feature.${key}`;
  await prisma.appSetting.upsert({
    where: { key: settingKey },
    create: { key: settingKey, value: enabled },
    update: { value: enabled },
  });
  invalidateFeatureFlags();
}

async function clearFlags() {
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: "feature." } } });
  invalidateFeatureFlags();
}

async function balanced() {
  const rows = await prisma.ledgerEntry.findMany({ select: { amountPaise: true } });
  const sum = rows.reduce((total, row) => total + row.amountPaise, 0n);
  expect(sum).toBe(0n);
}

async function makeUser(cashPaise = 0n) {
  const phone = `+91${9}${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`;
  const user = await prisma.user.create({
    data: { phone, displayName: "Test Fan", role: "CUSTOMER" },
  });
  if (cashPaise > 0n) {
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
  }
  return user;
}

async function makePlayer(midPaise: bigint, ageMs = 0) {
  const player = await prisma.player.create({
    data: {
      slug: `test-${randomUUID()}`,
      name: "Test Player",
      shortName: "Test",
      role: "BATTER",
      referenceMidPaise: midPaise,
      basePricePaise: midPaise,
      midPricePaise: midPaise,
      matchAnchorPaise: midPaise,
      fictional: true,
      blurb: "Test player",
      tradable: true,
    },
  });
  await prisma.priceTick.create({
    data: {
      playerId: player.id,
      midPaise,
      source: "test",
      createdAt: new Date(Date.now() - ageMs),
    },
  });
  return player;
}

async function buy(userId: string, playerId: string, quantity = 1) {
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

test("one of two concurrent buys spends the only available cash", async () => {
  const user = await makeUser(10_000n);
  const player = await makePlayer(8_040n);
  const results = await Promise.allSettled([buy(user.id, player.id), buy(user.id, player.id)]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const lots = await prisma.holdingLot.aggregate({
    where: { userId: user.id, playerId: player.id },
    _sum: { quantityRemaining: true },
  });
  expect(lots._sum.quantityRemaining).toBe(1);
  expect(await accountBalance(prisma, user.id, "USER_CASH")).toBeGreaterThanOrEqual(0n);
  await balanced();
});

test("the same trade key does not buy twice", async () => {
  const user = await makeUser(50_000n);
  const player = await makePlayer(8_040n);
  const quote = await createQuote({
    userId: user.id,
    playerId: player.id,
    side: "BUY",
    quantity: 1,
    requestedBonusPaise: 0n,
    seenMidPaise: null,
    confirmPriceChange: true,
  });
  const key = randomUUID();
  const first = await executeTrade({ userId: user.id, quoteId: quote.quoteId, idempotencyKey: key });
  const second = await executeTrade({ userId: user.id, quoteId: quote.quoteId, idempotencyKey: key });
  expect(second.replayed).toBe(true);
  expect(second.tradeId).toBe(first.tradeId);
  const lots = await prisma.holdingLot.aggregate({
    where: { userId: user.id },
    _sum: { quantityRemaining: true },
  });
  expect(lots._sum.quantityRemaining).toBe(1);
  await balanced();
});

test("insufficient cash and a partial sale keep the books exact", async () => {
  const user = await makeUser(100n);
  const player = await makePlayer(8_040n);
  await expect(buy(user.id, player.id)).rejects.toMatchObject({ code: "INSUFFICIENT_CASH" });
  expect(await accountBalance(prisma, user.id, "USER_CASH")).toBe(100n);

  const rich = await makeUser(100_000n);
  await buy(rich.id, player.id, 3);
  const sellQuote = await createQuote({
    userId: rich.id,
    playerId: player.id,
    side: "SELL",
    quantity: 1,
    requestedBonusPaise: null,
    seenMidPaise: null,
    confirmPriceChange: true,
  });
  await executeTrade({ userId: rich.id, quoteId: sellQuote.quoteId, idempotencyKey: randomUUID() });
  const left = await prisma.holdingLot.aggregate({
    where: { userId: rich.id, playerId: player.id },
    _sum: { quantityRemaining: true },
  });
  expect(left._sum.quantityRemaining).toBe(2);
  await balanced();
});

test("two full sells cannot both succeed", async () => {
  const user = await makeUser(100_000n);
  const player = await makePlayer(5_000n);
  await buy(user.id, player.id, 2);
  const sell = () =>
    createQuote({
      userId: user.id,
      playerId: player.id,
      side: "SELL",
      quantity: 2,
      requestedBonusPaise: null,
      seenMidPaise: null,
      confirmPriceChange: true,
    }).then((quote) => executeTrade({ userId: user.id, quoteId: quote.quoteId, idempotencyKey: randomUUID() }));
  const results = await Promise.allSettled([sell(), sell()]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  await balanced();
});

test("expired quotes and stale prices are refused", async () => {
  const user = await makeUser(50_000n);
  const player = await makePlayer(8_040n);
  const quote = await createQuote({
    userId: user.id,
    playerId: player.id,
    side: "BUY",
    quantity: 1,
    requestedBonusPaise: 0n,
    seenMidPaise: null,
    confirmPriceChange: true,
  });
  await prisma.quote.update({ where: { id: quote.quoteId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await expect(
    executeTrade({ userId: user.id, quoteId: quote.quoteId, idempotencyKey: randomUUID() }),
  ).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });

  const quiet = await makePlayer(8_040n, 120_000);
  await expect(buy(user.id, quiet.id)).rejects.toMatchObject({ code: "FEED_STALE" });
  await balanced();
});

test("bonus conversion, expiry, and a duplicate deposit webhook", async () => {
  const user = await makeUser(0n);
  const settings = await getSettings();
  await withUserLock(user.id, (tx) => grantWelcomeBonus(tx, user.id, settings));
  await expect(buy(user.id, (await makePlayer(8_040n)).id)).rejects.toBeInstanceOf(AppError);

  const deposit = await createDeposit({
    userId: user.id,
    amountPaise: 50_000n,
    method: "UPI",
    idempotencyKey: randomUUID(),
    simulate: "pending",
  });
  const payload = { eventId: `evt-${deposit.paymentId}`, paymentId: deposit.paymentId, status: "SETTLED" as const };
  await applyProviderResult({ ...payload, payload });
  const duplicate = await applyProviderResult({ ...payload, payload });
  expect(duplicate.duplicate).toBe(true);
  expect(await accountBalance(prisma, user.id, "USER_CASH")).toBe(50_000n);

  const player = await makePlayer(10_000n);
  const quote = await createQuote({
    userId: user.id,
    playerId: player.id,
    side: "BUY",
    quantity: 6,
    requestedBonusPaise: null,
    seenMidPaise: null,
    confirmPriceChange: true,
  });
  await executeTrade({ userId: user.id, quoteId: quote.quoteId, idempotencyKey: randomUUID() });
  const grant = await prisma.bonusGrant.findUniqueOrThrow({ where: { userId_source: { userId: user.id, source: "WELCOME" } } });
  expect(grant.status).toBe("CONVERTED");
  expect(await accountBalance(prisma, user.id, "USER_BONUS")).toBe(0n);
  await balanced();
});

test("a withdrawal can take the full cash balance and a failed payout returns the hold", async () => {
  const small = await makeUser(40_000n);
  const smallPayout = await requestWithdrawal({
    userId: small.id,
    idempotencyKey: randomUUID(),
    amountPaise: 40_000n,
    method: "UPI",
    destination: "fan@upi",
  });
  expect(smallPayout.amountPaise).toBe("40000");
  expect(smallPayout.reviewStatus).toBe("PENDING_REVIEW");
  expect(await accountBalance(prisma, small.id, "USER_CASH")).toBe(0n);

  const user = await makeUser(100_000n);
  await expect(
    requestWithdrawal({
      userId: user.id,
      idempotencyKey: randomUUID(),
      amountPaise: 100_001n,
      method: "BANK",
      destination: "123456789012",
    }),
  ).rejects.toMatchObject({ code: "AMOUNT" });
  const payout = await requestWithdrawal({
    userId: user.id,
    idempotencyKey: randomUUID(),
    amountPaise: 100_000n,
    method: "BANK",
    destination: "123456789012",
    note: "Full balance",
  });
  expect(payout.amountPaise).toBe("100000");
  expect(await accountBalance(prisma, user.id, "USER_CASH")).toBe(0n);
  expect(await accountBalance(prisma, user.id, "USER_WITHDRAWAL_HOLD")).toBe(100_000n);
  await applyProviderResult({
    paymentId: payout.paymentId,
    status: "FAILED",
    eventId: `fail-${payout.paymentId}`,
    payload: { status: "FAILED" },
    failureReason: "Simulated bank rejection",
  });
  expect(await accountBalance(prisma, user.id, "USER_CASH")).toBe(100_000n);
  expect(await accountBalance(prisma, user.id, "USER_WITHDRAWAL_HOLD")).toBe(0n);
  await balanced();
});

test("disabled trading rejects new buys and sells and leaves holdings readable", async () => {
  try {
    const user = await makeUser(100_000n);
    const player = await makePlayer(8_040n);
    await setFlag("liveTradingEnabled", false);
    await expect(
      createQuote({
        userId: user.id,
        playerId: player.id,
        side: "BUY",
        quantity: 1,
        requestedBonusPaise: 0n,
        seenMidPaise: null,
        confirmPriceChange: true,
      }),
    ).rejects.toMatchObject({ code: "TRADING_DISABLED" });
    await expect(
      createQuote({
        userId: user.id,
        playerId: player.id,
        side: "SELL",
        quantity: 1,
        requestedBonusPaise: 0n,
        seenMidPaise: null,
        confirmPriceChange: true,
      }),
    ).rejects.toMatchObject({ code: "TRADING_DISABLED" });

    await setFlag("liveTradingEnabled", true);
    await buy(user.id, player.id);
    const before = await prisma.holdingLot.findMany({ where: { userId: user.id } });
    await setFlag("liveTradingEnabled", false);
    await expect(
      createQuote({
        userId: user.id,
        playerId: player.id,
        side: "SELL",
        quantity: 1,
        requestedBonusPaise: 0n,
        seenMidPaise: null,
        confirmPriceChange: true,
      }),
    ).rejects.toMatchObject({ code: "TRADING_DISABLED" });
    const after = await prisma.holdingLot.findMany({ where: { userId: user.id } });
    expect(after).toEqual(before);
    const book = await portfolio(user.id);
    expect(book.positions).toHaveLength(1);
    expect(book.positions[0]?.quantity).toBe(1);
    await balanced();
  } finally {
    await clearFlags();
  }
});

test("disabled deposits and withdrawals reject new requests", async () => {
  try {
    const user = await makeUser(100_000n);
    await setFlag("depositsEnabled", false);
    const payments = await prisma.payment.count({ where: { userId: user.id } });
    await expect(
      createDeposit({ userId: user.id, amountPaise: 50_000n, method: "UPI", idempotencyKey: randomUUID(), simulate: "pending" }),
    ).rejects.toMatchObject({ code: "DEPOSITS_DISABLED" });
    expect(await prisma.payment.count({ where: { userId: user.id } })).toBe(payments);

    await setFlag("withdrawalsEnabled", false);
    await expect(
      requestWithdrawal({
        userId: user.id,
        idempotencyKey: randomUUID(),
        amountPaise: 100_000n,
        method: "UPI",
        destination: "fan@upi",
      }),
    ).rejects.toMatchObject({
      code: "WITHDRAWALS_DISABLED",
    });
    expect(await prisma.payment.count({ where: { userId: user.id } })).toBe(payments);
    expect(await accountBalance(prisma, user.id, "USER_CASH")).toBe(100_000n);
  } finally {
    await clearFlags();
  }
});

test("welcome bonus and the bonus system are separate and existing grants stay", async () => {
  try {
    const user = await makeUser(0n);
    const settings = await getSettings();
    await setFlag("welcomeBonusEnabled", false);
    const blocked = await withUserLock(user.id, (tx) => grantWelcomeBonus(tx, user.id, settings));
    expect(blocked).toBeNull();
    expect(await prisma.bonusGrant.count({ where: { userId: user.id } })).toBe(0);

    await setFlag("welcomeBonusEnabled", true);
    await setFlag("bonusSystemEnabled", false);
    const systemOff = await withUserLock(user.id, (tx) => grantWelcomeBonus(tx, user.id, settings));
    expect(systemOff).toBeNull();

    await setFlag("bonusSystemEnabled", true);
    const grant = await withUserLock(user.id, (tx) => grantWelcomeBonus(tx, user.id, settings));
    expect(grant?.source).toBe("WELCOME");
    const progress = grant?.wageringProgressPaise;

    await setFlag("bonusSystemEnabled", false);
    const again = await withUserLock(user.id, (tx) => grantWelcomeBonus(tx, user.id, settings));
    expect(again?.id).toBe(grant?.id);
    expect(again?.wageringProgressPaise).toBe(progress);
    expect(await prisma.bonusGrant.count({ where: { userId: user.id } })).toBe(1);
    expect(await accountBalance(prisma, user.id, "USER_BONUS")).toBe(settings.bonusWelcomePaise);
    await balanced();
  } finally {
    await clearFlags();
  }
});

async function sell(userId: string, playerId: string, quantity: number) {
  const quote = await createQuote({
    userId,
    playerId,
    side: "SELL",
    quantity,
    requestedBonusPaise: null,
    seenMidPaise: null,
    confirmPriceChange: true,
  });
  return executeTrade({ userId, quoteId: quote.quoteId, idempotencyKey: randomUUID() });
}

const PLATFORM_LIMIT_KEY = "risk.maxPlatformPlayerLiabilityPaise";

async function withPlatformLimit(limitPaise: string, run: () => Promise<void>) {
  const previous = await prisma.appSetting.findUnique({ where: { key: PLATFORM_LIMIT_KEY } });
  await prisma.appSetting.upsert({
    where: { key: PLATFORM_LIMIT_KEY },
    create: { key: PLATFORM_LIMIT_KEY, value: limitPaise },
    update: { value: limitPaise },
  });
  try {
    await run();
  } finally {
    if (previous) {
      await prisma.appSetting.update({ where: { key: PLATFORM_LIMIT_KEY }, data: { value: previous.value ?? limitPaise } });
    } else {
      await prisma.appSetting.deleteMany({ where: { key: PLATFORM_LIMIT_KEY } });
    }
  }
}

test("a buy records risk state without an admin page, and price moves it up and back", async () => {
  await withPlatformLimit("10000000", async () => {
  const user = await makeUser(20_000_000n);
  const player = await makePlayer(1_000n);
  await buy(user.id, player.id, 7_000);
  const warning = await prisma.playerRiskControl.findUniqueOrThrow({ where: { playerId: player.id } });
  expect(warning.lastState).toBe("WARNING");
  expect(warning.manualMode).toBe("AUTO");
  await evaluatePlayerRisk(player.id, "Again");
  expect(await prisma.riskStateChange.count({ where: { playerId: player.id } })).toBe(1);
  const first = await prisma.riskStateChange.findFirstOrThrow({
    where: { playerId: player.id },
    orderBy: { createdAt: "asc" },
  });
  const snapshot = first.metricsSnapshot as Record<string, unknown>;
  expect(snapshot.midPricePaise).toBe("1000");
  expect(snapshot.outstandingPulsers).toBe(7000);
  expect(snapshot.manualMode).toBe("AUTO");
  expect(snapshot).toHaveProperty("markedValuePaise");
  expect(snapshot).toHaveProperty("platformLimitPaise");
  expect(snapshot).toHaveProperty("limitUsedPct");
  expect(snapshot).toHaveProperty("largestHolderPulsers");
  expect(snapshot).toHaveProperty("largestHolderPct");
  expect(snapshot).toHaveProperty("top10ConcentrationPct");
  expect(snapshot).toHaveProperty("customerUnrealizedPnlPaise");
  expect(JSON.stringify(snapshot)).not.toMatch(/phone|email|userId/i);

  await prisma.player.update({ where: { id: player.id }, data: { midPricePaise: 1_286n } });
  await onMidPricePersisted(player.id, 1_000n, 1_286n);
  expect((await prisma.playerRiskControl.findUniqueOrThrow({ where: { playerId: player.id } })).lastState).toBe("RESTRICTED");
  await onMidPricePersisted(player.id, 1_286n, 1_286n);
  expect(await prisma.riskStateChange.count({ where: { playerId: player.id } })).toBe(2);

  await prisma.player.update({ where: { id: player.id }, data: { midPricePaise: 500n } });
  await onMidPricePersisted(player.id, 1_286n, 500n);
  expect((await prisma.playerRiskControl.findUniqueOrThrow({ where: { playerId: player.id } })).lastState).toBe("NORMAL");

  await setPlayerRiskMode({ playerId: player.id, mode: "PAUSE_BUYS", actorId: user.id, reason: "Hold new buys" });
  expect((await prisma.playerRiskControl.findUniqueOrThrow({ where: { playerId: player.id } })).lastState).toBe("RESTRICTED");
  await prisma.player.update({ where: { id: player.id }, data: { midPricePaise: 100n } });
  await onMidPricePersisted(player.id, 500n, 100n);
  expect((await prisma.playerRiskControl.findUniqueOrThrow({ where: { playerId: player.id } })).lastState).toBe("RESTRICTED");

  const beforePauseAll = await prisma.riskStateChange.count({ where: { playerId: player.id } });
  await setPlayerRiskMode({ playerId: player.id, mode: "PAUSE_ALL", actorId: user.id, reason: "Emergency pause" });
  expect((await prisma.playerRiskControl.findUniqueOrThrow({ where: { playerId: player.id } })).lastState).toBe("PAUSED");
  await prisma.player.update({ where: { id: player.id }, data: { midPricePaise: 200n } });
  await onMidPricePersisted(player.id, 100n, 200n);
  expect((await prisma.playerRiskControl.findUniqueOrThrow({ where: { playerId: player.id } })).lastState).toBe("PAUSED");
  expect(await prisma.riskStateChange.count({ where: { playerId: player.id } })).toBe(beforePauseAll + 1);
  await balanced();
  });
});

test("a sell lowers a restricted player through warning to normal", async () => {
  await withPlatformLimit("10000000", async () => {
    const user = await makeUser(20_000_000n);
    const player = await makePlayer(1_000n);
    await buy(user.id, player.id, 9_000);
    expect((await prisma.playerRiskControl.findUniqueOrThrow({ where: { playerId: player.id } })).lastState).toBe("RESTRICTED");
    await sell(user.id, player.id, 2_000);
    expect((await prisma.playerRiskControl.findUniqueOrThrow({ where: { playerId: player.id } })).lastState).toBe("WARNING");
    await sell(user.id, player.id, 1_000);
    expect((await prisma.playerRiskControl.findUniqueOrThrow({ where: { playerId: player.id } })).lastState).toBe("NORMAL");
    await balanced();
  });
});

test("a feed event prices once, a backup ball does not, and an unmapped player stays unpriced", async () => {
  const previous = await prisma.appSetting.findUnique({ where: { key: "pricing.engineMode" } });
  await prisma.appSetting.upsert({
    where: { key: "pricing.engineMode" },
    create: { key: "pricing.engineMode", value: "EVENT_DRIVEN" },
    update: { value: "EVENT_DRIVEN" },
  });
  try {
    const player = await makePlayer(10_000n);
    const match = await prisma.cricketMatch.create({
      data: { competition: "Test", homeTeam: "India", awayTeam: "Australia", scheduledAt: new Date(), status: "LIVE" },
    });
    await prisma.playerFeedMapping.create({
      data: {
        matchId: match.id,
        source: "DevelopmentSimulator",
        externalPlayerId: "ext-bat",
        externalPlayerName: "Batter",
        internalPlayerId: player.id,
        mappingStatus: "MAPPED",
        lastVerifiedAt: new Date(),
      },
    });
    const event = nextSimulatorDelivery({
      matchId: match.id,
      cursor: 2,
      battingExternalId: "ext-bat",
      bowlingExternalId: "ext-bowl",
      now: new Date("2026-09-28T14:12:11.000Z"),
    });
    const first = await ingestNormalizedEvent(event);
    expect(first).toMatchObject({ stored: true, priced: true });
    expect(await ingestNormalizedEvent(event)).toMatchObject({ duplicate: true, priced: false });
    expect(await prisma.matchEvent.count({ where: { playerId: player.id, kind: "FOUR" } })).toBe(1);
    await applyPendingPricing(player.id);
    expect(await prisma.priceTick.count({ where: { playerId: player.id, source: "performance", eventType: "FOUR" } })).toBe(1);
    await applyPendingPricing(player.id);
    expect(await prisma.priceTick.count({ where: { playerId: player.id, source: "performance", eventType: "FOUR" } })).toBe(1);
    expect(await prisma.riskStateChange.count({ where: { playerId: player.id } })).toBe(0);
    const backup = await ingestNormalizedEvent({ ...event, source: "Cricbuzz", sourceEventId: "buzz-same-ball" });
    expect(backup).toMatchObject({ stored: true, priced: false });
    expect(await prisma.matchEvent.count({ where: { playerId: player.id, kind: "FOUR" } })).toBe(1);
    const unknown = nextSimulatorDelivery({
      matchId: match.id,
      cursor: 3,
      battingExternalId: "unknown-batter",
      bowlingExternalId: "unknown-bowler",
      now: new Date("2026-09-28T14:13:11.000Z"),
    });
    expect(await ingestNormalizedEvent(unknown)).toMatchObject({ stored: true, priced: false });
    expect(await prisma.playerFeedMapping.findFirst({ where: { externalPlayerId: "unknown-batter" } })).toMatchObject({ mappingStatus: "UNMAPPED" });
    expect(await prisma.player.count({ where: { blurb: "unknown-batter" } })).toBe(0);
  } finally {
    if (previous) await prisma.appSetting.update({ where: { key: "pricing.engineMode" }, data: { value: previous.value ?? "SIMULATION" } });
    else await prisma.appSetting.deleteMany({ where: { key: "pricing.engineMode" } });
  }
});

test("failover leaves the down primary and does not require an admin page", async () => {
  await prisma.feedControl.upsert({
    where: { id: "default" },
    create: { id: "default", activeSource: "DevelopmentSimulator", pollIntervalSeconds: 15 },
    update: { activeSource: "DevelopmentSimulator", lastPolledAt: null },
  });
  await prisma.feedSourceState.upsert({
    where: { source: "DevelopmentSimulator" },
    create: { source: "DevelopmentSimulator", enabled: true, priority: 1, status: "DOWN" },
    update: { enabled: true, priority: 1, status: "DOWN" },
  });
  await prisma.feedSourceState.upsert({
    where: { source: "Cricbuzz" },
    create: { source: "Cricbuzz", enabled: true, priority: 2, status: "HEALTHY" },
    update: { enabled: true, priority: 2, status: "HEALTHY", consecutiveFailures: 0 },
  });
  const cycle = await runFeedCycle(new Date());
  expect(cycle.source).toBe("Cricbuzz");
  const failover = await prisma.feedFailover.findFirst({ orderBy: { createdAt: "desc" } });
  expect(failover?.oldSource).toBe("DevelopmentSimulator");
  expect(failover?.newSource).toBe("Cricbuzz");
  expect(cycle.stored).toBe(0);
});

test("webhook signatures reject tampering and customers are not admins", async () => {
  const body = JSON.stringify({ eventId: "x", paymentId: "y", status: "SETTLED" });
  const signature = signWebhook(body, "test-webhook-secret");
  expect(signature).toHaveLength(64);
  expect(signWebhook(body, "other-secret")).not.toBe(signature);
  expect(() => assertAdmin({ role: "CUSTOMER" })).toThrow(/Admin/);
  expect(() => assertAdmin(null)).toThrow(/Sign in/);
});
