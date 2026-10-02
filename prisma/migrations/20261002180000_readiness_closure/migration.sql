-- Shared rate limits and consent history. Existing SETTLED payments stay SETTLED.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

ALTER TABLE "Payment" ADD COLUMN "providerCustomerId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "payerReference" TEXT;
ALTER TABLE "Payment" ADD COLUMN "paymentInstrumentFingerprint" TEXT;

ALTER TABLE "PolicyAcceptance" ADD COLUMN "policyType" TEXT;
ALTER TABLE "PolicyAcceptance" ADD COLUMN "version" TEXT;
CREATE INDEX "PolicyAcceptance_userId_policyType_acceptedAt_idx" ON "PolicyAcceptance"("userId", "policyType", "acceptedAt");

ALTER TABLE "PaymentGateway" ADD COLUMN "lastError" TEXT;

CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RateLimitBucket_action_subject_windowStart_key" ON "RateLimitBucket"("action", "subject", "windowStart");
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
