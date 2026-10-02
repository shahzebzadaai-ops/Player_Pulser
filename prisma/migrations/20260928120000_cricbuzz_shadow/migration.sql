-- Cricbuzz shadow source: operating mode, discovery, and bounded snapshots.
-- Pricing formulas, wallet, ledger, quotes, and the simulator are unchanged.

ALTER TABLE "FeedSourceState" ADD COLUMN "operatingMode" TEXT NOT NULL DEFAULT 'DISABLED';
ALTER TABLE "FeedSourceState" ADD COLUMN "lastPollOutcome" TEXT;
ALTER TABLE "FeedSourceState" ADD COLUMN "lastAttemptAt" TIMESTAMPTZ(3);

UPDATE "FeedSourceState"
SET "operatingMode" = 'ACTIVE'
WHERE "source" = 'DevelopmentSimulator';

UPDATE "FeedSourceState"
SET "operatingMode" = 'SHADOW',
    "enabled" = true,
    "status" = CASE WHEN "status" = 'DISABLED' THEN 'HEALTHY' ELSE "status" END
WHERE "source" = 'Cricbuzz';

CREATE TABLE "DiscoveredCricketMatch" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "venue" TEXT NOT NULL DEFAULT '',
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "providerStatus" TEXT NOT NULL DEFAULT '',
    "matchFormat" TEXT NOT NULL DEFAULT '',
    "indiaInternational" BOOLEAN NOT NULL DEFAULT false,
    "importedMatchId" TEXT,
    "discoveredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DiscoveredCricketMatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscoveredCricketMatch_source_externalId_key" ON "DiscoveredCricketMatch"("source", "externalId");
CREATE INDEX "DiscoveredCricketMatch_indiaInternational_scheduledAt_idx" ON "DiscoveredCricketMatch"("indiaInternational", "scheduledAt");

CREATE TABLE "FeedSnapshot" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalMatchId" TEXT,
    "kind" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedSnapshot_source_createdAt_idx" ON "FeedSnapshot"("source", "createdAt");
