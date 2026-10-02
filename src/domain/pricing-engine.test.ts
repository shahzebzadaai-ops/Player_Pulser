import { describe, expect, it } from "vitest";
import { quoteFromMid } from "./spread";
import { priceChangeNeedsConfirmation } from "./rules";
import { exposureFromLots } from "./risk";
import {
  claimEvent,
  clampPerformanceRunning,
  contextMultiplier,
  demandContribution,
  DEFAULT_ENGINE_LIMITS,
  explainMovement,
  fairValue,
  fairValueIgnoringRisk,
  gateContributions,
  moveMidPaise,
  newsContribution,
  performanceContribution,
  quoteLifetimeSeconds,
  resolveEngineMode,
} from "./pricing-engine";

const limits = DEFAULT_ENGINE_LIMITS;

describe("performance events", () => {
  it("increases the mid after a six", () => {
    const event = performanceContribution("SIX", "NORMAL");
    expect(event.bps).toBe(30);
    expect(event.multiplier).toBe(1);
    const next = fairValue({
      midPaise: 10_000n,
      anchorPaise: 10_000n,
      performanceBps: event.bps,
      demandBps: 0,
      newsBps: 0,
      circuitBreakerBps: limits.circuitBreakerBps,
    });
    expect(next.midPaise).toBe(10_030n);
    expect(next.wasClamped).toBe(false);
  });

  it("decreases the batter after a wicket and increases the bowler after a wicket", () => {
    expect(performanceContribution("BATTER_WICKET", "NORMAL").bps).toBe(-80);
    expect(performanceContribution("BOWLER_WICKET", "NORMAL").bps).toBe(80);
    const batter = fairValue({
      midPaise: 10_000n,
      anchorPaise: 10_000n,
      performanceBps: -80,
      demandBps: 0,
      newsBps: 0,
      circuitBreakerBps: limits.circuitBreakerBps,
    });
    const bowler = fairValue({
      midPaise: 10_000n,
      anchorPaise: 10_000n,
      performanceBps: 80,
      demandBps: 0,
      newsBps: 0,
      circuitBreakerBps: limits.circuitBreakerBps,
    });
    expect(batter.midPaise).toBe(9_920n);
    expect(bowler.midPaise).toBe(10_080n);
  });

  it("applies the context multiplier only through the event rule", () => {
    expect(contextMultiplier("HIGH_PRESSURE")).toBe(1.5);
    expect(contextMultiplier("MATCH_DEFINING")).toBe(2);
    expect(contextMultiplier("IMPORTANT")).toBe(1.25);
    const pressured = performanceContribution("SIX", "HIGH_PRESSURE");
    expect(pressured.bps).toBe(45);
    expect(pressured.multiplier).toBe(1.5);
    expect(explainMovement([{ performanceEvent: "SIX", context: "HIGH_PRESSURE", demandBps: 12 }])).toEqual([
      "Six in a high-pressure phase",
      "Positive buying activity",
    ]);
  });

  it("clamps performance for the match at plus or minus 12 percent", () => {
    const capped = clampPerformanceRunning(1_150, 100, limits.performanceMatchCapBps);
    expect(capped.appliedBps).toBe(50);
    expect(capped.nextRunningBps).toBe(1_200);
    expect(capped.clamped).toBe(true);
    const down = clampPerformanceRunning(-1_150, -80, limits.performanceMatchCapBps);
    expect(down.appliedBps).toBe(-50);
    expect(down.nextRunningBps).toBe(-1_200);
  });
});

describe("caps, demand, and news", () => {
  it("clamps the mid to the 18 percent circuit around the anchor", () => {
    const moved = fairValue({
      midPaise: 11_700n,
      anchorPaise: 10_000n,
      performanceBps: 0,
      demandBps: 0,
      newsBps: 500,
      circuitBreakerBps: limits.circuitBreakerBps,
    });
    expect(moved.midPaise).toBe(11_800n);
    expect(moved.wasClamped).toBe(true);
    expect(moved.clampReason).toBe("circuit");
    expect(explainMovement([{ wasClamped: true }])).toEqual(["Move clamped to the price limit"]);
  });

  it("turns completed buy and sell volume into a capped demand move", () => {
    const balanced = demandContribution({
      buyVolumePaise: 300n,
      sellVolumePaise: 100n,
      tradeCount: 2,
      minTrades: limits.demandMinTrades,
      maxBps: limits.demandMaxBps,
      dayContributionBps: 0,
      dayCapBps: limits.demandDayCapBps,
    });
    expect(balanced.imbalance).toBeCloseTo(0.5);
    expect(balanced.bps).toBe(13);
    const oneTrade = demandContribution({
      buyVolumePaise: 1_000_000n,
      sellVolumePaise: 0n,
      tradeCount: 1,
      minTrades: 2,
      maxBps: 25,
      dayContributionBps: 0,
      dayCapBps: 200,
    });
    expect(oneTrade.bps).toBe(0);
    const day = demandContribution({
      buyVolumePaise: 1_000n,
      sellVolumePaise: 0n,
      tradeCount: 4,
      minTrades: 2,
      maxBps: 25,
      dayContributionBps: 190,
      dayCapBps: 200,
    });
    expect(day.bps).toBe(10);
    expect(day.clamped).toBe(true);
  });

  it("ignores unverified news and applies verified news inside the event cap", () => {
    const hidden = newsContribution({
      category: "INJURY",
      severity: 5,
      direction: "NEGATIVE",
      confidence: 100,
      verified: false,
      enabled: true,
      capBps: limits.newsEventCapBps,
    });
    expect(hidden.bps).toBe(0);
    const injury = newsContribution({
      category: "INJURY",
      severity: 5,
      direction: "NEGATIVE",
      confidence: 100,
      verified: true,
      enabled: true,
      capBps: limits.newsEventCapBps,
    });
    expect(injury.bps).toBe(-500);
    const omitted = newsContribution({
      category: "NOT_SELECTED",
      severity: 1,
      direction: "NEGATIVE",
      confidence: 100,
      verified: true,
      enabled: true,
      capBps: 500,
    });
    const severe = newsContribution({
      category: "NOT_SELECTED",
      severity: 5,
      direction: "NEGATIVE",
      confidence: 100,
      verified: true,
      enabled: true,
      capBps: 500,
    });
    expect(omitted.bps).toBe(-100);
    expect(severe.bps).toBe(-250);
  });

  it("zeroes a contribution when its feature flag is off", () => {
    expect(newsContribution({
      category: "INJURY",
      severity: 5,
      direction: "NEGATIVE",
      confidence: 100,
      verified: true,
      enabled: false,
      capBps: 500,
    }).bps).toBe(0);
    const priced = fairValue({
      midPaise: 10_000n,
      anchorPaise: 10_000n,
      performanceBps: 30,
      demandBps: 0,
      newsBps: 0,
      circuitBreakerBps: 1800,
    });
    const gated = gateContributions(
      { performanceBps: 30, demandBps: 13, newsBps: -100 },
      { demandPriceMovementEnabled: false, newsPriceMovementEnabled: false },
    );
    expect(gated).toEqual({ performanceBps: 30, demandBps: 0, newsBps: 0 });
    expect(priced.performanceBps).toBe(30);
  });
});

describe("quotes, idempotency, mode, and risk", () => {
  it("uses a 30 second quote off a live match and an 8 second quote during one", () => {
    expect(quoteLifetimeSeconds(false, limits.quoteTtlSeconds, limits.quoteTtlLiveSeconds)).toBe(30);
    expect(quoteLifetimeSeconds(true, limits.quoteTtlSeconds, limits.quoteTtlLiveSeconds)).toBe(8);
  });

  it("keeps the normal and live spreads on integer paise", () => {
    const normal = quoteFromMid(8_040n, 10_000);
    const live = quoteFromMid(8_040n, 12_500);
    expect(normal.buyPaise).toBe(8_080n);
    expect(normal.sellPaise).toBe(8_000n);
    expect(live.buyPaise).toBe(8_090n);
    expect(live.sellPaise).toBe(7_990n);
    expect(moveMidPaise(5n, 1_000)).toBe(6n);
  });

  it("still requires confirmation when the seen mid has moved", () => {
    expect(priceChangeNeedsConfirmation(10_000n, 10_040n, 50)).toBe(false);
    expect(priceChangeNeedsConfirmation(10_000n, 10_050n, 50)).toBe(true);
  });

  it("does not apply the same event key twice", () => {
    const first = claimEvent(new Set(), "match:event-1");
    expect(first.fresh).toBe(true);
    const second = claimEvent(first.keys, "match:event-1");
    expect(second.fresh).toBe(false);
    expect(second.keys.size).toBe(1);
  });

  it("selects the engine from an explicit setting, not from NODE_ENV", () => {
    expect(resolveEngineMode("EVENT_DRIVEN", undefined)).toBe("EVENT_DRIVEN");
    expect(resolveEngineMode("SIMULATION", "production")).toBe("SIMULATION");
    expect(resolveEngineMode(undefined, undefined)).toBe("SIMULATION");
    expect(resolveEngineMode("SIMULATION", "EVENT_DRIVEN")).toBe("EVENT_DRIVEN");
  });

  it("keeps the same fair value when exposure is present", () => {
    const input = {
      midPaise: 10_000n,
      anchorPaise: 10_000n,
      performanceBps: 30,
      demandBps: 13,
      newsBps: -100,
      circuitBreakerBps: 1800,
    };
    const exposure = exposureFromLots([
      { userId: "u1", playerId: "p1", quantity: 40, midPaise: 10_000n },
      { userId: "u2", playerId: "p1", quantity: 10, midPaise: 10_000n },
    ]);
    expect(exposure.totalPulsersOutstanding).toBe(50);
    expect(exposure.openPlatformLiabilityPaise).toBe(500_000n);
    expect(fairValueIgnoringRisk(input, exposure)).toEqual(fairValue(input));
  });
});
