-- Feed closure: corrections, participation, poll latency, and risk-control backfill.
-- Pricing rules, trades, and ledger rows are unchanged.

ALTER TABLE "CricketEvent" ADD COLUMN "correctionState" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "CricketEvent" ADD COLUMN "correctsEventId" TEXT;
ALTER TABLE "CricketEvent" ADD COLUMN "supersededById" TEXT;

ALTER TABLE "PlayerFeedMapping" ADD COLUMN "participationStatus" TEXT NOT NULL DEFAULT 'SQUAD';

ALTER TABLE "FeedSourceState" ADD COLUMN "lastPollLatencyMs" INTEGER NOT NULL DEFAULT 0;

INSERT INTO "PlayerRiskControl" ("playerId", "manualMode", "lastState", "updatedAt")
SELECT p."id", 'AUTO', 'NORMAL', CURRENT_TIMESTAMP
FROM "Player" p
WHERE NOT EXISTS (
  SELECT 1 FROM "PlayerRiskControl" c WHERE c."playerId" = p."id"
);
