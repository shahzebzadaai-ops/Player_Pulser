import { describe, expect, it } from "vitest";
import commentary from "./fixtures/commentary.json";
import { parseSportskeedaCommentary } from "./sportskeeda-parser";
import { normalizeSportskeedaDeliveries } from "./sportskeeda-normalizer";
import { SportskeedaLiveSource } from "./sportskeeda-source";

describe("Sportskeeda adapter", () => {
  it("parses commentary into a four and a wicket in the same innings", () => {
    const events = normalizeSportskeedaDeliveries("match-1", parseSportskeedaCommentary(commentary), new Date("2026-10-01T12:00:00.000Z"));
    expect(events.map((event) => event.eventType)).toEqual(["DOT_BALL", "FOUR", "WICKET"]);
    expect(events.every((event) => event.innings === 2 && event.source === "Sportskeeda")).toBe(true);
    expect(events[2]).toMatchObject({ over: 9, ball: 5, wicketType: "BOWLED", battingName: "Binura Fernando", bowlingName: "Abhishek Sharma" });
  });

  it("polls a saved commentary payload", async () => {
    const source = new SportskeedaLiveSource({
      getMatches: async () => ({ matches: [] }),
      getCommentary: async () => commentary,
    });
    const events = await source.poll({
      matches: [{ matchId: "match-1", cursor: 0, battingExternalId: "", bowlingExternalId: "", externalMatchId: "india-vs-sri-lanka" }],
      now: new Date(),
    });
    expect(events).toHaveLength(3);
  });
});
