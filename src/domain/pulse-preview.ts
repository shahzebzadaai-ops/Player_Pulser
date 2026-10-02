import { createHash } from "node:crypto";
import { divRoundHalfAwayFromZero } from "./money";

/**
 * Pulse preview V2.
 * These numbers are prototype defaults. They are not approved production pricing.
 * They never change executable quotes, event basis points, or settlement.
 * Company profit, customer balances, exposure, and watchlists are not inputs.
 *
 * Earlier rows stay under pulse-preview-v1 and are not reused as the prior price.
 */

export const PULSE_PREVIEW_V1_CONFIG_VERSION = "pulse-preview-v1";
export const PULSE_PREVIEW_CONFIG_VERSION = "pulse-preview-v2";
export const PULSE_CYCLE_SECONDS = 15;
export const PULSE_RAW_MIN_BPS = 2;
export const PULSE_RAW_MAX_BPS = 25;
/** 8% of the gap back toward the anchor each cycle, in basis points. */
export const PULSE_DRIFT_MILLI = 80;
export const PULSE_DRIFT_CAP_BPS = 25;
export const PULSE_FLOOR_PAISE = 100n;

export const PULSE_STATES = ["CALM", "STEADY", "ACTIVE", "SURGE"] as const;
export type PulseState = (typeof PULSE_STATES)[number];

export const PULSE_FEED_PICTURES = ["HEALTHY_LIVE", "OFF_MATCH", "DEGRADED", "CONFLICTING", "STALE", "UNKNOWN"] as const;
export type PulseFeedPicture = (typeof PULSE_FEED_PICTURES)[number];

export const PULSE_ANCHOR_SOURCES = ["QUOTED_MID"] as const;
export type PulseAnchorSource = (typeof PULSE_ANCHOR_SOURCES)[number];

export type FairValueAnchor = {
  anchorPaise: bigint;
  source: PulseAnchorSource;
};

export const PULSE_STEP_INPUTS = [
  "seed",
  "playerId",
  "cycleId",
  "priorPreviewPaise",
  "anchorPaise",
  "feedPicture",
  "configVersion",
] as const;

/** Feed quality scales intensity only. It does not choose the sign. */
export const PULSE_FEED_SCALE_MILLI: Record<PulseFeedPicture, number> = {
  HEALTHY_LIVE: 1000,
  OFF_MATCH: 600,
  DEGRADED: 350,
  CONFLICTING: 200,
  STALE: 150,
  UNKNOWN: 150,
};

/** Maximum distance from the fair anchor, in basis points of that anchor. */
export const PULSE_DEVIATION_CAP_BPS: Record<PulseFeedPicture, number> = {
  HEALTHY_LIVE: 500,
  OFF_MATCH: 300,
  DEGRADED: 200,
  CONFLICTING: 100,
  STALE: 100,
  UNKNOWN: 100,
};

const ACTIVITY_LABEL: Record<PulseState, string> = {
  CALM: "Calm",
  STEADY: "Steady",
  ACTIVE: "Active",
  SURGE: "Surge",
};

const FEED_LABEL: Record<PulseFeedPicture, string> = {
  HEALTHY_LIVE: "Live cricket data",
  OFF_MATCH: "No live match",
  DEGRADED: "Cricket data is incomplete",
  CONFLICTING: "Cricket sources disagree",
  STALE: "Cricket data is stale",
  UNKNOWN: "Cricket data unavailable",
};

export function pulseActivityLabel(state: PulseState): string {
  return ACTIVITY_LABEL[state];
}

export function pulseFeedLabel(picture: PulseFeedPicture): string {
  return FEED_LABEL[picture];
}

export function pulseCycleId(nowMs: number, cycleSeconds = PULSE_CYCLE_SECONDS): string {
  return String(Math.floor(nowMs / (cycleSeconds * 1000)));
}

export function pulseSeedRef(seed: string): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

/**
 * V2 anchor. Later a fair-value pricing engine can return the same shape
 * with its own source. This preview reads the quoted mid only.
 */
export function quotedMidAnchor(midPricePaise: bigint): FairValueAnchor {
  if (midPricePaise <= 0n) throw new Error("Quoted mid must be positive");
  return { anchorPaise: midPricePaise, source: "QUOTED_MID" };
}

export function classifyPulseFeed(input: {
  sourceStatus: string | null;
  lastSuccessfulPollMs: number | null;
  nowMs: number;
  staleAfterSeconds: number;
  consensusConfidence: string | null;
  reconciliation: string | null;
}): PulseFeedPicture {
  if (input.consensusConfidence === "CONFLICT" || input.reconciliation === "CONFLICT") return "CONFLICTING";
  if (input.sourceStatus === "DEGRADED" || input.reconciliation === "BEHIND") return "DEGRADED";
  const pollAge = input.lastSuccessfulPollMs === null ? null : input.nowMs - input.lastSuccessfulPollMs;
  const stale = pollAge !== null && pollAge > input.staleAfterSeconds * 1000;
  if (stale || input.sourceStatus === "DOWN") return "STALE";
  if (!input.sourceStatus || input.sourceStatus === "DISABLED") return "UNKNOWN";
  if (input.sourceStatus === "HEALTHY") return "HEALTHY_LIVE";
  return "UNKNOWN";
}

export function pictureForPlayer(market: PulseFeedPicture, playerLive: boolean): PulseFeedPicture {
  if (market === "CONFLICTING" || market === "DEGRADED" || market === "STALE" || market === "UNKNOWN") return market;
  if (!playerLive) return "OFF_MATCH";
  return "HEALTHY_LIVE";
}

function pulseDigest(seed: string, playerId: string, cycleId: string, configVersion: string): Buffer {
  return createHash("sha256").update(`${seed}|${playerId}|${cycleId}|${configVersion}`).digest();
}

/** Signed raw movement in the closed range 2–25 bps. Sign is independent of feed quality. */
export function rawPulseBps(seed: string, playerId: string, cycleId: string, configVersion: string): number {
  const digest = pulseDigest(seed, playerId, cycleId, configVersion);
  const unit = digest.readUInt32BE(0) / 0xffffffff;
  const span = PULSE_RAW_MAX_BPS - PULSE_RAW_MIN_BPS;
  const magnitude = Math.min(PULSE_RAW_MAX_BPS, Math.max(PULSE_RAW_MIN_BPS, PULSE_RAW_MIN_BPS + Math.round(unit * span)));
  const sign = (digest[4] & 1) === 0 ? 1 : -1;
  return sign * magnitude;
}

export function scalePulseBps(rawBps: number, picture: PulseFeedPicture): number {
  const scaled = Math.round((Math.abs(rawBps) * PULSE_FEED_SCALE_MILLI[picture]) / 1000);
  if (rawBps < 0) return -scaled;
  return scaled;
}

export function pulseStateForBps(absBps: number): PulseState {
  if (absBps <= 5) return "CALM";
  if (absBps <= 10) return "STEADY";
  if (absBps <= 18) return "ACTIVE";
  return "SURGE";
}

/**
 * Gentle pull toward the anchor.
 * deviationBps = round((prior - anchor) / anchor * 10000)
 * drift = clamp(round(deviationBps * -0.08), -25, 25)
 * Positive drift means the preview price rises.
 */
export function anchorDriftBps(priorPreviewPaise: bigint, anchorPaise: bigint): number {
  if (anchorPaise <= 0n) throw new Error("Anchor must be positive");
  const deviationBps = divRoundHalfAwayFromZero((priorPreviewPaise - anchorPaise) * 10_000n, anchorPaise);
  const drift = divRoundHalfAwayFromZero(deviationBps * BigInt(-PULSE_DRIFT_MILLI), 1_000n);
  const capped = drift > BigInt(PULSE_DRIFT_CAP_BPS) ? BigInt(PULSE_DRIFT_CAP_BPS) : drift < BigInt(-PULSE_DRIFT_CAP_BPS) ? BigInt(-PULSE_DRIFT_CAP_BPS) : drift;
  return Number(capped);
}

export function deviationBand(anchorPaise: bigint, picture: PulseFeedPicture): { minPaise: bigint; maxPaise: bigint; capBps: number } {
  const capBps = PULSE_DEVIATION_CAP_BPS[picture];
  const gap = divRoundHalfAwayFromZero(anchorPaise * BigInt(capBps), 10_000n);
  let minPaise = anchorPaise - gap;
  if (minPaise < PULSE_FLOOR_PAISE) minPaise = PULSE_FLOOR_PAISE;
  return { minPaise, maxPaise: anchorPaise + gap, capBps };
}

export function previewDistanceBps(pricePaise: bigint, anchorPaise: bigint): number {
  if (anchorPaise <= 0n) throw new Error("Anchor must be positive");
  return Number(divRoundHalfAwayFromZero((pricePaise - anchorPaise) * 10_000n, anchorPaise));
}

export function applyPreviewMove(priorPreviewPaise: bigint, movementBps: number): bigint {
  if (priorPreviewPaise <= 0n) throw new Error("Preview price must be positive");
  const movePpm = BigInt(Math.round(movementBps * 100));
  let next = divRoundHalfAwayFromZero(priorPreviewPaise * (1_000_000n + movePpm), 1_000_000n);
  if (next < PULSE_FLOOR_PAISE) next = PULSE_FLOOR_PAISE;
  return next;
}

export type PulseStep = {
  configVersion: string;
  cycleId: string;
  playerId: string;
  seedRef: string;
  anchorPaise: bigint;
  anchorSource: PulseAnchorSource;
  priorPreviewPaise: bigint;
  nextPreviewPaise: bigint;
  state: PulseState;
  activity: string;
  intensityMilli: number;
  randomPulseBps: number;
  scaledPulseBps: number;
  anchorDriftBps: number;
  feedScaleMilli: number;
  finalMovementBps: number;
  deviationCapBps: number;
  movementBeforeBps: number;
  movementAfterBps: number;
  feedPicture: PulseFeedPicture;
  feedLabel: string;
};

export function stepPulsePreview(input: {
  seed: string;
  playerId: string;
  cycleId: string;
  priorPreviewPaise: bigint;
  anchorPaise: bigint;
  feedPicture: PulseFeedPicture;
  configVersion?: string;
  anchorSource?: PulseAnchorSource;
}): PulseStep {
  const configVersion = input.configVersion ?? PULSE_PREVIEW_CONFIG_VERSION;
  const anchorSource = input.anchorSource ?? "QUOTED_MID";
  const randomPulseBps = rawPulseBps(input.seed, input.playerId, input.cycleId, configVersion);
  const scaledPulseBps = scalePulseBps(randomPulseBps, input.feedPicture);
  const drift = anchorDriftBps(input.priorPreviewPaise, input.anchorPaise);
  const band = deviationBand(input.anchorPaise, input.feedPicture);
  const intended = scaledPulseBps + drift;
  let next = applyPreviewMove(input.priorPreviewPaise, intended);
  if (next > band.maxPaise) next = band.maxPaise;
  if (next < band.minPaise) next = band.minPaise;
  const finalMovementBps = input.priorPreviewPaise === next
    ? 0
    : Number(divRoundHalfAwayFromZero((next - input.priorPreviewPaise) * 10_000n, input.priorPreviewPaise));
  const intensityMilli = Math.round((Math.abs(scaledPulseBps) / PULSE_RAW_MAX_BPS) * 1000);
  return {
    configVersion,
    cycleId: input.cycleId,
    playerId: input.playerId,
    seedRef: pulseSeedRef(input.seed),
    anchorPaise: input.anchorPaise,
    anchorSource,
    priorPreviewPaise: input.priorPreviewPaise,
    nextPreviewPaise: next,
    state: pulseStateForBps(Math.abs(scaledPulseBps)),
    activity: pulseActivityLabel(pulseStateForBps(Math.abs(scaledPulseBps))),
    intensityMilli,
    randomPulseBps,
    scaledPulseBps,
    anchorDriftBps: drift,
    feedScaleMilli: PULSE_FEED_SCALE_MILLI[input.feedPicture],
    finalMovementBps,
    deviationCapBps: band.capBps,
    movementBeforeBps: randomPulseBps,
    movementAfterBps: finalMovementBps,
    feedPicture: input.feedPicture,
    feedLabel: pulseFeedLabel(input.feedPicture),
  };
}
