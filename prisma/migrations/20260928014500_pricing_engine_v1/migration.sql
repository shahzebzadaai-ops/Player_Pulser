-- Pricing engine v1. Existing ticks, trades, and ledger rows are left in place.
-- New explanation columns are nullable so older ticks stay valid.

ALTER TABLE "Player" ADD COLUMN "basePricePaise" BIGINT;
ALTER TABLE "Player" ADD COLUMN "midPricePaise" BIGINT;
ALTER TABLE "Player" ADD COLUMN "matchAnchorPaise" BIGINT;
ALTER TABLE "Player" ADD COLUMN "performanceMatchBps" INTEGER NOT NULL DEFAULT 0;

UPDATE "Player"
SET "basePricePaise" = "referenceMidPaise",
    "midPricePaise" = "referenceMidPaise",
    "matchAnchorPaise" = "referenceMidPaise"
WHERE "basePricePaise" IS NULL;

ALTER TABLE "Player" ALTER COLUMN "basePricePaise" SET NOT NULL;
ALTER TABLE "Player" ALTER COLUMN "midPricePaise" SET NOT NULL;
ALTER TABLE "Player" ALTER COLUMN "matchAnchorPaise" SET NOT NULL;

ALTER TABLE "PriceTick" ADD COLUMN "contextMultiplier" DOUBLE PRECISION,
ADD COLUMN "eventType" TEXT,
ADD COLUMN "eventId" TEXT,
ADD COLUMN "wasClamped" BOOLEAN,
ADD COLUMN "clampReason" TEXT;

ALTER TABLE "MatchEvent" ADD COLUMN "context" TEXT NOT NULL DEFAULT 'NORMAL',
ADD COLUMN "contextMultiplier" DOUBLE PRECISION,
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "MatchEvent_idempotencyKey_key" ON "MatchEvent"("idempotencyKey");

CREATE TABLE "PlayerNewsEvent" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "severity" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "source" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3),
    "createdBy" TEXT,
    "sourceAgent" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerNewsEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerNewsEvent_idempotencyKey_key" ON "PlayerNewsEvent"("idempotencyKey");
CREATE INDEX "PlayerNewsEvent_playerId_createdAt_idx" ON "PlayerNewsEvent"("playerId", "createdAt");
ALTER TABLE "PlayerNewsEvent" ADD CONSTRAINT "PlayerNewsEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PriceApplication" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "tickId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PriceApplication_eventKey_key" ON "PriceApplication"("eventKey");
CREATE INDEX "PriceApplication_playerId_createdAt_idx" ON "PriceApplication"("playerId", "createdAt");

UPDATE "AppSetting" SET value = '30'::jsonb WHERE key = 'quote.ttlSeconds' AND value = '15'::jsonb;
