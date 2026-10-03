/**
 * Growth, consent, and payment-safety rules.
 * These do not change prices, spreads, risk limits, or ledger line math.
 */

import { POLICY_VERSIONS } from "./policy-versions";

export const TERMS_VERSION = POLICY_VERSIONS.terms;
export const PRIVACY_VERSION = POLICY_VERSIONS.privacy;
export const PAYMENT_PENDING_EXPIRY_MS = 30 * 60 * 1000;
export const CUSTOMER_MIN_DEPOSIT_PAISE = 50_000n;
export const DEPOSIT_CHOICES_PAISE = [50_000n, 100_000n, 250_000n, 500_000n] as const;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 30_000;
export const SIGNUP_PROMPT_DELAY_MS = 12_000;
export const SIGNUP_PROMPT_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export const LIFECYCLE_STAGES = [
  "VISITOR",
  "REGISTERED",
  "CONTACT_VERIFIED",
  "NO_DEPOSIT",
  "BONUS_RECEIVED",
  "DEPOSIT_PENDING",
  "FIRST_DEPOSITOR",
  "FIRST_TRADER",
  "ACTIVE",
  "COOLING",
  "CHURN_RISK",
  "DORMANT",
  "REACTIVATED",
  "RESTRICTED",
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const MARKETING_EVENTS = [
  "LANDING_VIEW",
  "SIGNUP_PROMPT_SHOWN",
  "SIGNUP_STARTED",
  "OTP_VERIFIED",
  "SIGNUP_COMPLETED",
  "WELCOME_BONUS_GRANTED",
  "DEPOSIT_PAGE_VIEWED",
  "DEPOSIT_STARTED",
  "PAYMENT_METHOD_SELECTED",
  "DEPOSIT_SUCCESS",
  "FIRST_DEPOSIT",
  "TRADE_STARTED",
  "FIRST_TRADE",
] as const;
export type MarketingEventName = (typeof MARKETING_EVENTS)[number];

const PII_KEYS = ["phone", "email", "otp", "password", "pan", "account", "wallet", "balance", "secret", "token"];

export function marketingPayload(input: Record<string, unknown>): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (PII_KEYS.some((word) => key.toLowerCase().includes(word))) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") safe[key] = value;
  }
  return safe;
}

export function dataLayerEventName(event: MarketingEventName): string {
  return `playerpulser_${event.toLowerCase()}`;
}

/** Future Meta names. Nothing is sent to Meta in this milestone. */
export const META_EVENT_MAP: Partial<Record<MarketingEventName, string>> = {
  LANDING_VIEW: "PageView",
  SIGNUP_COMPLETED: "CompleteRegistration",
  DEPOSIT_STARTED: "InitiateCheckout",
  DEPOSIT_SUCCESS: "Purchase",
  FIRST_TRADE: "FirstTrade",
};

export function lifecycleStage(input: {
  registered: boolean;
  bonusReceived: boolean;
  depositPending: boolean;
  deposited: boolean;
  traded: boolean;
  cooling: boolean;
  churnRisk: boolean;
  restricted?: boolean;
  dormant?: boolean;
  reactivated?: boolean;
  contactVerified?: boolean;
  noDeposit?: boolean;
}): LifecycleStage {
  if (input.restricted) return "RESTRICTED";
  if (!input.registered) return "VISITOR";
  if (input.reactivated) return "REACTIVATED";
  if (input.dormant) return "DORMANT";
  if (input.churnRisk) return "CHURN_RISK";
  if (input.cooling) return "COOLING";
  if (input.traded && input.deposited) return "ACTIVE";
  if (input.deposited && !input.traded) return "FIRST_DEPOSITOR";
  if (input.traded && !input.deposited) return "FIRST_TRADER";
  if (input.depositPending) return "DEPOSIT_PENDING";
  if (input.bonusReceived) return "BONUS_RECEIVED";
  if (input.noDeposit) return "NO_DEPOSIT";
  if (input.contactVerified) return "CONTACT_VERIFIED";
  return "REGISTERED";
}

export function customerCta(stage: LifecycleStage): "signup" | "deposit" | "trade" | "portfolio" | null {
  if (stage === "VISITOR") return "signup";
  if (stage === "REGISTERED" || stage === "BONUS_RECEIVED" || stage === "DEPOSIT_PENDING") return "deposit";
  if (stage === "FIRST_DEPOSITOR") return "trade";
  if (stage === "CONTACT_VERIFIED" || stage === "NO_DEPOSIT") return "deposit";
  if (stage === "ACTIVE" || stage === "FIRST_TRADER" || stage === "COOLING" || stage === "CHURN_RISK" || stage === "DORMANT" || stage === "REACTIVATED") return "portfolio";
  return null;
}

export type BonusDecision = "GRANT" | "PENDING_REVIEW" | "NOT_ELIGIBLE";

export function assessWelcomeBonus(input: {
  alreadyGranted: boolean;
  sameDeviceGrant: boolean;
  samePaymentIdentityGrant: boolean;
}): { decision: BonusDecision; reason: string | null } {
  if (input.alreadyGranted) return { decision: "NOT_ELIGIBLE", reason: "A welcome bonus was already recorded for this account." };
  if (input.sameDeviceGrant || input.samePaymentIdentityGrant) {
    return { decision: "PENDING_REVIEW", reason: "Another welcome bonus matches a shared device or payment identity." };
  }
  return { decision: "GRANT", reason: null };
}

export function otpAttemptAllowed(attempts: number, max = OTP_MAX_ATTEMPTS): boolean {
  return attempts >= 0 && attempts < max;
}

export function otpResendAllowed(lastSentAtMs: number | null, nowMs: number, cooldownMs = OTP_RESEND_COOLDOWN_MS): boolean {
  if (lastSentAtMs === null) return true;
  return nowMs - lastSentAtMs >= cooldownMs;
}

export function withinRateWindow(timestamps: number[], nowMs: number, windowMs: number, max: number): boolean {
  return timestamps.filter((time) => nowMs - time < windowMs).length < max;
}

export function customerDepositAllowed(amountPaise: bigint): boolean {
  return amountPaise >= CUSTOMER_MIN_DEPOSIT_PAISE && amountPaise <= 10_000_000n;
}

/** A browser return from a gateway is not a credit. */
export function creditFromPaymentReturn(): { credited: false; display: "VERIFYING" } {
  return { credited: false, display: "VERIFYING" };
}

export function webhookAmountAccepted(expectedPaise: bigint, reportedPaise: bigint | null): boolean {
  if (reportedPaise === null) return true;
  return reportedPaise === expectedPaise && reportedPaise > 0n;
}

export function webhookCurrencyAccepted(currency: string | null): boolean {
  if (!currency) return true;
  return currency.trim().toUpperCase() === "INR";
}

export function signupPromptVisible(input: { dismissedAtMs: number | null; nowMs: number; elapsedMs: number }): boolean {
  if (input.elapsedMs < SIGNUP_PROMPT_DELAY_MS) return false;
  if (input.dismissedAtMs !== null && input.nowMs - input.dismissedAtMs < SIGNUP_PROMPT_DISMISS_MS) return false;
  return true;
}

export function indexingForPath(pathname: string): "index" | "noindex" {
  if (pathname.startsWith("/admin") || pathname.startsWith("/api") || pathname.startsWith("/wallet") || pathname.startsWith("/home")) {
    return "noindex";
  }
  if (PUBLIC_POLICY_PATHS.some((path) => pathname === path)) return "index";
  return "noindex";
}

export const PUBLIC_POLICY_PATHS = [
  "/terms",
  "/privacy",
  "/cookies",
  "/risk-disclosure",
  "/bonus-terms",
  "/payment-policy",
  "/responsible-use",
  "/complaints",
] as const;

export function gatewayChangeAllowed(input: { permission: boolean; reason: string }): boolean {
  return input.permission && input.reason.trim().length >= 3;
}
