-- Guest auth and CRM profile fields. Does not touch wallets, bonuses, sessions, or attribution rows.

CREATE TYPE "AccountStatus" AS ENUM ('REGISTERED', 'CONTACT_VERIFIED', 'PROFILE_COMPLETE', 'VERIFICATION_REQUIRED', 'VERIFIED', 'RESTRICTED');
CREATE TYPE "SignupMethod" AS ENUM ('GOOGLE', 'PHONE', 'EMAIL', 'PASSWORD');
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'PHONE', 'EMAIL');
CREATE TYPE "OtpChannel" AS ENUM ('PHONE', 'EMAIL');

ALTER TABLE "User"
  ADD COLUMN "givenName" TEXT,
  ADD COLUMN "familyName" TEXT,
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "accountStatus" "AccountStatus" NOT NULL DEFAULT 'REGISTERED',
  ADD COLUMN "signupMethod" "SignupMethod",
  ADD COLUMN "emailVerifiedAt" TIMESTAMPTZ(3),
  ADD COLUMN "phoneVerifiedAt" TIMESTAMPTZ(3),
  ADD COLUMN "lastLoginAt" TIMESTAMPTZ(3),
  ADD COLUMN "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "marketingConsentAt" TIMESTAMPTZ(3),
  ADD COLUMN "marketingConsentSource" TEXT,
  ADD COLUMN "marketingConsentVersion" TEXT,
  ADD COLUMN "doNotEmail" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "doNotSms" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "doNotWhatsApp" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "doNotCall" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "OtpChallenge" ADD COLUMN "channel" "OtpChannel" NOT NULL DEFAULT 'PHONE';
ALTER TABLE "OtpChallenge" ADD COLUMN "email" TEXT;
ALTER TABLE "OtpChallenge" ALTER COLUMN "phone" DROP NOT NULL;
CREATE INDEX "OtpChallenge_email_createdAt_idx" ON "OtpChallenge"("email", "createdAt");

CREATE TABLE "AuthIdentity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "AuthProvider" NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "normalizedPhone" TEXT,
  "normalizedEmail" TEXT,
  "verifiedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthIdentity_provider_providerAccountId_key" ON "AuthIdentity"("provider", "providerAccountId");
CREATE UNIQUE INDEX "AuthIdentity_normalizedPhone_key" ON "AuthIdentity"("normalizedPhone");
CREATE UNIQUE INDEX "AuthIdentity_normalizedEmail_key" ON "AuthIdentity"("normalizedEmail");
CREATE INDEX "AuthIdentity_userId_idx" ON "AuthIdentity"("userId");
ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "User"
SET "signupMethod" = 'PASSWORD'
WHERE "passwordHash" IS NOT NULL AND "signupMethod" IS NULL;

UPDATE "User"
SET "phoneVerifiedAt" = "createdAt",
    "accountStatus" = 'CONTACT_VERIFIED'
WHERE "phone" IS NOT NULL AND "phoneVerifiedAt" IS NULL;

UPDATE "User"
SET "emailVerifiedAt" = "createdAt"
WHERE "email" IS NOT NULL
  AND "email" <> 'investor-demo@playerpulser.invalid'
  AND "emailVerifiedAt" IS NULL
  AND "phone" IS NULL;

INSERT INTO "AuthIdentity" ("id", "userId", "provider", "providerAccountId", "normalizedPhone", "verifiedAt", "createdAt", "updatedAt")
SELECT 'ph_' || "id", "id", 'PHONE', "phone", "phone", "createdAt", "createdAt", "updatedAt"
FROM "User"
WHERE "phone" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "AuthIdentity" ("id", "userId", "provider", "providerAccountId", "normalizedEmail", "verifiedAt", "createdAt", "updatedAt")
SELECT 'em_' || "id", "id", 'EMAIL', lower("email"), lower("email"), "createdAt", "createdAt", "updatedAt"
FROM "User"
WHERE "email" IS NOT NULL AND "email" <> 'investor-demo@playerpulser.invalid'
ON CONFLICT DO NOTHING;
