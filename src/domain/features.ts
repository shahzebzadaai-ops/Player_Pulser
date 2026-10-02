export const FEATURE_KEYS = [
  "bonusSystemEnabled",
  "welcomeBonusEnabled",
  "loyaltyEnabled",
  "referralsEnabled",
  "whatsappEnabled",
  "pushEnabled",
  "depositsEnabled",
  "withdrawalsEnabled",
  "liveTradingEnabled",
  "newsPriceMovementEnabled",
  "demandPriceMovementEnabled",
  "pulsePreviewEnabled",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type FeatureFlags = Record<FeatureKey, boolean>;

export const HIGH_IMPACT_FEATURES = [
  "liveTradingEnabled",
  "depositsEnabled",
  "withdrawalsEnabled",
  "bonusSystemEnabled",
] as const satisfies readonly FeatureKey[];

export function isHighImpactFeature(key: FeatureKey): boolean {
  return (HIGH_IMPACT_FEATURES as readonly string[]).includes(key);
}

export const FEATURE_LABELS: Record<FeatureKey, { label: string; note: string }> = {
  bonusSystemEnabled: {
    label: "Bonus system",
    note: "OFF stops every new bonus grant. Existing grants, wagering progress, and history stay.",
  },
  welcomeBonusEnabled: {
    label: "Welcome bonus",
    note: "OFF stops new welcome bonuses only. Other bonus types can still be issued when the bonus system is on. Existing welcome bonuses stay.",
  },
  loyaltyEnabled: {
    label: "Loyalty",
    note: "OFF hides loyalty promotions. Existing loyalty and bonus records stay. No loyalty balance is recalculated.",
  },
  referralsEnabled: {
    label: "Referrals",
    note: "OFF blocks new referral codes. Existing codes stay. Referral payouts are not calculated.",
  },
  whatsappEnabled: {
    label: "WhatsApp",
    note: "OFF blocks new WhatsApp campaigns. Existing drafts stay. Nothing is sent.",
  },
  pushEnabled: {
    label: "Push",
    note: "OFF blocks new push campaigns. Existing drafts stay. Nothing is sent.",
  },
  depositsEnabled: {
    label: "Deposits",
    note: "OFF prevents new deposit requests. Existing payment records can still settle.",
  },
  withdrawalsEnabled: {
    label: "Withdrawals",
    note: "OFF prevents new withdrawal requests. Existing pending withdrawals stay.",
  },
  liveTradingEnabled: {
    label: "Live trading",
    note: "OFF prevents all new buy and sell orders. Existing Pulsers and balances are unaffected.",
  },
  newsPriceMovementEnabled: {
    label: "News price movement",
    note: "OFF sets the news factor to zero on the next simulated tick. Performance and demand still apply when they are on.",
  },
  demandPriceMovementEnabled: {
    label: "Demand price movement",
    note: "OFF sets the demand factor to zero on the next simulated tick. Performance and news still apply when they are on.",
  },
  pulsePreviewEnabled: {
    label: "Simulation preview",
    note: "Simulation only — no effect on cash settlement. OFF stops preview ticks. Feed monitoring, quotes, wallets, and holdings stay as they are.",
  },
};

export function bonusIssuanceAllowed(flags: FeatureFlags, source: "WELCOME" | "OTHER"): boolean {
  if (!flags.bonusSystemEnabled) return false;
  if (source === "WELCOME" && !flags.welcomeBonusEnabled) return false;
  return true;
}

export function defaultFeatureFlags(): FeatureFlags {
  return {
    bonusSystemEnabled: true,
    welcomeBonusEnabled: true,
    loyaltyEnabled: true,
    referralsEnabled: true,
    whatsappEnabled: true,
    pushEnabled: true,
    depositsEnabled: true,
    withdrawalsEnabled: true,
    liveTradingEnabled: true,
    newsPriceMovementEnabled: true,
    demandPriceMovementEnabled: true,
    pulsePreviewEnabled: false,
  };
}
