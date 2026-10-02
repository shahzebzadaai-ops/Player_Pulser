import { describe, expect, it } from "vitest";
import { hasPermission } from "./permissions";
import {
  consensusEngineHealth,
  consensusMayPrice,
  decideConsensus,
  rollReliability,
  type ConsensusCandidate,
  type ConsensusProvider,
} from "./consensus-feed";

function ball(source: ConsensusProvider, sourceEventId: string, patch: Partial<ConsensusCandidate> = {}): ConsensusCandidate {
  return {
    source,
    sourceEventId,
    matchId: "match-1",
    innings: 1,
    over: 8,
    ball: 4,
    eventType: "FOUR",
    runsTotal: 4,
    wicketType: null,
    battingPlayerId: null,
    bowlingPlayerId: null,
    battingName: "Virat Kohli",
    bowlingName: "Jasprit Bumrah",
    ...patch,
  };
}

const all: ConsensusProvider[] = ["CREX", "Sportskeeda", "Cricbuzz"];

describe("consensus feed", () => {
  it("accepts three agreeing sources as high confidence", () => {
    const [decision] = decideConsensus({
      availableSources: all,
      candidates: [ball("CREX", "crex-1"), ball("Sportskeeda", "sk-1"), ball("Cricbuzz", "cb-1")],
    });
    expect(decision?.confidence).toBe("CONFIDENCE_HIGH");
    expect(decision?.supportingSources).toHaveLength(3);
    expect(decision?.acceptedEvent?.source).toBe("CREX");
  });

  it("accepts two of three as high and keeps the dissenter", () => {
    const [decision] = decideConsensus({
      availableSources: all,
      candidates: [ball("CREX", "crex-1"), ball("Sportskeeda", "sk-1"), ball("Cricbuzz", "cb-1", { eventType: "SIX", runsTotal: 6 })],
    });
    expect(decision?.confidence).toBe("CONFIDENCE_HIGH");
    expect(decision?.conflictingSources).toEqual(["Cricbuzz"]);
    expect(decision?.acceptedEvent?.eventType).toBe("FOUR");
  });

  it("marks two available agreeing sources as medium", () => {
    const [decision] = decideConsensus({
      availableSources: ["Sportskeeda", "Cricbuzz"],
      candidates: [ball("Sportskeeda", "sk-1"), ball("Cricbuzz", "cb-1")],
    });
    expect(decision?.confidence).toBe("CONFIDENCE_MEDIUM");
  });

  it("marks a single available source as low", () => {
    const [decision] = decideConsensus({
      availableSources: ["CREX"],
      candidates: [ball("CREX", "crex-1"), ball("CREX", "crex-1-dup")],
    });
    expect(decision?.confidence).toBe("CONFIDENCE_LOW");
    expect(decision?.sourceEventIds).toEqual(["crex-1-dup"]);
  });

  it("records a conflict when every source disagrees", () => {
    const [decision] = decideConsensus({
      availableSources: all,
      candidates: [
        ball("CREX", "crex-1", { eventType: "SINGLE", runsTotal: 1 }),
        ball("Sportskeeda", "sk-1", { eventType: "FOUR", runsTotal: 4 }),
        ball("Cricbuzz", "cb-1", { eventType: "SIX", runsTotal: 6 }),
      ],
    });
    expect(decision?.confidence).toBe("CONFLICT");
    expect(decision?.acceptedEvent).toBeNull();
    expect(decision?.conflictingSources).toHaveLength(3);
  });

  it("continues when Cricbuzz is down and the other two agree", () => {
    const [decision] = decideConsensus({
      availableSources: ["CREX", "Sportskeeda"],
      candidates: [ball("CREX", "crex-9"), ball("Sportskeeda", "sk-9"), ball("Cricbuzz", "cb-down", { eventType: "WIDE", runsTotal: 1 })],
    });
    expect(decision?.confidence).toBe("CONFIDENCE_MEDIUM");
    expect(decision?.supportingSources).toEqual(expect.arrayContaining(["CREX", "Sportskeeda"]));
    expect(decision?.conflictingSources).not.toContain("Cricbuzz");
  });

  it("matches the same ball when provider ids differ", () => {
    const [decision] = decideConsensus({
      availableSources: all,
      candidates: [ball("CREX", "provider-a"), ball("Sportskeeda", "provider-b"), ball("Cricbuzz", "provider-c")],
    });
    expect(decision?.confidence).toBe("CONFIDENCE_HIGH");
    expect(decision?.sourceEventIds).toEqual(expect.arrayContaining(["provider-a", "provider-b", "provider-c"]));
  });

  it("keeps a temporary failure from wiping reliability", () => {
    const next = rollReliability({ score: 90, agreementPercent: 100, gapPercent: 0, correctionPercent: 0 }, {
      parseSuccess: false,
      agreementPercent: 0,
      latencyMs: 8_000,
      gapPercent: 100,
      correctionPercent: 100,
    });
    expect(next.score).toBeGreaterThanOrEqual(60);
    expect(next.score).toBeLessThan(90);
  });

  it("does not treat a shared name as a priceable player identity", () => {
    const [named] = decideConsensus({
      availableSources: all,
      candidates: [ball("CREX", "crex-name"), ball("Sportskeeda", "sk-name"), ball("Cricbuzz", "cb-name")],
    });
    expect(named?.confidence).toBe("CONFIDENCE_HIGH");
    expect(named?.priceableIdentity).toBe(false);
    const [identified] = decideConsensus({
      availableSources: all,
      candidates: [
        ball("CREX", "crex-id", { battingPlayerId: "player-kohli" }),
        ball("Sportskeeda", "sk-id", { battingPlayerId: "player-kohli" }),
        ball("Cricbuzz", "cb-id", { battingPlayerId: "player-kohli" }),
      ],
    });
    expect(identified?.priceableIdentity).toBe(true);
  });

  it("does not join events from different matches because the names look alike", () => {
    const decisions = decideConsensus({
      availableSources: all,
      candidates: [
        ball("CREX", "crex-a", { matchId: "india-australia" }),
        ball("Sportskeeda", "sk-b", { matchId: "india-england" }),
      ],
    });
    expect(decisions).toHaveLength(2);
    expect(new Set(decisions.map((decision) => decision.matchId)).size).toBe(2);
  });
  it("prices only medium and high consensus", () => {
    expect(consensusMayPrice("CONFIDENCE_HIGH")).toBe(true);
    expect(consensusMayPrice("CONFIDENCE_MEDIUM")).toBe(true);
    expect(consensusMayPrice("CONFIDENCE_LOW")).toBe(false);
    expect(consensusMayPrice("CONFLICT")).toBe(false);
    expect(consensusMayPrice("CONFIDENCE_MEDIUM", ["CONFIDENCE_HIGH"])).toBe(false);
  });

  it("reports consensus health from usable sources", () => {
    expect(consensusEngineHealth({ usableSources: 2 })).toBe("HEALTHY");
    expect(consensusEngineHealth({ usableSources: 1 })).toBe("DEGRADED");
    expect(consensusEngineHealth({ usableSources: 0 })).toBe("DOWN");
    expect(consensusEngineHealth({ usableSources: 3, latestConfidence: "CONFLICT" })).toBe("DEGRADED");
  });

  it("keeps the feed sources page on the existing feed permission", () => {
    expect(hasPermission("ANALYST", "feed.view")).toBe(true);
    expect(hasPermission("CONTENT_MANAGER", "feed.view")).toBe(false);
    expect(hasPermission("SUPER_ADMIN", "feed.manage")).toBe(true);
  });
});
