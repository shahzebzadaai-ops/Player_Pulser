-- Pulse preview V2 diagnostics. Earlier rows stay on their original configuration version.
ALTER TABLE "PulsePreviewCycle" ADD COLUMN "fairAnchorPaise" BIGINT;
ALTER TABLE "PulsePreviewCycle" ADD COLUMN "randomPulseBps" INTEGER;
ALTER TABLE "PulsePreviewCycle" ADD COLUMN "anchorDriftBps" INTEGER;
ALTER TABLE "PulsePreviewCycle" ADD COLUMN "feedScaleMilli" INTEGER;
ALTER TABLE "PulsePreviewCycle" ADD COLUMN "finalMovementBps" INTEGER;
ALTER TABLE "PulsePreviewCycle" ADD COLUMN "deviationCapBps" INTEGER;
