-- Explain new simulated ticks. Existing rows keep their original values.
ALTER TABLE "PriceTick" ADD COLUMN "previousMidPaise" BIGINT,
ADD COLUMN "performanceBps" DOUBLE PRECISION,
ADD COLUMN "demandBps" DOUBLE PRECISION,
ADD COLUMN "newsBps" DOUBLE PRECISION,
ADD COLUMN "reason" TEXT;
