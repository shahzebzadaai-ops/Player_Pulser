import type { Prisma, TradeSide } from "@prisma/client";
import { AppError } from "@/domain/errors";
import {
  assessTrade,
  concentrationAlert,
  customerRiskMessage,
  holderSharePercent,
  markedNotional,
  planRiskTransition,
  RECENT_VOLUME_HOURS,
  riskAttention,
  riskCapacity,
  riskMetricsSnapshot,
  riskSettingAffectsState,
  topHolderSharePercent,
  usedPercent,
  type ManualRiskMode,
  type RiskAttentionRow,
  type RiskState,
} from "@/domain/risk";
import { prisma, type Tx } from "./prisma";
import { getSettings } from "./settings";

function manualMode(value: string | null | undefined): ManualRiskMode {
  if (value === "PAUSE_BUYS" || value === "PAUSE_ALL") return value;
  return "AUTO";
}

export async function ensurePlayerRiskControl(playerId: string): Promise<void> {
  await prisma.playerRiskControl.upsert({
    where: { playerId },
    create: { playerId, manualMode: "AUTO", lastState: "NORMAL" },
    update: {},
  });
}

export async function backfillPlayerRiskControls(): Promise<number> {
  const missing = await prisma.player.findMany({
    where: { riskControl: { is: null } },
    select: { id: true },
  });
  if (missing.length === 0) return 0;
  await prisma.playerRiskControl.createMany({
    data: missing.map((player) => ({ playerId: player.id, manualMode: "AUTO", lastState: "NORMAL" })),
    skipDuplicates: true,
  });
  return missing.length;
}

function recordedState(value: string | null | undefined): RiskState {
  if (value === "WARNING" || value === "RESTRICTED" || value === "PAUSED" || value === "NORMAL") return value;
  return "NORMAL";
}

export async function assertTradeRisk(
  tx: Tx,
  input: { userId: string; playerId: string; side: TradeSide; quantity: number; midPaise: bigint },
): Promise<void> {
  const settings = await getSettings(tx);
  const [userLots, playerLots, control] = await Promise.all([
    tx.holdingLot.findMany({
      where: { userId: input.userId, quantityRemaining: { gt: 0 } },
      select: { playerId: true, quantityRemaining: true },
    }),
    tx.holdingLot.findMany({
      where: { playerId: input.playerId, quantityRemaining: { gt: 0 } },
      select: { quantityRemaining: true },
    }),
    tx.playerRiskControl.findUnique({ where: { playerId: input.playerId } }),
  ]);
  const otherIds = [...new Set(userLots.map((lot) => lot.playerId).filter((id) => id !== input.playerId))];
  const others = otherIds.length
    ? await tx.player.findMany({ where: { id: { in: otherIds } }, select: { id: true, midPricePaise: true } })
    : [];
  const mids = new Map<string, bigint>([[input.playerId, input.midPaise], ...others.map((player) => [player.id, player.midPricePaise] as const)]);
  const userPlayerQuantity = userLots.filter((lot) => lot.playerId === input.playerId).reduce((sum, lot) => sum + lot.quantityRemaining, 0);
  const userTotalNotionalPaise = userLots.reduce((sum, lot) => sum + markedNotional(lot.quantityRemaining, mids.get(lot.playerId) ?? 0n), 0n);
  const playerOutstanding = playerLots.reduce((sum, lot) => sum + lot.quantityRemaining, 0);
  const platformLimitPaise = riskCapacity.quote({
    configuredPlatformLimitPaise: settings.maxPlatformPlayerLiabilityPaise,
  }).recommendedPlayerLimitPaise;
  const decision = assessTrade({
    side: input.side,
    quantity: input.quantity,
    midPaise: input.midPaise,
    userPlayerQuantity,
    userTotalNotionalPaise,
    playerOutstanding,
    manualMode: manualMode(control?.manualMode),
    maxUserPlayerExposurePaise: settings.maxUserPlayerExposurePaise,
    maxUserTotalExposurePaise: settings.maxUserTotalExposurePaise,
    maxPlatformPlayerLiabilityPaise: platformLimitPaise,
    warningThresholdPct: settings.warningThresholdPct,
    restrictedThresholdPct: settings.restrictedThresholdPct,
  });
  if (!decision.ok) {
    throw new AppError("RISK_LIMIT", customerRiskMessage(decision.reason), 409, {
      reason: decision.reason,
    });
  }
}

type Holder = { userId: string; name: string; quantity: number; costPaise: bigint; markedPaise: bigint };

export type PlayerRiskRow = {
  playerId: string;
  name: string;
  midPaise: bigint;
  outstanding: number;
  costPaise: bigint;
  markedPaise: bigint;
  unrealizedPaise: bigint;
  largestHolderName: string;
  largestHolderQuantity: number;
  largestHolderNotionalPaise: bigint;
  top10SharePct: number;
  limitUsedPct: number;
  state: RiskState;
  manualMode: ManualRiskMode;
  concentrationAlert: boolean;
  recentBuyPaise: bigint;
  recentSellPaise: bigint;
  holders: Holder[];
};

function buildRows(input: {
  players: { id: string; name: string; midPricePaise: bigint }[];
  lots: { userId: string; playerId: string; quantityRemaining: number; cashCostPaise: bigint; bonusCostPaise: bigint; user: { displayName: string | null } }[];
  trades: { playerId: string; side: TradeSide; cashPaise: bigint; bonusPaise: bigint }[];
  controls: { playerId: string; manualMode: string; lastState: string }[];
  limits: {
    maxPlatformPlayerLiabilityPaise: bigint;
    warningThresholdPct: number;
    restrictedThresholdPct: number;
    singleUserConcentrationAlertPct: number;
  };
}): PlayerRiskRow[] {
  const controlByPlayer = new Map(input.controls.map((control) => [control.playerId, control]));
  return input.players.map((player) => {
    const lots = input.lots.filter((lot) => lot.playerId === player.id);
    const byUser = new Map<string, Holder>();
    for (const lot of lots) {
      const current = byUser.get(lot.userId) ?? {
        userId: lot.userId,
        name: lot.user.displayName?.trim() || "Customer",
        quantity: 0,
        costPaise: 0n,
        markedPaise: 0n,
      };
      current.quantity += lot.quantityRemaining;
      current.costPaise += lot.cashCostPaise + lot.bonusCostPaise;
      current.markedPaise += markedNotional(lot.quantityRemaining, player.midPricePaise);
      byUser.set(lot.userId, current);
    }
    const holders = [...byUser.values()].sort((left, right) => right.quantity - left.quantity);
    const outstanding = holders.reduce((sum, holder) => sum + holder.quantity, 0);
    const costPaise = holders.reduce((sum, holder) => sum + holder.costPaise, 0n);
    const markedPaise = markedNotional(outstanding, player.midPricePaise);
    const largest = holders[0];
    const control = controlByPlayer.get(player.id);
    const mode = manualMode(control?.manualMode);
    const recorded = recordedState(control?.lastState);
    let recentBuyPaise = 0n;
    let recentSellPaise = 0n;
    for (const trade of input.trades) {
      if (trade.playerId !== player.id) continue;
      const notional = trade.cashPaise + trade.bonusPaise;
      if (trade.side === "BUY") recentBuyPaise += notional;
      else recentSellPaise += notional;
    }
    return {
      playerId: player.id,
      name: player.name,
      midPaise: player.midPricePaise,
      outstanding,
      costPaise,
      markedPaise,
      unrealizedPaise: markedPaise - costPaise,
      largestHolderName: largest?.name ?? "None",
      largestHolderQuantity: largest?.quantity ?? 0,
      largestHolderNotionalPaise: largest?.markedPaise ?? 0n,
      top10SharePct: topHolderSharePercent(holders.map((holder) => holder.quantity), outstanding, 10),
      limitUsedPct: usedPercent(markedPaise, input.limits.maxPlatformPlayerLiabilityPaise),
      state: recorded,
      manualMode: mode,
      concentrationAlert: concentrationAlert(largest?.quantity ?? 0, outstanding, input.limits.singleUserConcentrationAlertPct),
      recentBuyPaise,
      recentSellPaise,
      holders,
    };
  });
}

type RiskLimits = {
  platformLimitPaise: bigint;
  warningThresholdPct: number;
  restrictedThresholdPct: number;
};

async function loadRows(playerId?: string): Promise<{
  rows: PlayerRiskRow[];
  largestUser: { name: string; notionalPaise: bigint } | null;
  limits: RiskLimits;
}> {
  const since = new Date(Date.now() - RECENT_VOLUME_HOURS * 60 * 60 * 1000);
  const settings = await getSettings();
  const platformLimitPaise = riskCapacity.quote({
    configuredPlatformLimitPaise: settings.maxPlatformPlayerLiabilityPaise,
  }).recommendedPlayerLimitPaise;
  const [players, lots, trades, controls] = await Promise.all([
    prisma.player.findMany({
      where: playerId ? { id: playerId } : undefined,
      orderBy: { name: "asc" },
      select: { id: true, name: true, midPricePaise: true },
    }),
    prisma.holdingLot.findMany({
      where: { quantityRemaining: { gt: 0 }, ...(playerId ? { playerId } : {}) },
      select: {
        userId: true,
        playerId: true,
        quantityRemaining: true,
        cashCostPaise: true,
        bonusCostPaise: true,
        user: { select: { displayName: true } },
      },
    }),
    prisma.trade.findMany({
      where: { createdAt: { gte: since }, ...(playerId ? { playerId } : {}) },
      select: { playerId: true, side: true, cashPaise: true, bonusPaise: true },
    }),
    prisma.playerRiskControl.findMany({
      where: playerId ? { playerId } : undefined,
      select: { playerId: true, manualMode: true, lastState: true },
    }),
  ]);
  const rows = buildRows({
    players,
    lots,
    trades,
    controls,
    limits: {
      maxPlatformPlayerLiabilityPaise: platformLimitPaise,
      warningThresholdPct: settings.warningThresholdPct,
      restrictedThresholdPct: settings.restrictedThresholdPct,
      singleUserConcentrationAlertPct: settings.singleUserConcentrationAlertPct,
    },
  });
  const mids = new Map(players.map((player) => [player.id, player.midPricePaise]));
  const byUser = new Map<string, { name: string; notionalPaise: bigint }>();
  for (const lot of lots) {
    const current = byUser.get(lot.userId) ?? { name: lot.user.displayName?.trim() || "Customer", notionalPaise: 0n };
    current.notionalPaise += markedNotional(lot.quantityRemaining, mids.get(lot.playerId) ?? 0n);
    byUser.set(lot.userId, current);
  }
  const largestUser = [...byUser.values()].sort((left, right) => (right.notionalPaise > left.notionalPaise ? 1 : -1))[0] ?? null;
  return {
    rows,
    largestUser,
    limits: {
      platformLimitPaise,
      warningThresholdPct: settings.warningThresholdPct,
      restrictedThresholdPct: settings.restrictedThresholdPct,
    },
  };
}

async function rememberState(row: PlayerRiskRow, limits: RiskLimits, reason: string, actorId: string | null): Promise<void> {
  const existing = await prisma.playerRiskControl.findUnique({ where: { playerId: row.playerId } });
  const plan = planRiskTransition({
    storedState: existing?.lastState ?? null,
    manualMode: row.manualMode,
    markedPaise: row.markedPaise,
    platformLimitPaise: limits.platformLimitPaise,
    warningThresholdPct: limits.warningThresholdPct,
    restrictedThresholdPct: limits.restrictedThresholdPct,
  });
  if (!plan.writeHistory) return;
  const snapshot: Prisma.InputJsonValue = riskMetricsSnapshot({
    midPaise: row.midPaise,
    outstanding: row.outstanding,
    markedPaise: row.markedPaise,
    platformLimitPaise: limits.platformLimitPaise,
    limitUsedPct: row.limitUsedPct,
    largestHolderQuantity: row.largestHolderQuantity,
    largestHolderPct: holderSharePercent(row.largestHolderQuantity, row.outstanding),
    top10SharePct: row.top10SharePct,
    unrealizedPaise: row.unrealizedPaise,
    manualMode: row.manualMode,
  });
  if (!existing) {
    await prisma.playerRiskControl.create({
      data: { playerId: row.playerId, manualMode: row.manualMode, lastState: plan.state },
    });
    await prisma.riskStateChange.create({
      data: { playerId: row.playerId, oldState: plan.previousState, newState: plan.state, reason, metricsSnapshot: snapshot, actorId },
    });
    return;
  }
  const updated = await prisma.playerRiskControl.updateMany({
    where: { playerId: row.playerId, lastState: existing.lastState },
    data: { lastState: plan.state },
  });
  if (updated.count !== 1) return;
  await prisma.riskStateChange.create({
    data: {
      playerId: row.playerId,
      oldState: plan.previousState,
      newState: plan.state,
      reason,
      metricsSnapshot: snapshot,
      actorId,
    },
  });
}

export async function evaluatePlayerRisk(playerId: string, reason: string, actorId: string | null = null): Promise<void> {
  const { rows, limits } = await loadRows(playerId);
  const row = rows.find((item) => item.playerId === playerId);
  if (row) await rememberState(row, limits, reason, actorId);
}

export async function onMidPricePersisted(playerId: string, previousMidPaise: bigint, nextMidPaise: bigint): Promise<void> {
  if (previousMidPaise === nextMidPaise) return;
  await evaluatePlayerRisk(playerId, "Mid price changed.");
}

export async function refreshAllPlayerRisk(reason: string): Promise<void> {
  const { rows, limits } = await loadRows();
  for (const row of rows) await rememberState(row, limits, reason, null);
}

export function queueRiskRefresh(key: string): void {
  if (!riskSettingAffectsState(key)) return;
  void refreshAllPlayerRisk("Risk limits changed.").catch((error) => {
    console.error(JSON.stringify({
      level: "error",
      message: error instanceof Error ? error.message : "risk refresh failed",
      at: new Date().toISOString(),
    }));
  });
}

export async function riskOverview() {
  const { rows, largestUser, limits } = await loadRows();
  const attention: RiskAttentionRow[] = rows.map((row) => ({
    playerId: row.playerId,
    name: row.name,
    state: row.state,
    limitUsedPct: row.limitUsedPct,
    concentrationAlert: row.concentrationAlert,
  }));
  return {
    rows,
    totalMarkedPaise: rows.reduce((sum, row) => sum + row.markedPaise, 0n),
    highRisk: rows.filter((row) => row.state === "RESTRICTED" || row.state === "PAUSED").length,
    warnings: rows.filter((row) => row.state === "WARNING").length,
    largestUser,
    alerts: riskAttention(attention),
    platformLimitPaise: limits.platformLimitPaise,
  };
}

export async function playerRiskDetail(playerId: string) {
  const { rows, limits } = await loadRows(playerId);
  const row = rows.find((item) => item.playerId === playerId);
  if (!row) return null;
  const history = await prisma.riskStateChange.findMany({
    where: { playerId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return { row, history, platformLimitPaise: limits.platformLimitPaise };
}

export async function setPlayerRiskMode(input: {
  playerId: string;
  mode: ManualRiskMode;
  actorId: string;
  reason: string;
}): Promise<void> {
  const player = await prisma.player.findUnique({ where: { id: input.playerId }, select: { id: true } });
  if (!player) throw new AppError("NOT_FOUND", "That player was not found.", 404);
  await prisma.playerRiskControl.upsert({
    where: { playerId: input.playerId },
    create: { playerId: input.playerId, manualMode: input.mode, lastState: "NORMAL" },
    update: { manualMode: input.mode },
  });
  await evaluatePlayerRisk(input.playerId, input.reason, input.actorId);
}
