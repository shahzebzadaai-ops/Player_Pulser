-- Normalized cricket feed. Pricing rules, trades, and ledger rows are unchanged.

CREATE TABLE "CricketMatch" (
    "id" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "venue" TEXT NOT NULL DEFAULT '',
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "innings" INTEGER,
    "overLabel" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "CricketMatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CricketMatch_status_scheduledAt_idx" ON "CricketMatch"("status", "scheduledAt");

CREATE TABLE "CricketMatchExternalId" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    CONSTRAINT "CricketMatchExternalId_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CricketMatchExternalId_source_externalId_key" ON "CricketMatchExternalId"("source", "externalId");
CREATE INDEX "CricketMatchExternalId_matchId_idx" ON "CricketMatchExternalId"("matchId");
ALTER TABLE "CricketMatchExternalId" ADD CONSTRAINT "CricketMatchExternalId_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "CricketMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PlayerFeedMapping" (
    "id" TEXT NOT NULL,
    "matchId" TEXT,
    "internalPlayerId" TEXT,
    "source" TEXT NOT NULL,
    "externalPlayerId" TEXT NOT NULL,
    "externalPlayerName" TEXT NOT NULL,
    "mappingStatus" TEXT NOT NULL DEFAULT 'UNMAPPED',
    "lastVerifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PlayerFeedMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerFeedMapping_source_externalPlayerId_key" ON "PlayerFeedMapping"("source", "externalPlayerId");
CREATE INDEX "PlayerFeedMapping_mappingStatus_idx" ON "PlayerFeedMapping"("mappingStatus");
CREATE INDEX "PlayerFeedMapping_matchId_idx" ON "PlayerFeedMapping"("matchId");

CREATE TABLE "CricketEvent" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "innings" INTEGER NOT NULL,
    "over" INTEGER NOT NULL,
    "ball" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "eventType" TEXT NOT NULL,
    "battingPlayerId" TEXT,
    "bowlingPlayerId" TEXT,
    "fielderPlayerIds" TEXT[] NOT NULL,
    "runsBatter" INTEGER NOT NULL DEFAULT 0,
    "runsExtras" INTEGER NOT NULL DEFAULT 0,
    "runsTotal" INTEGER NOT NULL DEFAULT 0,
    "wicketType" TEXT,
    "isBoundary" BOOLEAN NOT NULL DEFAULT false,
    "isSix" BOOLEAN NOT NULL DEFAULT false,
    "isFour" BOOLEAN NOT NULL DEFAULT false,
    "rawDescription" TEXT,
    "normalizedDescription" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceEventId" TEXT,
    "sourceTimestamp" TIMESTAMPTZ(3),
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "ingestionKey" TEXT NOT NULL,
    "pricingKeys" TEXT[] NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CricketEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CricketEvent_ingestionKey_key" ON "CricketEvent"("ingestionKey");
CREATE INDEX "CricketEvent_matchId_createdAt_idx" ON "CricketEvent"("matchId", "createdAt");
CREATE INDEX "CricketEvent_battingPlayerId_createdAt_idx" ON "CricketEvent"("battingPlayerId", "createdAt");
ALTER TABLE "CricketEvent" ADD CONSTRAINT "CricketEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "CricketMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FeedSourceState" (
    "source" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL,
    "lastSuccessfulPoll" TIMESTAMPTZ(3),
    "lastEventAt" TIMESTAMPTZ(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "latencyTotalMs" INTEGER NOT NULL DEFAULT 0,
    "latencySamples" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DISABLED',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "FeedSourceState_pkey" PRIMARY KEY ("source")
);

CREATE TABLE "FeedControl" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "activeSource" TEXT,
    "pollIntervalSeconds" INTEGER NOT NULL DEFAULT 15,
    "lastPolledAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "FeedControl_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedFailover" (
    "id" TEXT NOT NULL,
    "oldSource" TEXT,
    "newSource" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedFailover_pkey" PRIMARY KEY ("id")
);

INSERT INTO "FeedSourceState" ("source", "enabled", "priority", "status", "updatedAt") VALUES
    ('DevelopmentSimulator', true, 1, 'HEALTHY', CURRENT_TIMESTAMP),
    ('CREX', false, 2, 'DISABLED', CURRENT_TIMESTAMP),
    ('Cricbuzz', false, 3, 'DISABLED', CURRENT_TIMESTAMP),
    ('Sportskeeda', false, 4, 'DISABLED', CURRENT_TIMESTAMP),
    ('PaidProvider', false, 5, 'DISABLED', CURRENT_TIMESTAMP);

INSERT INTO "FeedControl" ("id", "activeSource", "pollIntervalSeconds", "updatedAt")
VALUES ('default', 'DevelopmentSimulator', 15, CURRENT_TIMESTAMP);
