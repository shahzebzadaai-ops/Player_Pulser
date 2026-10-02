-- Risk controls. Existing trades, ticks, and ledger rows are unchanged.

CREATE TABLE "PlayerRiskControl" (
    "playerId" TEXT NOT NULL,
    "manualMode" TEXT NOT NULL DEFAULT 'AUTO',
    "lastState" TEXT NOT NULL DEFAULT 'NORMAL',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PlayerRiskControl_pkey" PRIMARY KEY ("playerId")
);

ALTER TABLE "PlayerRiskControl" ADD CONSTRAINT "PlayerRiskControl_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RiskStateChange" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "oldState" TEXT NOT NULL,
    "newState" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "metricsSnapshot" JSONB NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskStateChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RiskStateChange_playerId_createdAt_idx" ON "RiskStateChange"("playerId", "createdAt");
ALTER TABLE "RiskStateChange" ADD CONSTRAINT "RiskStateChange_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
