ALTER TABLE "FeedSourceState" ADD COLUMN "reliabilityScore" INTEGER NOT NULL DEFAULT 70;
ALTER TABLE "FeedSourceState" ADD COLUMN "agreementPercent" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "FeedSourceState" ADD COLUMN "gapPercent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FeedSourceState" ADD COLUMN "correctionPercent" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ConsensusEvent" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "innings" INTEGER NOT NULL,
    "overNumber" INTEGER NOT NULL,
    "ballNumber" INTEGER NOT NULL,
    "acceptedEvent" JSONB,
    "confidence" TEXT NOT NULL,
    "supportingSources" TEXT[] NOT NULL,
    "conflictingSources" TEXT[] NOT NULL,
    "sourceEventIds" TEXT[] NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsensusEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsensusEvent_matchId_createdAt_idx" ON "ConsensusEvent"("matchId", "createdAt");

ALTER TABLE "ConsensusEvent" ADD CONSTRAINT "ConsensusEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "CricketMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
