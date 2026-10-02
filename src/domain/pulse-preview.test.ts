import { describe, expect, it } from "vitest";
import { PERFORMANCE_RULES } from "./pricing-engine";
import { DEFAULT_APP_SETTINGS } from "./settings";
import { defaultFeatureFlags } from "./features";
import {
  PULSE_DEVIATION_CAP_BPS,
  PULSE_FEED_SCALE_MILLI,
  PULSE_PREVIEW_CONFIG_VERSION,
  PULSE_PREVIEW_V1_CONFIG_VERSION,
  PULSE_RAW_MAX_BPS,
  PULSE_STEP_INPUTS,
  anchorDriftBps,
  classifyPulseFeed,
  deviationBand,
  pictureForPlayer,
  pulseCycleId,
  quotedMidAnchor,
  rawPulseBps,
  scalePulseBps,
  stepPulsePreview,
} from "./pulse-preview";

const step = {
  seed: "review-seed",
  playerId: "player-1",
  cycleId: "100",
  priorPreviewPaise: 1_775n,
  anchorPaise: 1_775n,
  feedPicture: "HEALTHY_LIVE" as const,
};

describe("pulse preview v2", () => {
  it("repeats the same preview for the same seed, configuration, and cycle", () => {
    const first = stepPulsePreview(step);
    const second = stepPulsePreview(step);
    expect(second).toEqual(first);
    expect(first.seedRef).not.toBe(step.seed);
    expect(first.configVersion).toBe("pulse-preview-v2");
    expect(first.configVersion).not.toBe(PULSE_PREVIEW_V1_CONFIG_VERSION);
  });

  it("shares one cycle identifier for viewers in the same window", () => {
    const start = 1_700_000_000_000 - (1_700_000_000_000 % 15_000);
    expect(pulseCycleId(start)).toBe(pulseCycleId(start + 14_000));
    expect(pulseCycleId(start + 15_000)).not.toBe(pulseCycleId(start));
  });

  it("starts the first preview from the quoted mid and keeps raw movement within 25 bps", () => {
    const anchor = quotedMidAnchor(1_775n);
    expect(anchor.source).toBe("QUOTED_MID");
    expect(anchor.anchorPaise).toBe(1_775n);
    const preview = stepPulsePreview({ ...step, priorPreviewPaise: anchor.anchorPaise, anchorPaise: anchor.anchorPaise });
    expect(preview.priorPreviewPaise).toBe(1_775n);
    expect(preview.anchorPaise).toBe(1_775n);
    expect(Math.abs(preview.randomPulseBps)).toBeGreaterThanOrEqual(2);
    expect(Math.abs(preview.randomPulseBps)).toBeLessThanOrEqual(PULSE_RAW_MAX_BPS);
    const gap = preview.nextPreviewPaise > preview.anchorPaise
      ? preview.nextPreviewPaise - preview.anchorPaise
      : preview.anchorPaise - preview.nextPreviewPaise;
    expect(gap * 10_000n / preview.anchorPaise).toBeLessThanOrEqual(BigInt(PULSE_RAW_MAX_BPS));
  });

  it("scales intensity without changing direction", () => {
    expect(scalePulseBps(25, "HEALTHY_LIVE")).toBe(25);
    expect(scalePulseBps(25, "OFF_MATCH")).toBe(Math.round(25 * (PULSE_FEED_SCALE_MILLI.OFF_MATCH / 1000)));
    expect(scalePulseBps(25, "DEGRADED")).toBe(Math.round(25 * (PULSE_FEED_SCALE_MILLI.DEGRADED / 1000)));
    expect(scalePulseBps(25, "CONFLICTING")).toBe(Math.round(25 * (PULSE_FEED_SCALE_MILLI.CONFLICTING / 1000)));
    expect(scalePulseBps(25, "STALE")).toBe(Math.round(25 * (PULSE_FEED_SCALE_MILLI.STALE / 1000)));
    expect(scalePulseBps(25, "UNKNOWN")).toBe(scalePulseBps(25, "STALE"));
    expect(scalePulseBps(-25, "DEGRADED")).toBe(-Math.round(25 * (PULSE_FEED_SCALE_MILLI.DEGRADED / 1000)));
    expect(Math.sign(scalePulseBps(-25, "STALE"))).toBe(-1);
    const healthy = stepPulsePreview(step);
    const stale = stepPulsePreview({ ...step, feedPicture: "STALE" });
    expect(healthy.randomPulseBps).toBe(stale.randomPulseBps);
    expect(Math.abs(healthy.scaledPulseBps)).toBeGreaterThan(Math.abs(stale.scaledPulseBps));
    expect(healthy.anchorDriftBps).toBe(stale.anchorDriftBps);
  });

  it("keeps the preview inside the deviation band and pulls back toward the anchor", () => {
    const high = anchorDriftBps(10_200n, 10_000n);
    const low = anchorDriftBps(9_800n, 10_000n);
    const near = anchorDriftBps(10_050n, 10_000n);
    expect(high).toBeLessThan(0);
    expect(low).toBeGreaterThan(0);
    expect(Math.abs(high)).toBeGreaterThan(Math.abs(near));
    const band = deviationBand(10_000n, "HEALTHY_LIVE");
    expect(band.capBps).toBe(PULSE_DEVIATION_CAP_BPS.HEALTHY_LIVE);
    const outside = stepPulsePreview({
      ...step,
      priorPreviewPaise: 11_000n,
      anchorPaise: 10_000n,
      feedPicture: "HEALTHY_LIVE",
    });
    expect(outside.anchorDriftBps).toBeLessThan(0);
    expect(outside.nextPreviewPaise).toBeLessThanOrEqual(band.maxPaise);
    expect(outside.nextPreviewPaise).toBeGreaterThanOrEqual(band.minPaise);
    const tight = deviationBand(10_000n, "STALE");
    const atCap = stepPulsePreview({
      ...step,
      priorPreviewPaise: tight.maxPaise,
      anchorPaise: 10_000n,
      feedPicture: "STALE",
    });
    expect(atCap.nextPreviewPaise).toBeLessThanOrEqual(tight.maxPaise);
    expect(atCap.nextPreviewPaise).toBeGreaterThanOrEqual(tight.minPaise);
  });

  it("does not accept platform, customer, or watchlist data as movement inputs", () => {
    const forbidden = ["pnl", "profit", "wallet", "balance", "exposure", "withdrawal", "deposit", "spending", "watch"];
    for (const name of PULSE_STEP_INPUTS) {
      expect(forbidden.some((word) => name.toLowerCase().includes(word))).toBe(false);
    }
    const withFinancialNoise = { ...step, platformPnlPaise: 50_000n, cashPaise: 1n, exposurePaise: 9n, watching: true };
    expect(stepPulsePreview(withFinancialNoise)).toEqual(stepPulsePreview(step));
    expect(rawPulseBps(step.seed, step.playerId, step.cycleId, PULSE_PREVIEW_CONFIG_VERSION)).toBe(stepPulsePreview(step).randomPulseBps);
  });

  it("still classifies feed pictures without treating a failure as a cricket event", () => {
    expect(classifyPulseFeed({
      sourceStatus: "DEGRADED",
      lastSuccessfulPollMs: Date.now(),
      nowMs: Date.now(),
      staleAfterSeconds: 30,
      consensusConfidence: null,
      reconciliation: null,
    })).toBe("DEGRADED");
    expect(classifyPulseFeed({
      sourceStatus: "HEALTHY",
      lastSuccessfulPollMs: Date.now(),
      nowMs: Date.now(),
      staleAfterSeconds: 30,
      consensusConfidence: "CONFLICT",
      reconciliation: "MATCHED",
    })).toBe("CONFLICTING");
    expect(pictureForPlayer("HEALTHY_LIVE", false)).toBe("OFF_MATCH");
    expect(pictureForPlayer("CONFLICTING", true)).toBe("CONFLICTING");
  });

  it("leaves approved pricing mode, event basis points, and the preview switch defaults in place", () => {
    expect(DEFAULT_APP_SETTINGS.engineMode).toBe("SIMULATION");
    expect(DEFAULT_APP_SETTINGS.realSourcePricingEnabled).toBe(false);
    expect(PERFORMANCE_RULES.SIX.bps).toBe(30);
    expect(PERFORMANCE_RULES.BATTER_WICKET.bps).toBe(-80);
    expect(PERFORMANCE_RULES.BOWLER_WICKET.bps).toBe(80);
    expect(defaultFeatureFlags().pulsePreviewEnabled).toBe(false);
  });
});
