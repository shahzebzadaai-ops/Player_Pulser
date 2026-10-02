import type { EngineMode } from "./pricing-engine";

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

export function journalBalances(entries: { amountPaise: bigint }[]): boolean {
  return entries.reduce((sum, entry) => sum + entry.amountPaise, 0n) === 0n;
}
