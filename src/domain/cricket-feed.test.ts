import { describe, expect, it } from "vitest";
import { hasPermission } from "./permissions";
import { requireReason } from "@/server/audit";
import { PERFORMANCE_RULES } from "./pricing-engine";
import { directSimulatedPricingEnabled, engineModeSummary, feedPricingEnabled } from "./pricing-engine";
import {
  activationBlockers,
  alreadyPriced,
  chooseActiveSource,
  correctionIngestionKey,
  deliveryChanged,
  DevelopmentSimulator,
  eventFreshnessSeconds,
  ingestLatencyMs,
  ingestionKey,
  latencyP50Ms,
  mayApplyFeedPricing,
  nextPollDelayMs,
  nextSimulatorDelivery,
  nextSourceHealth,
  normalizeCrexBall,
  participationJoinsLive,
  planPlayerLiveTransition,
  pollCountsAsFailure,
  pricingActions,
  pricingKey,
  suggestPlayerMatch,
  wouldPriceAs,
} from "./cricket-feed";

const ball = {
  matchId: "match-1",
  innings: 1,
  over: 3,
  ball: 4,
  sequence: 1,
  playerIdentity: "virat",
};

describe("cricket feed normalization", () => {
  it("turns a provider ball into a normalized event without a price", () => {
    const event = normalizeCrexBall("match-1", {
      mid: "crex-match",
      inn: 1,
      ov: 3,
      bl: 4,
      code: "4",
      batsman: "ext-virat",
      bowler: "ext-bumrah",
      eid: "crex-88",
      ts: "2026-09-28T14:12:11.000Z",
      text: "FOUR",
    });
    expect(event.eventType).toBe("FOUR");
    expect(event.isFour).toBe(true);
    expect(event.battingPlayerId).toBeNull();
    expect(event.battingExternalId).toBe("ext-virat");
    expect(event.source).toBe("CREX");
    expect(event).not.toHaveProperty("midPaise");
    expect(PERFORMANCE_RULES[pricingActions({ ...event, battingPlayerId: "player-1" })[0]?.kind ?? ""]).toBeTruthy();
  });

  it("dedupes the same source event and keeps a second kind from the same ball", () => {
    const first = ingestionKey({ ...ball, source: "CREX", sourceEventId: "crex-88", eventType: "FOUR" });
    const repeat = ingestionKey({ ...ball, source: "CREX", sourceEventId: "crex-88", eventType: "FOUR" });
    expect(repeat).toBe(first);
    const four = pricingKey({ matchId: "match-1", innings: 1, over: 3, ball: 4, kind: "FOUR", playerId: "player-1" });
    const backup = pricingKey({ matchId: "match-1", innings: 1, over: 3, ball: 4, kind: "FOUR", playerId: "player-1" });
    const catchKey = pricingKey({ matchId: "match-1", innings: 1, over: 3, ball: 4, kind: "CATCH", playerId: "player-2" });
    expect(backup).toBe(four);
    expect(catchKey).not.toBe(four);
    expect(alreadyPriced(new Set([four]), backup)).toBe(true);
    expect(alreadyPriced(new Set([four]), catchKey)).toBe(false);
    const backupIngestion = ingestionKey({ ...ball, source: "Cricbuzz", sourceEventId: "buzz-1", eventType: "FOUR" });
    expect(backupIngestion).not.toBe(first);
  });

  it("prices a mapped player and skips an unmapped one", () => {
    expect(pricingActions({ eventType: "FOUR", battingPlayerId: null })).toEqual([]);
    expect(pricingActions({ eventType: "FOUR", battingPlayerId: "player-1" })).toEqual([{ playerId: "player-1", kind: "FOUR" }]);
    expect(pricingActions({ eventType: "WICKET", battingPlayerId: "bat", bowlingPlayerId: "bowl", wicketType: "BOWLED" }).map((row) => row.kind)).toEqual([
      "BATTER_WICKET",
      "BOWLER_WICKET",
    ]);
    expect(pricingActions({ eventType: "CATCH", fielderPlayerIds: ["keeper"] })).toEqual([{ playerId: "keeper", kind: "CATCH" }]);
  });

  it("moves source health from healthy to degraded to down and ignores a disabled source", () => {
    expect(nextSourceHealth({ enabled: true, consecutiveFailures: 0 })).toBe("HEALTHY");
    expect(nextSourceHealth({ enabled: true, consecutiveFailures: 1 })).toBe("DEGRADED");
    expect(nextSourceHealth({ enabled: true, consecutiveFailures: 3 })).toBe("DOWN");
    expect(nextSourceHealth({ enabled: false, consecutiveFailures: 0 })).toBe("DISABLED");
    const active = chooseActiveSource([
      { source: "CREX", priority: 1, enabled: true, status: "DOWN" },
      { source: "DevelopmentSimulator", priority: 2, enabled: true, status: "HEALTHY" },
      { source: "PaidProvider", priority: 0, enabled: false, status: "HEALTHY" },
    ]);
    expect(active).toBe("DevelopmentSimulator");
  });

  it("emits simulator events through the normalized path", async () => {
    const source = new DevelopmentSimulator();
    const [event] = await source.poll({
      now: new Date("2026-09-28T14:12:11.000Z"),
      matches: [{ matchId: "match-1", cursor: 2, battingExternalId: "ext-bat", bowlingExternalId: "ext-bowl" }],
    });
    expect(event?.source).toBe("DevelopmentSimulator");
    expect(event?.eventType).toBe("FOUR");
    expect(event?.battingPlayerId).toBeNull();
    expect(pricingActions(event ?? { eventType: "FOUR" })).toEqual([]);
    const priced = pricingActions({ ...event!, battingPlayerId: "player-1" });
    expect(priced).toEqual([{ playerId: "player-1", kind: "FOUR" }]);
    expect(PERFORMANCE_RULES.FOUR?.bps).toBe(18);
    const again = nextSimulatorDelivery({
      matchId: "match-1",
      cursor: 2,
      battingExternalId: "ext-bat",
      bowlingExternalId: "ext-bowl",
      now: new Date("2026-09-28T14:12:11.000Z"),
    });
    expect(again.sourceEventId).toBe(event?.sourceEventId);
    const six = nextSimulatorDelivery({
      matchId: "match-1",
      cursor: 3,
      battingExternalId: "ext-bat",
      bowlingExternalId: "ext-bowl",
      now: new Date("2026-09-28T14:12:11.000Z"),
    });
    expect(six.eventType).toBe("SIX");
    expect(six).not.toHaveProperty("midPaise");
  });

  it("keeps match anchors stable and treats a quiet poll as success", () => {
    const firstLive = planPlayerLiveTransition({
      previousMatchStatus: "SCHEDULED",
      nextMatchStatus: "LIVE",
      playerAlreadyLive: false,
      stillLiveElsewhere: false,
    });
    expect(firstLive).toEqual({ liveMatch: true, setAnchor: true, clearPerformance: true });
    const repeatLive = planPlayerLiveTransition({
      previousMatchStatus: "LIVE",
      nextMatchStatus: "LIVE",
      playerAlreadyLive: true,
      stillLiveElsewhere: false,
    });
    expect(repeatLive.setAnchor).toBe(false);
    expect(repeatLive.clearPerformance).toBe(false);
    expect(planPlayerLiveTransition({
      previousMatchStatus: "LIVE",
      nextMatchStatus: "INNINGS_BREAK",
      playerAlreadyLive: true,
      stillLiveElsewhere: false,
    })).toMatchObject({ liveMatch: true, setAnchor: false, clearPerformance: false });
    expect(planPlayerLiveTransition({
      previousMatchStatus: "LIVE",
      nextMatchStatus: "DELAYED",
      playerAlreadyLive: true,
      stillLiveElsewhere: false,
    })).toEqual({ liveMatch: true, setAnchor: false, clearPerformance: false });
    expect(planPlayerLiveTransition({
      previousMatchStatus: "LIVE",
      nextMatchStatus: "COMPLETED",
      playerAlreadyLive: true,
      stillLiveElsewhere: false,
    })).toEqual({ liveMatch: false, setAnchor: false, clearPerformance: true });
    expect(planPlayerLiveTransition({
      previousMatchStatus: "LIVE",
      nextMatchStatus: "COMPLETED",
      playerAlreadyLive: true,
      stillLiveElsewhere: true,
    })).toEqual({ liveMatch: true, setAnchor: false, clearPerformance: false });
    expect(planPlayerLiveTransition({
      previousMatchStatus: "LIVE",
      nextMatchStatus: "ABANDONED",
      playerAlreadyLive: true,
      stillLiveElsewhere: false,
    }).liveMatch).toBe(false);
    expect(eventFreshnessSeconds({ nowMs: 10_000, lastEventAtMs: 4_000, status: "LIVE" })).toBe(6);
    expect(eventFreshnessSeconds({ nowMs: 90_000, lastEventAtMs: 0, status: "INNINGS_BREAK" })).toBeNull();
    expect(eventFreshnessSeconds({ nowMs: 90_000, lastEventAtMs: 0, status: "DELAYED" })).toBeNull();
    expect(nextSourceHealth({ enabled: true, consecutiveFailures: 0 })).toBe("HEALTHY");
    expect(participationJoinsLive("SQUAD")).toBe(false);
    expect(participationJoinsLive("ACTIVE")).toBe(true);
    expect(feedPricingEnabled("SIMULATION")).toBe(false);
    expect(feedPricingEnabled("EVENT_DRIVEN")).toBe(true);
    expect(directSimulatedPricingEnabled("EVENT_DRIVEN")).toBe(false);
    expect(directSimulatedPricingEnabled("SIMULATION")).toBe(true);
    expect(engineModeSummary("EVENT_DRIVEN")).toMatch(/stopped/i);
    expect(correctionIngestionKey("CREX:ball-1", 2)).toBe("CREX:ball-1:correction:2");
    expect(deliveryChanged(
      { eventType: "FOUR", runsBatter: 4, runsExtras: 0, runsTotal: 4, wicketType: null },
      { eventType: "SIX", runsBatter: 6, runsExtras: 0, runsTotal: 6, wicketType: null },
    )).toBe(true);
    expect(deliveryChanged(
      { eventType: "FOUR", runsBatter: 4, runsExtras: 0, runsTotal: 4, wicketType: null },
      { eventType: "FOUR", runsBatter: 4, runsExtras: 0, runsTotal: 4, wicketType: null },
    )).toBe(false);
  });

  it("limits feed permissions and requires a reason for source changes", () => {
    expect(hasPermission("SUPER_ADMIN", "feed.source_manage")).toBe(true);
    expect(hasPermission("OPERATIONS_MANAGER", "feed.view")).toBe(true);
    expect(hasPermission("OPERATIONS_MANAGER", "feed.manage")).toBe(true);
    expect(hasPermission("OPERATIONS_MANAGER", "feed.mapping_manage")).toBe(true);
    expect(hasPermission("OPERATIONS_MANAGER", "feed.source_manage")).toBe(false);
    expect(hasPermission("ANALYST", "feed.view")).toBe(true);
    expect(hasPermission("ANALYST", "feed.manage")).toBe(false);
    expect(hasPermission("CONTENT_MANAGER", "feed.view")).toBe(false);
    expect(requireReason("switch source")).toBe("switch source");
    expect(() => requireReason("no")).toThrow(/reason/i);
  });

  it("keeps shadow pricing, mapping suggestions, and source health separate", () => {
    expect(mayApplyFeedPricing({ source: "Cricbuzz", operatingMode: "SHADOW", engineAllowsPricing: true, realSourcePricingEnabled: true })).toBe(false);
    expect(mayApplyFeedPricing({ source: "Cricbuzz", operatingMode: "ACTIVE", engineAllowsPricing: true, realSourcePricingEnabled: false })).toBe(false);
    expect(mayApplyFeedPricing({ source: "Cricbuzz", operatingMode: "ACTIVE", engineAllowsPricing: true, realSourcePricingEnabled: true })).toBe(true);
    expect(mayApplyFeedPricing({ source: "Cricbuzz", operatingMode: "ACTIVE", engineAllowsPricing: false, realSourcePricingEnabled: true })).toBe(false);
    expect(mayApplyFeedPricing({ source: "DevelopmentSimulator", operatingMode: "ACTIVE", engineAllowsPricing: true, realSourcePricingEnabled: false })).toBe(true);
    expect(wouldPriceAs({ eventType: "FOUR" })).toEqual(["FOUR"]);
    expect(wouldPriceAs({ eventType: "SIX" })).toEqual(["SIX"]);
    expect(wouldPriceAs({ eventType: "WICKET", wicketType: "BOWLED" })).toEqual(["BATTER_WICKET", "BOWLER_WICKET"]);
    expect(wouldPriceAs({ eventType: "WICKET", wicketType: "RUN_OUT" })).toEqual(["BATTER_WICKET"]);
    expect(suggestPlayerMatch("Virat Kohli", [{ id: "p1", name: "Virat Kohli" }])?.id).toBe("p1");
    expect(suggestPlayerMatch("Virat K", [{ id: "p1", name: "Virat Kohli" }])).toBeNull();
    expect(pollCountsAsFailure("NO_NEW_EVENT")).toBe(false);
    expect(pollCountsAsFailure("MAPPING_REQUIRED")).toBe(false);
    expect(pollCountsAsFailure("PARSE_ERROR")).toBe(true);
    expect(nextSourceHealth({ enabled: true, consecutiveFailures: 0 })).toBe("HEALTHY");
    expect(nextSourceHealth({ enabled: true, consecutiveFailures: 1 })).toBe("DEGRADED");
    expect(nextPollDelayMs(15, 0)).toBe(15_000);
    expect(nextPollDelayMs(15, 2)).toBe(60_000);
    expect(ingestLatencyMs(1_000, 1_800)).toBe(800);
    expect(latencyP50Ms([100, 400, 200])).toBe(200);
    expect(activationBlockers({ matches: [], health: "HEALTHY", lastOutcome: "OK" })).toContain("Import the match before activating this source.");
    expect(activationBlockers({
      matches: [{ label: "India vs Australia", participatingMapped: 0, unresolved: 1 }],
      health: "HEALTHY",
      lastOutcome: "OK",
    }).join(" ")).toMatch(/participating/);
    expect(activationBlockers({
      matches: [{ label: "India vs Australia", participatingMapped: 1, unresolved: 0 }],
      health: "HEALTHY",
      lastOutcome: "OK",
    })).toEqual([]);
    expect(activationBlockers({
      matches: [{ label: "India vs Australia", participatingMapped: 1, unresolved: 0 }],
      health: "DOWN",
      lastOutcome: "PARSE_ERROR",
    }).join(" ")).toMatch(/parsed successfully/);
  });
});
