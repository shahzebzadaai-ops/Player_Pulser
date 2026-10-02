ALTER TABLE "CricketEvent" ADD COLUMN "acknowledgedAt" TIMESTAMPTZ(3),
ADD COLUMN "acknowledgedBy" TEXT;

ALTER TABLE "FeedControl" ADD COLUMN "gapSafetyPolicy" TEXT NOT NULL DEFAULT 'PAUSE_NEW_BUYS_FOR_AFFECTED_PLAYERS';

CREATE TABLE "FeedActivation" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "activatedAt" TIMESTAMPTZ(3) NOT NULL,
    "activationEventCursor" TEXT,
    "activationInnings" INTEGER,
    "activationOver" INTEGER,
    "activationBall" INTEGER,
    "activationSequence" INTEGER,
    "baselinePending" BOOLEAN NOT NULL DEFAULT false,
    "activatedBy" TEXT,
    "activationReason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedActivation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedHighWater" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "latestProviderEventId" TEXT,
    "latestInnings" INTEGER,
    "latestOver" INTEGER,
    "latestBall" INTEGER,
    "latestProviderTimestamp" TIMESTAMPTZ(3),
    "latestSequence" INTEGER,
    "lastIngestAt" TIMESTAMPTZ(3),
    "continuity" TEXT NOT NULL DEFAULT 'CONTINUOUS',
    "startedMidMatch" BOOLEAN NOT NULL DEFAULT false,
    "contextInnings" INTEGER,
    "contextOver" INTEGER,
    "contextBall" INTEGER,
    "observedSince" TIMESTAMPTZ(3),
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "possibleGapCount" INTEGER NOT NULL DEFAULT 0,
    "recoveredGapCount" INTEGER NOT NULL DEFAULT 0,
    "unresolvedGapCount" INTEGER NOT NULL DEFAULT 0,
    "parseFailureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "FeedHighWater_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchScoreSnapshot" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "innings" INTEGER NOT NULL,
    "scoreRuns" INTEGER NOT NULL,
    "wickets" INTEGER NOT NULL,
    "overs" TEXT NOT NULL,
    "strikerExternalId" TEXT,
    "nonStrikerExternalId" TEXT,
    "bowlerExternalId" TEXT,
    "status" TEXT NOT NULL,
    "providerTimestamp" TIMESTAMPTZ(3),
    "reconciliation" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "ingestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchScoreSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedIncident" (
    "id" TEXT NOT NULL,
    "matchId" TEXT,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolution" TEXT,
    "actorId" TEXT,
    CONSTRAINT "FeedIncident_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeedActivation_source_matchId_key" ON "FeedActivation"("source", "matchId");
CREATE INDEX "FeedActivation_matchId_idx" ON "FeedActivation"("matchId");
CREATE UNIQUE INDEX "FeedHighWater_source_matchId_key" ON "FeedHighWater"("source", "matchId");
CREATE INDEX "FeedHighWater_matchId_idx" ON "FeedHighWater"("matchId");
CREATE INDEX "MatchScoreSnapshot_matchId_source_ingestedAt_idx" ON "MatchScoreSnapshot"("matchId", "source", "ingestedAt");
CREATE INDEX "FeedIncident_resolvedAt_openedAt_idx" ON "FeedIncident"("resolvedAt", "openedAt");
CREATE INDEX "FeedIncident_matchId_type_idx" ON "FeedIncident"("matchId", "type");
