ALTER TABLE "CricketEvent" ADD COLUMN "receivedAt" TIMESTAMPTZ(3);

ALTER TABLE "FeedHighWater" ADD COLUMN "recoveryAttemptCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "FeedGapRecord" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "previousInnings" INTEGER NOT NULL,
    "previousOver" INTEGER NOT NULL,
    "previousBall" INTEGER NOT NULL,
    "previousProviderEventId" TEXT,
    "previousSequence" INTEGER,
    "nextInnings" INTEGER NOT NULL,
    "nextOver" INTEGER NOT NULL,
    "nextBall" INTEGER NOT NULL,
    "nextProviderEventId" TEXT,
    "nextSequence" INTEGER,
    "slotSpan" INTEGER NOT NULL,
    "recoveryResult" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "FeedGapRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedUnclassifiedEvent" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "innings" INTEGER NOT NULL,
    "over" INTEGER NOT NULL,
    "ball" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "providerCode" TEXT NOT NULL,
    "rawDescription" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "sourceTimestamp" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedUnclassifiedEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedReconciliationNote" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "expectedRuns" INTEGER,
    "expectedWickets" INTEGER,
    "providerRuns" INTEGER NOT NULL,
    "providerWickets" INTEGER NOT NULL,
    "providerOvers" TEXT NOT NULL,
    "lastKnownEvent" TEXT,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "FeedReconciliationNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShadowMatchSignoff" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "validatedBy" TEXT,
    "validatedAt" TIMESTAMPTZ(3),
    "validationReason" TEXT,
    "summaryFrozenAt" TIMESTAMPTZ(3),
    "summary" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ShadowMatchSignoff_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedGapRecord_matchId_source_createdAt_idx" ON "FeedGapRecord"("matchId", "source", "createdAt");
CREATE UNIQUE INDEX "FeedUnclassifiedEvent_source_sourceEventId_key" ON "FeedUnclassifiedEvent"("source", "sourceEventId");
CREATE INDEX "FeedUnclassifiedEvent_matchId_source_idx" ON "FeedUnclassifiedEvent"("matchId", "source");
CREATE INDEX "FeedReconciliationNote_matchId_source_observedAt_idx" ON "FeedReconciliationNote"("matchId", "source", "observedAt");
CREATE UNIQUE INDEX "ShadowMatchSignoff_matchId_source_key" ON "ShadowMatchSignoff"("matchId", "source");
CREATE INDEX "ShadowMatchSignoff_matchId_idx" ON "ShadowMatchSignoff"("matchId");
