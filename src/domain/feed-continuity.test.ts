import { describe, expect, it } from "vitest";
import { activationBlockers } from "./cricket-feed";
import {
  activationChecklist,
  boundRecovery,
  canProviderEventAffectPricing,
  detectDeliveryGap,
  gapPausesNewBuys,
  latencyP95Ms,
  nextContinuity,
  reconcileSnapshot,
} from "./feed-continuity";

const eligible = {
  source: "Consensus",
  operatingMode: "ACTIVE",
  engineAllowsPricing: true,
  realSourcePricingEnabled: true,
  eventIngestedAtMs: 2_000,
  sourceActivatedAtMs: 1_000,
  globalPricingEnabledAtMs: 1_500,
  activationCursor: { innings: 1, over: 12, ball: 2 },
  baselinePending: false,
  event: { innings: 1, over: 12, ball: 3 },
  superseded: false,
  mapped: true,
  alreadyPriced: false,
  matchStatus: "LIVE",
  continuity: "CONTINUOUS",
  historicalContext: false,
  consensusConfidence: "CONFIDENCE_HIGH",
  consensusIdentityConfirmed: true,
};

describe("feed continuity", () => {
  it("detects a skipped delivery without treating a legal step or a wide as a gap", () => {
    expect(detectDeliveryGap({ innings: 1, over: 17, ball: 3 }, { innings: 1, over: 17, ball: 6 })).toBe("POSSIBLE_GAP");
    expect(detectDeliveryGap({ innings: 1, over: 17, ball: 3 }, { innings: 1, over: 17, ball: 4 })).toBe("CONTINUOUS");
    expect(detectDeliveryGap({ innings: 1, over: 17, ball: 6 }, { innings: 1, over: 18, ball: 1 })).toBe("CONTINUOUS");
    expect(detectDeliveryGap({ innings: 1, over: 17, ball: 3, eventType: "WIDE" }, { innings: 1, over: 17, ball: 3, eventType: "SINGLE" })).toBe("CONTINUOUS");
    expect(nextContinuity({ gap: true, recoveryRan: false, filled: false })).toBe("POSSIBLE_GAP");
    expect(nextContinuity({ gap: true, recoveryRan: true, filled: true })).toBe("CONTINUOUS");
    expect(nextContinuity({ gap: true, recoveryRan: true, filled: false })).toBe("UNRESOLVED_GAP");
  });

  it("keeps recovery inside a short window and refuses a full innings", () => {
    const events = [
      { innings: 1, over: 17, ball: 4 },
      { innings: 1, over: 17, ball: 3 },
      { innings: 1, over: 30, ball: 1 },
    ];
    expect(boundRecovery(events, null)).toEqual([]);
    expect(boundRecovery(events, { innings: 1, over: 17, ball: 3 }).map((event) => event.ball)).toEqual([4]);
  });

  it("prices only events after both activation boundaries", () => {
    expect(canProviderEventAffectPricing(eligible)).toBe(true);
    expect(canProviderEventAffectPricing({ ...eligible, consensusConfidence: "CONFIDENCE_MEDIUM" })).toBe(true);
    expect(canProviderEventAffectPricing({ ...eligible, consensusConfidence: "CONFIDENCE_LOW" })).toBe(false);
    expect(canProviderEventAffectPricing({ ...eligible, consensusConfidence: "CONFLICT" })).toBe(false);
    expect(canProviderEventAffectPricing({ ...eligible, consensusIdentityConfirmed: false })).toBe(false);
    expect(canProviderEventAffectPricing({ ...eligible, source: "Cricbuzz" })).toBe(false);
    expect(canProviderEventAffectPricing({ ...eligible, source: "CREX" })).toBe(false);
    expect(canProviderEventAffectPricing({ ...eligible, source: "Sportskeeda" })).toBe(false);
    expect(canProviderEventAffectPricing({ ...eligible, eventIngestedAtMs: 900 })).toBe(false);
    expect(canProviderEventAffectPricing({ ...eligible, eventIngestedAtMs: 1_200 })).toBe(false);
    expect(canProviderEventAffectPricing({ ...eligible, operatingMode: "SHADOW" })).toBe(false);
    expect(canProviderEventAffectPricing({ ...eligible, realSourcePricingEnabled: false })).toBe(false);
    expect(canProviderEventAffectPricing({ ...eligible, superseded: true })).toBe(false);
    expect(canProviderEventAffectPricing({ ...eligible, historicalContext: true })).toBe(false);
    expect(canProviderEventAffectPricing({ ...eligible, continuity: "UNRESOLVED_GAP" })).toBe(false);
    expect(canProviderEventAffectPricing({ ...eligible, event: { innings: 1, over: 12, ball: 2 } })).toBe(false);
    expect(canProviderEventAffectPricing({ ...eligible, source: "DevelopmentSimulator", realSourcePricingEnabled: false, sourceActivatedAtMs: null, globalPricingEnabledAtMs: null })).toBe(true);
  });

  it("marks a scoreboard mismatch without treating the snapshot as a price", () => {
    expect(reconcileSnapshot({
      snapshot: { runs: 143, wickets: 4, overs: "22.1" },
      highWater: { innings: 1, over: 22, ball: 1 },
      summedRuns: 125,
      summedWickets: 3,
      startedMidMatch: false,
    })).toBe("CONFLICT");
    expect(reconcileSnapshot({
      snapshot: { runs: 40, wickets: 1, overs: "30.1" },
      highWater: { innings: 1, over: 22, ball: 1 },
      summedRuns: null,
      summedWickets: null,
      startedMidMatch: true,
    })).toBe("BEHIND");
    expect(reconcileSnapshot({ snapshot: null, highWater: null, summedRuns: null, summedWickets: null, startedMidMatch: false })).toBe("UNKNOWN");
  });

  it("prepares the buy pause and shows the activation checklist", () => {
    expect(gapPausesNewBuys({ continuity: "UNRESOLVED_GAP", operatingMode: "ACTIVE", policy: "PAUSE_NEW_BUYS_FOR_AFFECTED_PLAYERS" })).toBe(true);
    expect(gapPausesNewBuys({ continuity: "UNRESOLVED_GAP", operatingMode: "SHADOW", policy: "PAUSE_NEW_BUYS_FOR_AFFECTED_PLAYERS" })).toBe(false);
    expect(latencyP95Ms([10, 20, 30, 40, 100])).toBe(100);
    expect(latencyP95Ms([10, 20])).toBeNull();
    const checklist = activationChecklist({
      imported: true,
      participatingMapped: 1,
      unresolved: 0,
      health: "HEALTHY",
      lastOutcome: "OK",
      continuity: "UNRESOLVED_GAP",
      reconciliation: "MATCHED",
      shadowEvents: 4,
      shadowStartedAtMs: 0,
      nowMs: 120_000,
      realSourcePricingEnabled: false,
    });
    expect(checklist.find((item) => item.label === "No unresolved gap")?.ok).toBe(false);
    expect(checklist.find((item) => item.label === "Shadow observation")?.detail).toMatch(/4 events over 2 min/);
    expect(checklist.find((item) => item.label === "Global real-source pricing")?.detail).toMatch(/Off/);
    expect(activationBlockers({
      matches: [{ label: "India vs Australia", participatingMapped: 1, unresolved: 0 }],
      health: "HEALTHY",
      lastOutcome: "OK",
      continuity: "UNRESOLVED_GAP",
    }).join(" ")).toMatch(/gap/i);
  });
});
