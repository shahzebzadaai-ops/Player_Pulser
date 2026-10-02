import { Prisma } from "@prisma/client";
import { quoteFromMid } from "@/domain/spread";
import {
  CONTRIBUTION_WEIGHTS,
  clampPerformanceRunning,
  demandContribution,
  eventApplicationKey,
  explainMovement,
  fairValue,
  gateContributions,
  isMatchContext,
  newsContribution,
  performanceContribution,
  PERFORMANCE_RULES,
  type MovementFact,
} from "@/domain/pricing-engine";
import { getFeatureFlags } from "./features";
import { prisma, type Tx } from "./prisma";
import { publishPriceUpdate } from "./realtime";
import { evaluatePlayerRisk } from "./risk";
import { getSettings } from "./settings";

function isUnique(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function claim(tx: Tx, eventKey: string, playerId: string): Promise<boolean> {
  try {
    await tx.priceApplication.create({ data: { eventKey, playerId } });
    return true;
  } catch (error) {
    if (isUnique(error)) return false;
    throw error;
  }
}

type PricedPlayer = {
  id: string;
  midPricePaise: bigint;
  matchAnchorPaise: bigint;
  performanceMatchBps: number;
};

async function writeMove(
  tx: Tx,
  player: PricedPlayer,
  input: {
    performanceBps: number;
    demandBps: number;
    newsBps: number;
    circuitBreakerBps: number;
    source: string;
    eventType: string | null;
    eventId: string | null;
    contextMultiplier: number | null;
    performanceClamped: boolean;
    fact: MovementFact;
    nextPerformanceMatchBps?: number;
  },
) {
  const priced = fairValue({
    midPaise: player.midPricePaise,
    anchorPaise: player.matchAnchorPaise,
    performanceBps: input.performanceBps,
    demandBps: input.demandBps,
    newsBps: input.newsBps,
    circuitBreakerBps: input.circuitBreakerBps,
  });
  const wasClamped = priced.wasClamped || input.performanceClamped;
  const clampReason = [input.performanceClamped ? "performance_match" : null, priced.clampReason].filter(Boolean).join("+") || null;
  const lines = explainMovement([{ ...input.fact, wasClamped }]);
  const tick = await tx.priceTick.create({
    data: {
      playerId: player.id,
      midPaise: priced.midPaise,
      previousMidPaise: priced.previousMidPaise,
      source: input.source,
      performance: input.performanceBps,
      demand: input.demandBps,
      news: input.newsBps,
      performanceBps: input.performanceBps,
      demandBps: input.demandBps,
      newsBps: input.newsBps,
      contextMultiplier: input.contextMultiplier,
      eventType: input.eventType,
      eventId: input.eventId,
      wasClamped,
      clampReason,
      reason: lines.join("\n"),
    },
  });
  await tx.player.update({
    where: { id: player.id },
    data: {
      midPricePaise: priced.midPaise,
      ...(input.nextPerformanceMatchBps === undefined ? {} : { performanceMatchBps: input.nextPerformanceMatchBps }),
    },
  });
  player.midPricePaise = priced.midPaise;
  if (input.nextPerformanceMatchBps !== undefined) player.performanceMatchBps = input.nextPerformanceMatchBps;
  return { tickId: tick.id, midChanged: priced.midPaise !== priced.previousMidPaise };
}

type MoveOutcome = { applied: boolean; midChanged: boolean; tickId: string | null };

async function publishMove(playerId: string, outcome: MoveOutcome): Promise<void> {
  if (!outcome.tickId) return;
  await publishPriceUpdate({
    playerId,
    priceTickId: outcome.tickId,
    publishedAt: new Date().toISOString(),
  });
}

async function noteMidChange(playerId: string, outcome: MoveOutcome): Promise<void> {
  if (!outcome.midChanged) return;
  try {
    await evaluatePlayerRisk(playerId, "Mid price changed.");
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: error instanceof Error ? error.message : "risk evaluation failed",
      at: new Date().toISOString(),
    }));
  }
}

export async function applyPendingPricing(playerId?: string): Promise<number> {
  const [settings, flags] = await Promise.all([getSettings(), getFeatureFlags()]);
  if (settings.pricingMode === "paused" || settings.engineMode !== "EVENT_DRIVEN") return 0;
  const players = await prisma.player.findMany({
    where: { tradable: true, ...(playerId ? { id: playerId } : {}) },
  });
  let applied = 0;
  for (const player of players) {
    applied += await applyPlayer(player.id, settings, flags);
  }
  return applied;
}

async function applyPlayer(
  playerId: string,
  settings: Awaited<ReturnType<typeof getSettings>>,
  flags: Awaited<ReturnType<typeof getFeatureFlags>>,
): Promise<number> {
  let applied = 0;
  const events = await prisma.matchEvent.findMany({
    where: { playerId, simulated: false },
    orderBy: { createdAt: "asc" },
    take: 40,
  });
  for (const event of events) {
    const did = await prisma.$transaction(async (tx): Promise<MoveOutcome> => {
      const player = await tx.player.findUnique({ where: { id: playerId } });
      if (!player) return { applied: false, midChanged: false, tickId: null };
      const key = eventApplicationKey("match", event.idempotencyKey ?? event.id);
      if (!(await claim(tx, key, player.id))) return { applied: false, midChanged: false, tickId: null };
      const context = isMatchContext(event.context) ? event.context : "NORMAL";
      const contribution = performanceContribution(event.kind, context);
      const capped = clampPerformanceRunning(player.performanceMatchBps, contribution.bps, settings.performanceMatchCapBps);
      const gated = gateContributions(
        { performanceBps: capped.appliedBps, demandBps: 0, newsBps: 0 },
        flags,
      );
      if (gated.performanceBps === 0 && !capped.clamped) return { applied: true, midChanged: false, tickId: null };
      const move = await writeMove(tx, player, {
        performanceBps: gated.performanceBps,
        demandBps: 0,
        newsBps: 0,
        circuitBreakerBps: settings.circuitBreakerBps,
        source: "performance",
        eventType: event.kind,
        eventId: event.id,
        contextMultiplier: contribution.multiplier,
        performanceClamped: capped.clamped,
        nextPerformanceMatchBps: capped.nextRunningBps,
        fact: { performanceEvent: event.kind, context },
      });
      await tx.matchEvent.update({ where: { id: event.id }, data: { contextMultiplier: contribution.multiplier } });
      await tx.priceApplication.update({ where: { eventKey: key }, data: { tickId: move.tickId } });
      return { applied: true, midChanged: move.midChanged, tickId: move.tickId };
    });
    if (did.applied) applied += 1;
    await publishMove(playerId, did);
    await noteMidChange(playerId, did);
  }

  const newsRows = await prisma.playerNewsEvent.findMany({
    where: { playerId, verifiedAt: { not: null } },
    orderBy: { verifiedAt: "asc" },
    take: 40,
  });
  for (const news of newsRows) {
    const did = await prisma.$transaction(async (tx): Promise<MoveOutcome> => {
      const player = await tx.player.findUnique({ where: { id: playerId } });
      if (!player || !flags.newsPriceMovementEnabled) return { applied: false, midChanged: false, tickId: null };
      const key = eventApplicationKey("news", news.idempotencyKey);
      if (!(await claim(tx, key, player.id))) return { applied: false, midChanged: false, tickId: null };
      const direction = news.direction === "POSITIVE" ? "POSITIVE" : "NEGATIVE";
      const contribution = newsContribution({
        category: news.category,
        severity: news.severity,
        direction,
        confidence: news.confidence,
        verified: true,
        enabled: true,
        capBps: settings.newsEventCapBps,
      });
      if (contribution.bps === 0) return { applied: true, midChanged: false, tickId: null };
      const move = await writeMove(tx, player, {
        performanceBps: 0,
        demandBps: 0,
        newsBps: contribution.bps,
        circuitBreakerBps: settings.circuitBreakerBps,
        source: "news",
        eventType: news.category,
        eventId: news.id,
        contextMultiplier: null,
        performanceClamped: false,
        fact: { newsCategory: news.category, newsHeadline: news.headline },
      });
      await tx.priceApplication.update({ where: { eventKey: key }, data: { tickId: move.tickId } });
      return { applied: true, midChanged: move.midChanged, tickId: move.tickId };
    });
    if (did.applied) applied += 1;
    await publishMove(playerId, did);
    await noteMidChange(playerId, did);
  }

  const windowMs = Math.max(60, settings.demandWindowSeconds) * 1000;
  const bucket = Math.floor(Date.now() / windowMs);
  const demandKey = eventApplicationKey("demand", `${playerId}:${bucket}`);
  const didDemand = await prisma.$transaction(async (tx): Promise<MoveOutcome> => {
    const player = await tx.player.findUnique({ where: { id: playerId } });
    if (!player || !flags.demandPriceMovementEnabled) return { applied: false, midChanged: false, tickId: null };
    if (!(await claim(tx, demandKey, player.id))) return { applied: false, midChanged: false, tickId: null };
    const start = new Date(bucket * windowMs);
    const trades = await tx.trade.findMany({
      where: { playerId, createdAt: { gte: start } },
      select: { side: true, cashPaise: true, bonusPaise: true },
    });
    let buy = 0n;
    let sell = 0n;
    for (const trade of trades) {
      const notional = trade.cashPaise + trade.bonusPaise;
      if (trade.side === "BUY") buy += notional;
      else sell += notional;
    }
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const prior = await tx.priceTick.findMany({
      where: { playerId, createdAt: { gte: since } },
      select: { demandBps: true },
    });
    const day = prior.reduce((sum, tick) => sum + (tick.demandBps ?? 0), 0);
    const demand = demandContribution({
      buyVolumePaise: buy,
      sellVolumePaise: sell,
      tradeCount: trades.length,
      minTrades: settings.demandMinTrades,
      maxBps: settings.demandMaxBps,
      dayContributionBps: day,
      dayCapBps: settings.demandDayCapBps,
    });
    const gated = gateContributions(
      { performanceBps: 0, demandBps: demand.bps, newsBps: 0 },
      flags,
    );
    if (!flags.demandPriceMovementEnabled || gated.demandBps === 0) return { applied: true, midChanged: false, tickId: null };
    const move = await writeMove(tx, player, {
      performanceBps: 0,
      demandBps: gated.demandBps,
      newsBps: 0,
      circuitBreakerBps: settings.circuitBreakerBps,
      source: "demand",
      eventType: "DEMAND",
      eventId: demandKey,
      contextMultiplier: null,
      performanceClamped: false,
      fact: { demandBps: gated.demandBps, wasClamped: demand.clamped },
    });
    await tx.priceApplication.update({ where: { eventKey: demandKey }, data: { tickId: move.tickId } });
    return { applied: true, midChanged: move.midChanged, tickId: move.tickId };
  });
  if (didDemand.applied) applied += 1;
  await publishMove(playerId, didDemand);
  await noteMidChange(playerId, didDemand);
  return applied;
}

export async function explainRecentMovement(playerId: string): Promise<string[]> {
  const ticks = await prisma.priceTick.findMany({
    where: { playerId, source: { in: ["performance", "demand", "news"] } },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  const eventIds = ticks.map((tick) => tick.eventId).filter((id): id is string => Boolean(id));
  const [matches, news] = await Promise.all([
    prisma.matchEvent.findMany({ where: { id: { in: eventIds } } }),
    prisma.playerNewsEvent.findMany({ where: { id: { in: eventIds } } }),
  ]);
  const matchById = new Map(matches.map((event) => [event.id, event]));
  const newsById = new Map(news.map((event) => [event.id, event]));
  const facts: MovementFact[] = ticks.map((tick) => {
    const match = tick.eventId ? matchById.get(tick.eventId) : undefined;
    const item = tick.eventId ? newsById.get(tick.eventId) : undefined;
    if (match) return { performanceEvent: match.kind, context: match.context, wasClamped: tick.wasClamped };
    if (item) return { newsCategory: item.category, newsHeadline: item.headline, wasClamped: tick.wasClamped };
    if (tick.source === "demand") return { demandBps: tick.demandBps ?? 0, wasClamped: tick.wasClamped };
    return { wasClamped: tick.wasClamped };
  });
  return explainMovement(facts);
}

export async function pricingBoard() {
  const settings = await getSettings();
  const players = await prisma.player.findMany({
    orderBy: { name: "asc" },
    include: {
      ticks: { orderBy: { createdAt: "desc" }, take: 1 },
      events: { where: { simulated: false }, orderBy: { createdAt: "desc" }, take: 3 },
      newsEvents: { orderBy: { createdAt: "desc" }, take: 3 },
    },
  });
  return {
    engineMode: settings.engineMode,
    weights: CONTRIBUTION_WEIGHTS,
    rules: PERFORMANCE_RULES,
    players: players.map((player) => {
      const latest = player.ticks[0];
      const mid = latest?.midPaise ?? player.midPricePaise;
      const spreadPpm = player.liveMatch ? settings.spreadLivePpm : settings.spreadNormalPpm;
      const quote = quoteFromMid(mid, spreadPpm);
      const running = player.performanceMatchBps;
      const cap = settings.performanceMatchCapBps;
      return {
        id: player.id,
        name: player.name,
        tradable: player.tradable,
        live: player.liveMatch,
        midPaise: mid,
        basePaise: player.basePricePaise,
        anchorPaise: player.matchAnchorPaise,
        buyPaise: quote.buyPaise,
        sellPaise: quote.sellPaise,
        spreadPpm,
        performanceBps: latest?.performanceBps ?? 0,
        demandBps: latest?.demandBps ?? 0,
        newsBps: latest?.newsBps ?? 0,
        matchPerformanceBps: running,
        capStatus: latest?.wasClamped
          ? `Clamped (${latest.clampReason ?? "limit"})`
          : Math.abs(running) >= cap
            ? "Match performance cap reached"
            : "Inside caps",
        events: [
          ...player.events.map((event) => `${event.kind} · ${event.context} · ${event.summary}`),
          ...player.newsEvents.map((event) => `${event.category} · ${event.verifiedAt ? "verified" : "unverified"} · ${event.headline}`),
        ],
      };
    }),
  };
}
