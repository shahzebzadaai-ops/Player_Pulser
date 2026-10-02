import { AppError } from "@/domain/errors";
import {
  bonusIssuanceAllowed,
  defaultFeatureFlags,
  FEATURE_KEYS,
  type FeatureFlags,
  type FeatureKey,
} from "@/domain/features";
import { prisma, type Tx } from "./prisma";

const CACHE_MS = 2_000;

let cache: { at: number; flags: FeatureFlags } | null = null;

export function featureSettingKey(key: FeatureKey): string {
  return `feature.${key}`;
}

export function invalidateFeatureFlags(): void {
  cache = null;
}

export async function getFeatureFlags(db: Tx = prisma): Promise<FeatureFlags> {
  const shared = db === prisma;
  if (shared && cache && Date.now() - cache.at < CACHE_MS) return cache.flags;
  const flags = defaultFeatureFlags();
  const rows = await db.appSetting.findMany({
    where: { key: { in: FEATURE_KEYS.map(featureSettingKey) } },
  });
  for (const row of rows) {
    const name = row.key.replace(/^feature\./, "") as FeatureKey;
    if ((FEATURE_KEYS as readonly string[]).includes(name)) flags[name] = row.value === true;
  }
  if (shared) cache = { at: Date.now(), flags };
  return flags;
}

export const getFeatures = getFeatureFlags;

const BLOCKS: Partial<Record<FeatureKey, { code: string; message: string }>> = {
  liveTradingEnabled: { code: "TRADING_DISABLED", message: "Trading is temporarily unavailable." },
  depositsEnabled: { code: "DEPOSITS_DISABLED", message: "Deposits are temporarily unavailable." },
  withdrawalsEnabled: { code: "WITHDRAWALS_DISABLED", message: "Withdrawals are temporarily unavailable." },
  referralsEnabled: { code: "REFERRALS_DISABLED", message: "New referral codes are temporarily unavailable." },
  whatsappEnabled: { code: "WHATSAPP_DISABLED", message: "New WhatsApp campaigns are temporarily unavailable." },
  pushEnabled: { code: "PUSH_DISABLED", message: "New push campaigns are temporarily unavailable." },
};

export async function assertFeatureEnabled(flag: FeatureKey, db: Tx = prisma): Promise<void> {
  const features = await getFeatureFlags(db);
  if (features[flag]) return;
  const block = BLOCKS[flag];
  throw new AppError(block?.code ?? "FEATURE_DISABLED", block?.message ?? "That feature is temporarily unavailable.", 403);
}

export async function assertTradingEnabled(db: Tx = prisma): Promise<void> {
  await assertFeatureEnabled("liveTradingEnabled", db);
}

export async function assertDepositsEnabled(db: Tx = prisma): Promise<void> {
  await assertFeatureEnabled("depositsEnabled", db);
}

export async function assertWithdrawalsEnabled(db: Tx = prisma): Promise<void> {
  await assertFeatureEnabled("withdrawalsEnabled", db);
}

export async function assertWelcomeBonusAllowed(db: Tx = prisma): Promise<boolean> {
  const flags = await getFeatureFlags(db);
  return bonusIssuanceAllowed(flags, "WELCOME");
}
