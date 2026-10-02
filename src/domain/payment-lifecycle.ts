import { PAYMENT_PENDING_EXPIRY_MS } from "./growth";

/** Customer-facing lifecycle. Stored success remains SETTLED so ledger queries stay valid. */
export const PAYMENT_LIFECYCLE = ["CREATED", "PENDING", "SUCCESS", "FAILED", "CANCELLED", "EXPIRED", "REFUNDED"] as const;
export type PaymentLifecycle = (typeof PAYMENT_LIFECYCLE)[number];

export function normalizePaymentStatus(stored: string): PaymentLifecycle {
  if (stored === "SETTLED") return "SUCCESS";
  if (stored === "CREATED" || stored === "PENDING" || stored === "FAILED" || stored === "CANCELLED" || stored === "EXPIRED" || stored === "REFUNDED") {
    return stored;
  }
  return "PENDING";
}

export function paymentExpired(createdAt: Date, now: Date, expiryMs = PAYMENT_PENDING_EXPIRY_MS): boolean {
  return now.getTime() - createdAt.getTime() >= expiryMs;
}

export function canExpirePayment(storedStatus: string): boolean {
  return storedStatus === "PENDING";
}

export function safeProviderIdentity(input: {
  providerCustomerId?: string | null;
  payerReference?: string | null;
  paymentInstrumentFingerprint?: string | null;
}): { providerCustomerId: string | null; payerReference: string | null; paymentInstrumentFingerprint: string | null } {
  return {
    providerCustomerId: cleanIdentity(input.providerCustomerId),
    payerReference: cleanIdentity(input.payerReference),
    paymentInstrumentFingerprint: cleanIdentity(input.paymentInstrumentFingerprint),
  };
}

function cleanIdentity(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, 120);
  if (!trimmed) return null;
  if (/^\d{12,}$/.test(trimmed.replace(/[\s-]/g, ""))) return null;
  return trimmed;
}
