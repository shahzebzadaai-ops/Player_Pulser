import type { PlayerRole, TradeSide } from "@prisma/client";
import { publicPriceSource } from "@/domain/live-prices";
import { changePercent, formatCompactInr } from "@/domain/money";
import { feedIsStale } from "@/domain/rules";
import { quoteFromMid } from "@/domain/spread";
import { weightedAveragePaise } from "@/domain/lots";
import { cache } from "react";
import { settledDepositsPaise } from "./bonus";
import { summedAccountBalances } from "./ledger";
import { getFeatureFlags } from "./features";
import { latestPulsePreviews, type PulseCustomerView } from "./pulse-preview";
import { prisma } from "./prisma";
import { readPriceCache } from "./redis";
import { getSettings } from "./settings";

export type PlayerView = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  role: PlayerRole;
  jerseyNumber: number | null;
  live: boolean;
  tradable: boolean;
  midPaise: string;
  buyPaise: string;
  sellPaise: string;
  changePaise: string;
  changePercent: number;
  history: number[];
  totalTradedLabel: string;
  stale: boolean;
  why: string[];
  highPaise: string;
  lowPaise: string;
  rangePercent: number;
  pulse: PulseCustomerView | null;
};

function whyFromTick(tick: { source: string; reason: string | null; performance: number; demand: number; news: number } | undefined): string[] {
  if (tick && tick.source !== "SIMULATION_ONLY" && tick.source !== "SHOWCASE" && tick.reason) {
    const lines = tick.reason.split("\n").filter(Boolean);
    if (lines.length > 0) return lines;
  }
  const performance = tick?.performance ?? 0;
  const demand = tick?.demand ?? 0;
  const news = tick?.news ?? 0;
  const lines: string[] = [];
  if (performance > 0.35) lines.push("Recent form is lifting demand.");
  if (performance < -0.35) lines.push("Recent form is cooling the price.");
  if (demand > 0.35) lines.push("Buying interest is ahead of selling interest.");
  if (demand < -0.35) lines.push("Selling interest is ahead of buying interest.");
  if (news > 0.35) lines.push("Match news is supportive.");
  if (news < -0.35) lines.push("Match news is weighing on the price.");
  if (lines.length === 0) lines.push("Price is steady in the current window.");
  return lines;
}

export const listPlayers = cache(loadPlayers);

type RecentTick = {
  playerId: string;
  midPaise: bigint;
  createdAt: Date;
  source: string;
  reason: string | null;
  performance: number;
  demand: number;
  news: number;
};

function asBig(value: bigint | number | string | null | undefined, fallback: bigint): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  return fallback;
}

async function dayBounds(): Promise<Map<string, { high: bigint; low: bigint; baseline: bigint }>> {
  const rows = await prisma.$queryRaw<{ playerId: string; high: bigint | string; low: bigint | string; baseline: bigint | string }[]>`
    SELECT p."id" AS "playerId",
      COALESCE(w."high", p."midPricePaise") AS "high",
      COALESCE(w."low", p."midPricePaise") AS "low",
      COALESCE(older."midPaise", earliest."midPaise", p."referenceMidPaise") AS "baseline"
    FROM "Player" p
    LEFT JOIN (
      SELECT "playerId", MAX("midPaise") AS "high", MIN("midPaise") AS "low"
      FROM "PriceTick"
      WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
      GROUP BY "playerId"
    ) w ON w."playerId" = p."id"
    LEFT JOIN LATERAL (
      SELECT t."midPaise"
      FROM "PriceTick" t
      WHERE t."playerId" = p."id" AND t."createdAt" <= NOW() - INTERVAL '24 hours'
      ORDER BY t."createdAt" DESC
      LIMIT 1
    ) older ON TRUE
    LEFT JOIN LATERAL (
      SELECT t."midPaise"
      FROM "PriceTick" t
      WHERE t."playerId" = p."id"
      ORDER BY t."createdAt" ASC
      LIMIT 1
    ) earliest ON TRUE
  `;
  const stats = new Map<string, { high: bigint; low: bigint; baseline: bigint }>();
  for (const row of rows) {
    const baseline = asBig(row.baseline, 0n);
    stats.set(row.playerId, { high: asBig(row.high, baseline), low: asBig(row.low, baseline), baseline });
  }
  return stats;
}

async function recentTicks(): Promise<RecentTick[]> {
  return prisma.$queryRaw<RecentTick[]>`
    SELECT t."playerId", t."midPaise", t."createdAt", t."source", t."reason", t."performance", t."demand", t."news"
    FROM "Player" p
    INNER JOIN LATERAL (
      SELECT "playerId", "midPaise", "createdAt", "source", "reason", "performance", "demand", "news"
      FROM "PriceTick"
      WHERE "playerId" = p."id"
      ORDER BY "createdAt" DESC
      LIMIT 48
    ) t ON TRUE
  `;
}

async function loadPlayers(): Promise<{ players: PlayerView[]; stale: boolean; mode: string; marketMode: "SHOWCASE" | "EVENT_DRIVEN" }> {
  const settings = await getSettings();
  const flags = await getFeatureFlags();
  const pulseByPlayer = flags.pulsePreviewEnabled ? await latestPulsePreviews() : new Map<string, PulseCustomerView>();
  const [rows, tickRows, days] = await Promise.all([
    prisma.player.findMany({ orderBy: { name: "asc" } }),
    recentTicks(),
    dayBounds(),
  ]);
  const ticksByPlayer = new Map<string, RecentTick[]>();
  for (const tick of tickRows) {
    const list = ticksByPlayer.get(tick.playerId);
    if (list) list.push(tick);
    else ticksByPlayer.set(tick.playerId, [tick]);
  }
  const now = new Date();
  let anyFresh = false;
  const players = rows.map((player) => {
    const playerTicks = ticksByPlayer.get(player.id) ?? [];
    const ticks = [...playerTicks].reverse();
    const latest = playerTicks[0];
    const mid = latest?.midPaise ?? player.referenceMidPaise;
    const previous = ticks[0]?.midPaise ?? mid;
    const spread = quoteFromMid(mid, player.liveMatch ? settings.spreadLivePpm : settings.spreadNormalPpm);
    const stale = feedIsStale(latest?.createdAt ?? null, now, settings.feedStaleAfterSeconds);
    if (!stale) anyFresh = true;
    const history = ticks.map((tick) => Number(tick.midPaise));
    const day = days.get(player.id);
    const baseline = day?.baseline ?? previous;
    const high = day?.high ?? mid;
    const low = day?.low ?? mid;
    const span = high > low ? high - low : 0n;
    const range = player.referenceMidPaise > 0n ? (Number(span) / Number(player.referenceMidPaise)) * 100 : 0;
    return {
      id: player.id,
      slug: player.slug,
      name: player.name,
      shortName: player.shortName,
      role: player.role,
      jerseyNumber: player.jerseyNumber,
      live: player.liveMatch,
      tradable: player.tradable,
      midPaise: mid.toString(),
      buyPaise: spread.buyPaise.toString(),
      sellPaise: spread.sellPaise.toString(),
      changePaise: (mid - baseline).toString(),
      changePercent: changePercent(mid, baseline),
      history: history.length > 0 ? history : [Number(mid)],
      totalTradedLabel: formatCompactInr(player.totalTradedPaise),
      stale,
      why: whyFromTick(latest),
      highPaise: high.toString(),
      lowPaise: low.toString(),
      rangePercent: range,
      pulse: pulseByPlayer.get(player.id) ?? null,
    } satisfies PlayerView;
  });
  return { players, stale: !anyFresh, mode: settings.pricingMode, marketMode: settings.marketMode };
}

export async function publicPricePayload() {
  const { players, stale, mode, marketMode } = await listPlayers();
  const ids = players.map((player) => player.id);
  const [events, ticks] = await Promise.all([
    prisma.cricketEvent.findMany({
      where: {
        correctionState: "ACTIVE",
        OR: [{ battingPlayerId: { in: ids } }, { bowlingPlayerId: { in: ids } }],
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 80,
      select: { battingPlayerId: true, bowlingPlayerId: true, normalizedDescription: true },
    }),
    prisma.priceTick.findMany({
      where: { playerId: { in: ids } },
      orderBy: { createdAt: "desc" },
      take: Math.max(ids.length, 1) * 2,
      select: { playerId: true, createdAt: true, midPaise: true, previousMidPaise: true, source: true },
    }),
  ]);
  const eventByPlayer = new Map<string, string>();
  for (const event of events) {
    for (const playerId of [event.battingPlayerId, event.bowlingPlayerId]) {
      if (playerId && !eventByPlayer.has(playerId)) eventByPlayer.set(playerId, event.normalizedDescription);
    }
  }
  const tickByPlayer = new Map<string, { createdAt: Date; midPaise: bigint; previousMidPaise: bigint | null; source: string }>();
  for (const tick of ticks) {
    if (!tickByPlayer.has(tick.playerId)) tickByPlayer.set(tick.playerId, tick);
  }
  return {
    type: "prices" as const,
    stale,
    at: new Date().toISOString(),
    mode,
    marketMode,
    players: players.map((player) => {
      const tick = tickByPlayer.get(player.id);
      return {
        id: player.id,
        slug: player.slug,
        midPaise: player.midPaise,
        buyPaise: player.buyPaise,
        sellPaise: player.sellPaise,
        previousMidPricePaise: tick?.previousMidPaise?.toString() ?? null,
        changePaise: player.changePaise,
        changePercent: player.changePercent,
        createdAt: tick?.createdAt.toISOString() ?? null,
        source: publicPriceSource(tick?.source, mode),
        stale: player.stale,
        live: player.live,
        lastEvent: eventByPlayer.get(player.id) ?? null,
        whyLine: player.why[0] ?? null,
        pulseState: player.pulse?.state ?? null,
        pulseActivity: player.pulse?.activity ?? null,
        pulseFeedLabel: player.pulse?.feedLabel ?? null,
        pulsePreviewPaise: player.pulse?.previewPaise ?? null,
        pulseCycleId: player.pulse?.cycleId ?? null,
        chartTime: tick ? Math.floor(tick.createdAt.getTime() / 1000) : null,
        chartValue: tick ? Number(tick.midPaise) / 100 : null,
        dayHighPaise: player.highPaise,
        dayLowPaise: player.lowPaise,
      };
    }),
  };
}

export async function cachedOrLivePrices() {
  const cached = await readPriceCache();
  if (cached) {
    try {
      return JSON.parse(cached) as Awaited<ReturnType<typeof publicPricePayload>>;
    } catch {
      /* fall through */
    }
  }
  return publicPricePayload();
}

export async function getPlayer(slug: string) {
  const { players } = await listPlayers();
  return players.find((player) => player.slug === slug) ?? null;
}

export async function walletSummary(userId: string) {
  const accounts = ["USER_CASH", "USER_BONUS", "USER_BONUS_PROCEEDS", "USER_WITHDRAWAL_HOLD"] as const;
  const [settings, balances, deposits, grant] = await Promise.all([
    getSettings(),
    summedAccountBalances(prisma, userId, accounts),
    settledDepositsPaise(prisma, userId),
    prisma.bonusGrant.findUnique({ where: { userId_source: { userId, source: "WELCOME" } } }),
  ]);
  const cash = balances.USER_CASH;
  const bonus = balances.USER_BONUS;
  const proceeds = balances.USER_BONUS_PROCEEDS;
  const hold = balances.USER_WITHDRAWAL_HOLD;
  const entries = await prisma.ledgerEntry.findMany({
    where: { userId, account: { in: ["USER_CASH", "USER_BONUS", "USER_BONUS_PROCEEDS", "USER_WITHDRAWAL_HOLD"] } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  return {
    cashPaise: cash.toString(),
    bonusPaise: bonus.toString(),
    proceedsPaise: proceeds.toString(),
    holdPaise: hold.toString(),
    depositsPaise: deposits.toString(),
    depositRequiredPaise: settings.bonusMinQualifyingDepositPaise.toString(),
    withdrawal: {
      allowed: cash > 0n,
      availablePaise: cash.toString(),
      message: cash > 0n ? "Withdraw up to 100% of your available balance." : "There is no withdrawable cash yet.",
    },
    bonus: grant
      ? {
          status: grant.status,
          amountPaise: grant.amountPaise.toString(),
          progressPaise: grant.wageringProgressPaise.toString(),
          requiredPaise: grant.wageringRequiredPaise.toString(),
          expiresAt: grant.expiresAt.toISOString(),
        }
      : null,
    entries: entries.map((entry) => ({
      id: entry.id,
      account: entry.account,
      amountPaise: entry.amountPaise.toString(),
      description: entry.description,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

export async function portfolio(userId: string) {
  const { players } = await listPlayers();
  const byId = new Map(players.map((player) => [player.id, player]));
  const lots = await prisma.holdingLot.findMany({
    where: { userId, quantityRemaining: { gt: 0 } },
    orderBy: { createdAt: "asc" },
  });
  const grouped = new Map<string, typeof lots>();
  for (const lot of lots) {
    const list = grouped.get(lot.playerId) ?? [];
    list.push(lot);
    grouped.set(lot.playerId, list);
  }
  const positions = [...grouped.entries()].map(([playerId, playerLots]) => {
    const player = byId.get(playerId);
    const quantity = playerLots.reduce((sum, lot) => sum + lot.quantityRemaining, 0);
    const cost = playerLots.reduce((sum, lot) => sum + lot.cashCostPaise + lot.bonusCostPaise, 0n);
    const average = weightedAveragePaise(
      playerLots.map((lot) => ({ quantity: lot.quantityRemaining, costPaise: lot.cashCostPaise + lot.bonusCostPaise })),
    );
    const mid = BigInt(player?.midPaise ?? "0");
    const current = mid * BigInt(quantity);
    return {
      playerId,
      slug: player?.slug ?? "",
      name: player?.name ?? "Player",
      shortName: player?.shortName ?? "",
      role: player?.role ?? "BATTER",
      live: player?.live ?? false,
      history: player?.history ?? [],
      midPaise: player?.midPaise ?? "0",
      quantity,
      averagePaise: (average ?? 0n).toString(),
      costPaise: cost.toString(),
      currentPaise: current.toString(),
      pnlPaise: (current - cost).toString(),
      pnlPercent: cost === 0n ? 0 : changePercent(current, cost),
    };
  });
  const trades = await prisma.trade.findMany({
    where: { userId },
    include: { player: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return {
    positions,
    trades: trades.map((trade) => ({
      id: trade.id,
      side: trade.side as TradeSide,
      quantity: trade.quantity,
      unitPaise: trade.unitPaise.toString(),
      playerName: trade.player.name,
      slug: trade.player.slug,
      createdAt: trade.createdAt.toISOString(),
    })),
  };
}

export async function recentEvents(limit = 12) {
  const events = await prisma.matchEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { player: true },
  });
  return events.map((event) => ({
    id: event.id,
    playerName: event.player.name,
    slug: event.player.slug,
    overLabel: event.overLabel,
    kind: event.kind,
    summary: event.summary,
    simulated: event.simulated,
    createdAt: event.createdAt.toISOString(),
  }));
}

const RANGE_MS: Record<string, number | null> = {
  "1H": 60 * 60 * 1000,
  "24H": 24 * 60 * 60 * 1000,
  "1D": 24 * 60 * 60 * 1000,
  "7D": 7 * 24 * 60 * 60 * 1000,
  "30D": 30 * 24 * 60 * 60 * 1000,
  ALL: null,
};

export async function priceHistory(playerId: string, range: string) {
  const windowKey = range === "1D" ? "1D" : range in RANGE_MS ? range : "24H";
  const windowMs = RANGE_MS[windowKey];
  const since = windowMs ? new Date(Date.now() - windowMs) : undefined;
  let ticks = await prisma.priceTick.findMany({
    where: { playerId, ...(since ? { createdAt: { gte: since } } : {}) },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, midPaise: true },
    take: 800,
  });
  const thin = ticks.length < 2;
  if (ticks.length === 0) {
    ticks = (
      await prisma.priceTick.findMany({
        where: { playerId },
        orderBy: { createdAt: "desc" },
        take: 80,
        select: { createdAt: true, midPaise: true },
      })
    ).reverse();
  }
  const step = Math.max(1, Math.ceil(ticks.length / 240));
  const points: { time: number; value: number }[] = [];
  let last = 0;
  ticks.forEach((tick, index) => {
    if (index % step !== 0 && index !== ticks.length - 1) return;
    const time = Math.floor(tick.createdAt.getTime() / 1000);
    if (time <= last) return;
    last = time;
    points.push({ time, value: Number(tick.midPaise) / 100 });
  });
  return {
    range: windowKey,
    points,
    note: thin ? "Only the stored prices in this range are shown." : null,
  };
}

export async function eventsForPlayer(playerId: string) {
  const events = await prisma.matchEvent.findMany({
    where: { playerId },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  return events.map((event) => ({
    id: event.id,
    overLabel: event.overLabel,
    kind: event.kind,
    summary: event.summary,
    createdAt: event.createdAt.toISOString(),
  }));
}
