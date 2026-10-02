-- Growth funnel records. Existing bonus rows stay GRANTED and ACTIVE.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "BonusStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
ALTER TYPE "BonusStatus" ADD VALUE IF NOT EXISTS 'NOT_ELIGIBLE';

ALTER TABLE "OtpChallenge" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BonusGrant" ADD COLUMN "eligibility" TEXT NOT NULL DEFAULT 'GRANTED';
ALTER TABLE "BonusGrant" ADD COLUMN "eligibilityReason" TEXT;

CREATE TABLE "PolicyAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "privacyVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "PolicyAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AbuseFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AbuseFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentGateway" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "supportedMethods" JSONB NOT NULL,
    "asset" TEXT,
    "network" TEXT,
    "depositEnabled" BOOLEAN NOT NULL DEFAULT false,
    "withdrawalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "minimumDepositPaise" BIGINT,
    "maximumDepositPaise" BIGINT,
    "minimumWithdrawalPaise" BIGINT,
    "maximumWithdrawalPaise" BIGINT,
    "confirmationsRequired" INTEGER,
    "configRef" TEXT,
    "health" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastSuccessAt" TIMESTAMPTZ(3),
    "lastWebhookAt" TIMESTAMPTZ(3),
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PaymentGateway_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PolicyAcceptance_userId_acceptedAt_idx" ON "PolicyAcceptance"("userId", "acceptedAt");
CREATE INDEX "AbuseFlag_userId_createdAt_idx" ON "AbuseFlag"("userId", "createdAt");
CREATE UNIQUE INDEX "PaymentGateway_category_providerKey_key" ON "PaymentGateway"("category", "providerKey");

ALTER TABLE "PolicyAcceptance" ADD CONSTRAINT "PolicyAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AbuseFlag" ADD CONSTRAINT "AbuseFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
