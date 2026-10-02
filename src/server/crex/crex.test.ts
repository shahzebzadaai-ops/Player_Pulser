import { describe, expect, it } from "vitest";
import balls from "./fixtures/balls.json";
import { CrexLiveSource } from "./crex-source";
import { BALL_FEED_URL, extractEmbeddedJson, parseCrexBalls } from "./crex-parser";
import { normalizeCrexBalls } from "./crex-normalizer";

const page = `<html>&q;${BALL_FEED_URL}&q;:${JSON.stringify(balls)}</html>`;
const list = `<a href="/cricket-live-score/eci-vs-grb-13th-match-updates-14IL">live</a>`;

describe("CREX adapter", () => {
  it("parses the public ball feed into one single", () => {
    const parsed = parseCrexBalls(extractEmbeddedJson(page, BALL_FEED_URL));
    const [event] = normalizeCrexBalls("match-1", parsed, new Date("2026-10-01T12:00:00.000Z"));
    expect(event).toMatchObject({
      source: "CREX",
      innings: 1,
      over: 1,
      ball: 6,
      eventType: "SINGLE",
      battingName: "Jerome Bossr",
      bowlingName: "Leo Sadler",
      battingExternalId: "75H",
      bowlingExternalId: "KWP",
      runsTotal: 1,
    });
  });

  it("polls a saved match page without calling the live site", async () => {
    const source = new CrexLiveSource({
      ballFeedUrl: BALL_FEED_URL,
      getLivePage: async () => list,
      getMatchPage: async () => page,
    });
    const events = await source.poll({
      matches: [{ matchId: "match-1", cursor: 0, battingExternalId: "", bowlingExternalId: "", externalMatchId: "14IL" }],
      now: new Date("2026-10-01T12:00:00.000Z"),
    });
    expect(events).toHaveLength(4);
    expect(new Set(events.map((event) => event.sourceEventId)).size).toBe(4);
  });
});
