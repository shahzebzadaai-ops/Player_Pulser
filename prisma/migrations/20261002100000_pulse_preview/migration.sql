-- CreateTable
CREATE TABLE "PulsePreviewCycle" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "configVersion" TEXT NOT NULL,
    "priorPreviewPaise" BIGINT NOT NULL,
    "nextPreviewPaise" BIGINT NOT NULL,
    "state" TEXT NOT NULL,
    "intensityMilli" INTEGER NOT NULL,
    "movementBeforeBps" INTEGER NOT NULL,
    "movementAfterBps" INTEGER NOT NULL,
    "feedPicture" TEXT NOT NULL,
    "seedRef" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PulsePreviewCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerWatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerWatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PulsePreviewCycle_playerId_cycleId_configVersion_key" ON "PulsePreviewCycle"("playerId", "cycleId", "configVersion");

-- CreateIndex
CREATE INDEX "PulsePreviewCycle_playerId_createdAt_idx" ON "PulsePreviewCycle"("playerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerWatch_userId_playerId_key" ON "PlayerWatch"("userId", "playerId");

-- AddForeignKey
ALTER TABLE "PulsePreviewCycle" ADD CONSTRAINT "PulsePreviewCycle_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerWatch" ADD CONSTRAINT "PlayerWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerWatch" ADD CONSTRAINT "PlayerWatch_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
