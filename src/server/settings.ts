import { resolveEngineMode } from "@/domain/pricing-engine";
import { DEFAULT_APP_SETTINGS, simulationCycleMs, type AppSettings, type PricingMode } from "@/domain/settings";
import { requireReason, writeAudit } from "./audit";
import { prisma, type Tx } from "./prisma";

function numberSetting(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function paiseSetting(value: unknown, fallback: bigint): bigint {
  return typeof value === "string" && /^-?\d+$/.test(value) ? BigInt(value) : fallback;
}

function booleanSetting(value: unknown, fallback: boolean): boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}

const SETTINGS_CACHE_MS = 2_000;
let settingsCache: { at: number; value: AppSettings } | null = null;

export function invalidateSettingsCache(): void {
  settingsCache = null;
}

export async function getSettings(db: Tx = prisma): Promise<AppSettings> {
  const shared = db === prisma && process.env.NODE_ENV !== "test";
  if (shared && settingsCache && Date.now() - settingsCache.at < SETTINGS_CACHE_MS) return settingsCache.value;
  const value = await readSettings(db);
  if (shared) settingsCache = { at: Date.now(), value };
  return value;
}

async function readSettings(db: Tx): Promise<AppSettings> {
  const rows = await db.appSetting.findMany();
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const mode = values.get("pricing.mode");
  const pricingMode: PricingMode = mode === "paused" ? "paused" : "simulation";
  return {
    spreadNormalPpm: numberSetting(values.get("spread.normalPpm"), DEFAULT_APP_SETTINGS.spreadNormalPpm),
    spreadLivePpm: numberSetting(values.get("spread.livePpm"), DEFAULT_APP_SETTINGS.spreadLivePpm),
    quoteTtlSeconds: numberSetting(values.get("quote.ttlSeconds"), DEFAULT_APP_SETTINGS.quoteTtlSeconds),
    quoteTtlLiveSeconds: numberSetting(values.get("quote.ttlLiveSeconds"), DEFAULT_APP_SETTINGS.quoteTtlLiveSeconds),
    quoteConfirmBps: numberSetting(values.get("quote.confirmBps"), DEFAULT_APP_SETTINGS.quoteConfirmBps),
    feedStaleAfterSeconds: numberSetting(
      values.get("feed.staleAfterSeconds"),
      DEFAULT_APP_SETTINGS.feedStaleAfterSeconds,
    ),
    withdrawalMinPaise: paiseSetting(values.get("withdrawal.minPaise"), DEFAULT_APP_SETTINGS.withdrawalMinPaise),
    withdrawalStandardBps: numberSetting(
      values.get("withdrawal.standardBps"),
      DEFAULT_APP_SETTINGS.withdrawalStandardBps,
    ),
    bonusWelcomePaise: paiseSetting(values.get("bonus.welcomePaise"), DEFAULT_APP_SETTINGS.bonusWelcomePaise),
    bonusWageringMultiplier: numberSetting(
      values.get("bonus.wageringMultiplier"),
      DEFAULT_APP_SETTINGS.bonusWageringMultiplier,
    ),
    bonusValidityDays: numberSetting(values.get("bonus.validityDays"), DEFAULT_APP_SETTINGS.bonusValidityDays),
    bonusMinQualifyingDepositPaise: paiseSetting(
      values.get("bonus.minQualifyingDepositPaise"),
      DEFAULT_APP_SETTINGS.bonusMinQualifyingDepositPaise,
    ),
    bonusMinCashPortionBps: numberSetting(
      values.get("bonus.minCashPortionBps"),
      DEFAULT_APP_SETTINGS.bonusMinCashPortionBps,
    ),
    pricingSimulationCapBps: numberSetting(
      values.get("pricing.simulationCapBps"),
      DEFAULT_APP_SETTINGS.pricingSimulationCapBps,
    ),
    simulationCycleMs: simulationCycleMs(values.get("pricing.simulationCycleMs") ?? DEFAULT_APP_SETTINGS.simulationCycleMs),
    pricingMode,
    engineMode: resolveEngineMode(values.get("pricing.engineMode"), process.env.PRICING_ENGINE_MODE),
    performanceMatchCapBps: numberSetting(values.get("pricing.performanceMatchCapBps"), DEFAULT_APP_SETTINGS.performanceMatchCapBps),
    circuitBreakerBps: numberSetting(values.get("pricing.circuitBreakerBps"), DEFAULT_APP_SETTINGS.circuitBreakerBps),
    demandWindowSeconds: numberSetting(values.get("pricing.demandWindowSeconds"), DEFAULT_APP_SETTINGS.demandWindowSeconds),
    demandMaxBps: numberSetting(values.get("pricing.demandMaxBps"), DEFAULT_APP_SETTINGS.demandMaxBps),
    demandDayCapBps: numberSetting(values.get("pricing.demandDayCapBps"), DEFAULT_APP_SETTINGS.demandDayCapBps),
    demandMinTrades: numberSetting(values.get("pricing.demandMinTrades"), DEFAULT_APP_SETTINGS.demandMinTrades),
    newsEventCapBps: numberSetting(values.get("pricing.newsEventCapBps"), DEFAULT_APP_SETTINGS.newsEventCapBps),
    tradeMaxQuantity: numberSetting(values.get("trade.maxQuantity"), DEFAULT_APP_SETTINGS.tradeMaxQuantity),
    highValueDepositThresholdPaise: paiseSetting(
      values.get("crm.highValueDepositThresholdPaise"),
      DEFAULT_APP_SETTINGS.highValueDepositThresholdPaise,
    ),
    churnRiskInactiveDays: numberSetting(values.get("crm.churnRiskInactiveDays"), DEFAULT_APP_SETTINGS.churnRiskInactiveDays),
    maxUserPlayerExposurePaise: paiseSetting(values.get("risk.maxUserPlayerExposurePaise"), DEFAULT_APP_SETTINGS.maxUserPlayerExposurePaise),
    maxUserTotalExposurePaise: paiseSetting(values.get("risk.maxUserTotalExposurePaise"), DEFAULT_APP_SETTINGS.maxUserTotalExposurePaise),
    maxPlatformPlayerLiabilityPaise: paiseSetting(
      values.get("risk.maxPlatformPlayerLiabilityPaise"),
      DEFAULT_APP_SETTINGS.maxPlatformPlayerLiabilityPaise,
    ),
    warningThresholdPct: numberSetting(values.get("risk.warningThresholdPct"), DEFAULT_APP_SETTINGS.warningThresholdPct),
    restrictedThresholdPct: numberSetting(values.get("risk.restrictedThresholdPct"), DEFAULT_APP_SETTINGS.restrictedThresholdPct),
    singleUserConcentrationAlertPct: numberSetting(
      values.get("risk.singleUserConcentrationAlertPct"),
      DEFAULT_APP_SETTINGS.singleUserConcentrationAlertPct,
    ),
    realSourcePricingEnabled: booleanSetting(
      values.get("feed.realSourcePricingEnabled"),
      DEFAULT_APP_SETTINGS.realSourcePricingEnabled,
    ),
    realSourcePricingEnabledAt: timestampSetting(values.get("feed.realSourcePricingEnabledAt")),
  };
}

function timestampSetting(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

export const SETTING_DEFAULT_ROWS: { key: string; value: string | number }[] = [
  { key: "spread.normalPpm", value: DEFAULT_APP_SETTINGS.spreadNormalPpm },
  { key: "spread.livePpm", value: DEFAULT_APP_SETTINGS.spreadLivePpm },
  { key: "quote.ttlSeconds", value: DEFAULT_APP_SETTINGS.quoteTtlSeconds },
  { key: "quote.ttlLiveSeconds", value: DEFAULT_APP_SETTINGS.quoteTtlLiveSeconds },
  { key: "quote.confirmBps", value: DEFAULT_APP_SETTINGS.quoteConfirmBps },
  { key: "feed.staleAfterSeconds", value: DEFAULT_APP_SETTINGS.feedStaleAfterSeconds },
  { key: "feed.realSourcePricingEnabled", value: "false" },
  { key: "withdrawal.minPaise", value: DEFAULT_APP_SETTINGS.withdrawalMinPaise.toString() },
  { key: "withdrawal.standardBps", value: DEFAULT_APP_SETTINGS.withdrawalStandardBps },
  { key: "bonus.welcomePaise", value: DEFAULT_APP_SETTINGS.bonusWelcomePaise.toString() },
  { key: "bonus.wageringMultiplier", value: DEFAULT_APP_SETTINGS.bonusWageringMultiplier },
  { key: "bonus.validityDays", value: DEFAULT_APP_SETTINGS.bonusValidityDays },
  { key: "bonus.minQualifyingDepositPaise", value: DEFAULT_APP_SETTINGS.bonusMinQualifyingDepositPaise.toString() },
  { key: "bonus.minCashPortionBps", value: DEFAULT_APP_SETTINGS.bonusMinCashPortionBps },
  { key: "pricing.simulationCapBps", value: DEFAULT_APP_SETTINGS.pricingSimulationCapBps },
  { key: "pricing.simulationCycleMs", value: DEFAULT_APP_SETTINGS.simulationCycleMs },
  { key: "pricing.mode", value: DEFAULT_APP_SETTINGS.pricingMode },
  { key: "pricing.engineMode", value: DEFAULT_APP_SETTINGS.engineMode },
  { key: "pricing.performanceMatchCapBps", value: DEFAULT_APP_SETTINGS.performanceMatchCapBps },
  { key: "pricing.circuitBreakerBps", value: DEFAULT_APP_SETTINGS.circuitBreakerBps },
  { key: "pricing.demandWindowSeconds", value: DEFAULT_APP_SETTINGS.demandWindowSeconds },
  { key: "pricing.demandMaxBps", value: DEFAULT_APP_SETTINGS.demandMaxBps },
  { key: "pricing.demandDayCapBps", value: DEFAULT_APP_SETTINGS.demandDayCapBps },
  { key: "pricing.demandMinTrades", value: DEFAULT_APP_SETTINGS.demandMinTrades },
  { key: "pricing.newsEventCapBps", value: DEFAULT_APP_SETTINGS.newsEventCapBps },
  { key: "trade.maxQuantity", value: DEFAULT_APP_SETTINGS.tradeMaxQuantity },
  { key: "crm.highValueDepositThresholdPaise", value: DEFAULT_APP_SETTINGS.highValueDepositThresholdPaise.toString() },
  { key: "crm.churnRiskInactiveDays", value: DEFAULT_APP_SETTINGS.churnRiskInactiveDays },
  { key: "risk.maxUserPlayerExposurePaise", value: DEFAULT_APP_SETTINGS.maxUserPlayerExposurePaise.toString() },
  { key: "risk.maxUserTotalExposurePaise", value: DEFAULT_APP_SETTINGS.maxUserTotalExposurePaise.toString() },
  { key: "risk.maxPlatformPlayerLiabilityPaise", value: DEFAULT_APP_SETTINGS.maxPlatformPlayerLiabilityPaise.toString() },
  { key: "risk.warningThresholdPct", value: DEFAULT_APP_SETTINGS.warningThresholdPct },
  { key: "risk.restrictedThresholdPct", value: DEFAULT_APP_SETTINGS.restrictedThresholdPct },
  { key: "risk.singleUserConcentrationAlertPct", value: DEFAULT_APP_SETTINGS.singleUserConcentrationAlertPct },
];

export async function setRealSourcePricingEnabled(input: {
  enabled: boolean;
  actorId: string;
  reason: string;
  ip?: string | null;
}) {
  const reason = requireReason(input.reason);
  const previous = await prisma.appSetting.findUnique({ where: { key: "feed.realSourcePricingEnabled" } });
  const enabledAt = new Date().toISOString();
  await prisma.appSetting.upsert({
    where: { key: "feed.realSourcePricingEnabled" },
    create: { key: "feed.realSourcePricingEnabled", value: input.enabled, updatedBy: input.actorId },
    update: { value: input.enabled, updatedBy: input.actorId },
  });
  if (input.enabled) {
    await prisma.appSetting.upsert({
      where: { key: "feed.realSourcePricingEnabledAt" },
      create: { key: "feed.realSourcePricingEnabledAt", value: enabledAt, updatedBy: input.actorId },
      update: { value: enabledAt, updatedBy: input.actorId },
    });
  }
  invalidateSettingsCache();
  await writeAudit({
    actorId: input.actorId,
    action: "setting.trading",
    entityType: "AppSetting",
    entityId: "feed.realSourcePricingEnabled",
    before: { value: previous?.value ?? false },
    after: { value: input.enabled },
    reason,
    ip: input.ip,
  });
}
