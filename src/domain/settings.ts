import type { EngineMode } from "./pricing-engine";
import type { MarketMode } from "./showcase-market";

export type PricingMode = "simulation" | "paused";
export type { EngineMode };

export type AppSettings = {
  spreadNormalPpm: number;
  spreadLivePpm: number;
  quoteTtlSeconds: number;
  quoteTtlLiveSeconds: number;
  quoteConfirmBps: number;
  feedStaleAfterSeconds: number;
  withdrawalMinPaise: bigint;
  withdrawalStandardBps: number;
  bonusWelcomePaise: bigint;
  bonusWageringMultiplier: number;
  bonusValidityDays: number;
  bonusMinQualifyingDepositPaise: bigint;
  bonusMinCashPortionBps: number;
  pricingSimulationCapBps: number;
  simulationCycleMs: number;
  marketMode: MarketMode;
  showcaseRangeTarget: number;
  showcaseVolatility: number;
  pricingMode: PricingMode;
  engineMode: EngineMode;
  performanceMatchCapBps: number;
  circuitBreakerBps: number;
  demandWindowSeconds: number;
  demandMaxBps: number;
  demandDayCapBps: number;
  demandMinTrades: number;
  newsEventCapBps: number;
  tradeMaxQuantity: number;
  highValueDepositThresholdPaise: bigint;
  churnRiskInactiveDays: number;
  maxUserPlayerExposurePaise: bigint;
  maxUserTotalExposurePaise: bigint;
  maxPlatformPlayerLiabilityPaise: bigint;
  warningThresholdPct: number;
  restrictedThresholdPct: number;
  singleUserConcentrationAlertPct: number;
  realSourcePricingEnabled: boolean;
  realSourcePricingEnabledAt: string | null;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  spreadNormalPpm: 10_000,
  spreadLivePpm: 12_500,
  quoteTtlSeconds: 30,
  quoteTtlLiveSeconds: 8,
  quoteConfirmBps: 50,
  feedStaleAfterSeconds: 30,
  withdrawalMinPaise: 50_000n,
  withdrawalStandardBps: 9_500,
  bonusWelcomePaise: 20_000n,
  bonusWageringMultiplier: 3,
  bonusValidityDays: 14,
  bonusMinQualifyingDepositPaise: 50_000n,
  bonusMinCashPortionBps: 5_000,
  pricingSimulationCapBps: 200,
  simulationCycleMs: 4_000,
  marketMode: "SHOWCASE",
  showcaseRangeTarget: 50,
  showcaseVolatility: 100,
  pricingMode: "simulation",
  engineMode: "SIMULATION",
  performanceMatchCapBps: 1200,
  circuitBreakerBps: 1800,
  demandWindowSeconds: 300,
  demandMaxBps: 25,
  demandDayCapBps: 200,
  demandMinTrades: 2,
  newsEventCapBps: 500,
  tradeMaxQuantity: 10_000,
  highValueDepositThresholdPaise: 1_000_000n,
  churnRiskInactiveDays: 14,
  maxUserPlayerExposurePaise: 10_000_000n,
  maxUserTotalExposurePaise: 50_000_000n,
  maxPlatformPlayerLiabilityPaise: 500_000_000n,
  warningThresholdPct: 70,
  restrictedThresholdPct: 90,
  singleUserConcentrationAlertPct: 10,
  realSourcePricingEnabled: false,
  realSourcePricingEnabledAt: null,
};

export const SIMULATION_CYCLE_MIN_MS = 3_000;
export const SIMULATION_CYCLE_MAX_MS = 5_000;

export function simulationCycleMs(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_APP_SETTINGS.simulationCycleMs;
  return Math.min(SIMULATION_CYCLE_MAX_MS, Math.max(SIMULATION_CYCLE_MIN_MS, Math.round(parsed)));
}

export function journalBalances(entries: { amountPaise: bigint }[]): boolean {
  return entries.reduce((sum, entry) => sum + entry.amountPaise, 0n) === 0n;
}
