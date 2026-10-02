/**
 * Exposure and trade admission.
 * These figures never feed the price engine.
 */

export const RISK_STATES = ["NORMAL", "WARNING", "RESTRICTED", "PAUSED"] as const;
export type RiskState = (typeof RISK_STATES)[number];

export const MANUAL_RISK_MODES = ["AUTO", "PAUSE_BUYS", "PAUSE_ALL"] as const;
export type ManualRiskMode = (typeof MANUAL_RISK_MODES)[number];

export const RISK_REJECT_REASONS = [
  "USER_PLAYER_LIMIT",
  "USER_TOTAL_LIMIT",
  "PLAYER_PLATFORM_LIMIT",
  "BUYS_PAUSED",
  "TRADING_PAUSED",
] as const;
export type RiskRejectReason = (typeof RISK_REJECT_REASONS)[number];

export const RISK_SETTING_KEYS = [
  "risk.maxUserPlayerExposurePaise",
  "risk.maxUserTotalExposurePaise",
  "risk.maxPlatformPlayerLiabilityPaise",
  "risk.warningThresholdPct",
  "risk.restrictedThresholdPct",
  "risk.singleUserConcentrationAlertPct",
] as const;

export const RISK_STATE_SETTING_KEYS = [
  "risk.maxPlatformPlayerLiabilityPaise",
  "risk.warningThresholdPct",
  "risk.restrictedThresholdPct",
  "risk.singleUserConcentrationAlertPct",
] as const;

export const RECENT_VOLUME_HOURS = 24;

export const DEFAULT_RISK_LIMITS = {
  maxUserPlayerExposurePaise: 10_000_000n,
  maxUserTotalExposurePaise: 50_000_000n,
  maxPlatformPlayerLiabilityPaise: 500_000_000n,
  warningThresholdPct: 70,
  restrictedThresholdPct: 90,
  singleUserConcentrationAlertPct: 10,
};

export function riskSettingRequiresReason(key: string): boolean {
  return (RISK_SETTING_KEYS as readonly string[]).includes(key);
}

export function riskSettingAffectsState(key: string): boolean {
  return (RISK_STATE_SETTING_KEYS as readonly string[]).includes(key);
}

export function customerRiskMessage(reason: RiskRejectReason): string {
  if (reason === "USER_PLAYER_LIMIT") return "You've reached the current position limit for this player.";
  if (reason === "USER_TOTAL_LIMIT") return "You've reached your current total position limit.";
  if (reason === "TRADING_PAUSED") return "Trading is temporarily unavailable for this player.";
  return "New buys are temporarily unavailable for this player.";
}

export type RiskCapacityQuote = {
  availableRiskCapitalPaise: bigint;
  recommendedPlayerLimitPaise: bigint;
};

export interface RiskCapacityProvider {
  quote(input: { configuredPlatformLimitPaise: bigint }): RiskCapacityQuote;
}

export class StaticRiskCapacityProvider implements RiskCapacityProvider {
  quote(input: { configuredPlatformLimitPaise: bigint }): RiskCapacityQuote {
    return {
      availableRiskCapitalPaise: input.configuredPlatformLimitPaise,
      recommendedPlayerLimitPaise: input.configuredPlatformLimitPaise,
    };
  }
}

export const riskCapacity: RiskCapacityProvider = new StaticRiskCapacityProvider();

export type RiskMetricsSnapshot = {
  midPricePaise: string;
  outstandingPulsers: number;
  markedValuePaise: string;
  platformLimitPaise: string;
  limitUsedPct: number;
  largestHolderPulsers: number;
  largestHolderPct: number;
  top10ConcentrationPct: number;
  customerUnrealizedPnlPaise: string;
  manualMode: ManualRiskMode;
};

export function riskMetricsSnapshot(input: {
  midPaise: bigint;
  outstanding: number;
  markedPaise: bigint;
  platformLimitPaise: bigint;
  limitUsedPct: number;
  largestHolderQuantity: number;
  largestHolderPct: number;
  top10SharePct: number;
  unrealizedPaise: bigint;
  manualMode: ManualRiskMode;
}): RiskMetricsSnapshot {
  return {
    midPricePaise: input.midPaise.toString(),
    outstandingPulsers: input.outstanding,
    markedValuePaise: input.markedPaise.toString(),
    platformLimitPaise: input.platformLimitPaise.toString(),
    limitUsedPct: input.limitUsedPct,
    largestHolderPulsers: input.largestHolderQuantity,
    largestHolderPct: input.largestHolderPct,
    top10ConcentrationPct: input.top10SharePct,
    customerUnrealizedPnlPaise: input.unrealizedPaise.toString(),
    manualMode: input.manualMode,
  };
}

export function planRiskTransition(input: {
  storedState: string | null;
  manualMode: ManualRiskMode;
  markedPaise: bigint;
  platformLimitPaise: bigint;
  warningThresholdPct: number;
  restrictedThresholdPct: number;
}): { state: RiskState; previousState: RiskState; writeHistory: boolean } {
  const usage = usageState(
    input.markedPaise,
    input.platformLimitPaise,
    input.warningThresholdPct,
    input.restrictedThresholdPct,
  );
  const state = effectiveRiskState(input.manualMode, usage);
  const previousState =
    input.storedState === "NORMAL" ||
    input.storedState === "WARNING" ||
    input.storedState === "RESTRICTED" ||
    input.storedState === "PAUSED"
      ? input.storedState
      : "NORMAL";
  return { state, previousState, writeHistory: state !== previousState };
}

export function markedNotional(quantity: number, midPaise: bigint): bigint {
  if (quantity <= 0 || midPaise <= 0n) return 0n;
  return midPaise * BigInt(quantity);
}

export function usedPercent(usedPaise: bigint, limitPaise: bigint): number {
  if (limitPaise <= 0n) return 100;
  if (usedPaise <= 0n) return 0;
  return Number((usedPaise * 10_000n) / limitPaise) / 100;
}

export function usageState(usedPaise: bigint, limitPaise: bigint, warningPct: number, restrictedPct: number): RiskState {
  if (limitPaise <= 0n) return "RESTRICTED";
  if (usedPaise * 100n >= limitPaise * BigInt(restrictedPct)) return "RESTRICTED";
  if (usedPaise * 100n >= limitPaise * BigInt(warningPct)) return "WARNING";
  return "NORMAL";
}

export function effectiveRiskState(manualMode: ManualRiskMode, usage: RiskState): RiskState {
  if (manualMode === "PAUSE_ALL") return "PAUSED";
  if (manualMode === "PAUSE_BUYS") return "RESTRICTED";
  return usage;
}

export function holderSharePercent(holderQuantity: number, outstanding: number): number {
  if (outstanding <= 0 || holderQuantity <= 0) return 0;
  return (holderQuantity * 10_000) / outstanding / 100;
}

export function concentrationAlert(holderQuantity: number, outstanding: number, alertPct: number): boolean {
  if (outstanding <= 0 || alertPct <= 0) return false;
  return holderQuantity * 100 >= outstanding * alertPct;
}

export function topHolderSharePercent(quantities: number[], outstanding: number, count: number): number {
  if (outstanding <= 0) return 0;
  const top = [...quantities].sort((left, right) => right - left).slice(0, count);
  const held = top.reduce((sum, quantity) => sum + quantity, 0);
  return holderSharePercent(held, outstanding);
}

export type TradeAdmission = {
  side: "BUY" | "SELL";
  quantity: number;
  midPaise: bigint;
  userPlayerQuantity: number;
  userTotalNotionalPaise: bigint;
  playerOutstanding: number;
  manualMode: ManualRiskMode;
  maxUserPlayerExposurePaise: bigint;
  maxUserTotalExposurePaise: bigint;
  maxPlatformPlayerLiabilityPaise: bigint;
  warningThresholdPct: number;
  restrictedThresholdPct: number;
};

export type TradeAdmissionResult =
  | { ok: true; state: RiskState }
  | { ok: false; state: RiskState; reason: RiskRejectReason };

export function assessTrade(input: TradeAdmission): TradeAdmissionResult {
  const marked = markedNotional(input.playerOutstanding, input.midPaise);
  const usage = usageState(marked, input.maxPlatformPlayerLiabilityPaise, input.warningThresholdPct, input.restrictedThresholdPct);
  const state = effectiveRiskState(input.manualMode, usage);
  if (input.side === "SELL") {
    if (state === "PAUSED") return { ok: false, state, reason: "TRADING_PAUSED" };
    return { ok: true, state };
  }
  if (state === "PAUSED") return { ok: false, state, reason: "TRADING_PAUSED" };
  if (state === "RESTRICTED") {
    return { ok: false, state, reason: input.manualMode === "PAUSE_BUYS" ? "BUYS_PAUSED" : "PLAYER_PLATFORM_LIMIT" };
  }
  const added = markedNotional(input.quantity, input.midPaise);
  const userPlayer = markedNotional(input.userPlayerQuantity, input.midPaise) + added;
  if (userPlayer > input.maxUserPlayerExposurePaise) return { ok: false, state, reason: "USER_PLAYER_LIMIT" };
  if (input.userTotalNotionalPaise + added > input.maxUserTotalExposurePaise) return { ok: false, state, reason: "USER_TOTAL_LIMIT" };
  if (marked + added > input.maxPlatformPlayerLiabilityPaise) return { ok: false, state, reason: "PLAYER_PLATFORM_LIMIT" };
  return { ok: true, state };
}

export type RiskAttentionRow = {
  playerId: string;
  name: string;
  state: RiskState;
  limitUsedPct: number;
  concentrationAlert: boolean;
};

export function riskAttention(rows: RiskAttentionRow[]): { label: string; href: string }[] {
  const items: { label: string; href: string }[] = [];
  for (const row of rows) {
    const href = `/admin/market/risk/${row.playerId}`;
    if (row.state === "WARNING" || row.state === "RESTRICTED") {
      items.push({ label: `${row.name} exposure at ${Math.round(row.limitUsedPct)}%`, href });
    }
    if (row.state === "RESTRICTED") items.push({ label: `${row.name} is in RESTRICTED state`, href });
    if (row.state === "PAUSED") items.push({ label: `${row.name} trading is paused`, href });
    if (row.concentrationAlert) items.push({ label: `Large user concentration detected · ${row.name}`, href });
  }
  return items;
}
export type RiskExposure = {
  userPulsersPerPlayer: { userId: string; playerId: string; quantity: number }[];
  totalPulsersOutstanding: number;
  playerConcentration: { playerId: string; quantity: number; shareBps: number }[];
  openPlatformLiabilityPaise: bigint;
};

export function exposureFromLots(
  lots: { userId: string; playerId: string; quantity: number; midPaise: bigint }[],
): RiskExposure {
  const userPulsersPerPlayer = lots
    .filter((lot) => lot.quantity > 0)
    .map((lot) => ({ userId: lot.userId, playerId: lot.playerId, quantity: lot.quantity }));
  const byPlayer = new Map<string, { quantity: number; liability: bigint }>();
  for (const lot of userPulsersPerPlayer) {
    const mid = lots.find((row) => row.userId === lot.userId && row.playerId === lot.playerId)?.midPaise ?? 0n;
    const current = byPlayer.get(lot.playerId) ?? { quantity: 0, liability: 0n };
    current.quantity += lot.quantity;
    current.liability += mid * BigInt(lot.quantity);
    byPlayer.set(lot.playerId, current);
  }
  const totalPulsersOutstanding = [...byPlayer.values()].reduce((sum, row) => sum + row.quantity, 0);
  const playerConcentration = [...byPlayer.entries()].map(([playerId, row]) => ({
    playerId,
    quantity: row.quantity,
    shareBps: totalPulsersOutstanding === 0 ? 0 : Math.round((row.quantity * 10_000) / totalPulsersOutstanding),
  }));
  const openPlatformLiabilityPaise = [...byPlayer.values()].reduce((sum, row) => sum + row.liability, 0n);
  return { userPulsersPerPlayer, totalPulsersOutstanding, playerConcentration, openPlatformLiabilityPaise };
}
