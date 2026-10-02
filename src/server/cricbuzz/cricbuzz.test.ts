import { describe, expect, it } from "vitest";
import { wouldPriceAs } from "@/domain/cricket-feed";
import { createCricbuzzClient, CricbuzzTransportError } from "./cricbuzz-client";
import { normalizeCommentary, partitionCommentary } from "./cricbuzz-normalizer";
import { CricbuzzParseError, parseCommentary, parseMatchList } from "./cricbuzz-parser";
import { CricbuzzLiveSource } from "./cricbuzz-source";
import commentary from "./fixtures/commentary.json";
import matches from "./fixtures/matches.json";

describe("cricbuzz fixtures", () => {
  it("parses international discovery and prefers India", () => {
    const rows = parseMatchList(matches);
    expect(rows.map((row) => row.externalId)).toEqual(["88901", "88950"]);
    expect(rows[0]).toMatchObject({
      homeTeam: "India",
      awayTeam: "Australia",
      indiaInternational: true,
      venue: "Melbourne Cricket Ground, Melbourne",
    });
    expect(rows[1]?.indiaInternational).toBe(false);
    expect(() => parseMatchList({ unexpected: true })).toThrow(CricbuzzParseError);
    const embedded = parseMatchList(`<html>{"currentMatchesList":${JSON.stringify(matches)}}</html>`);
    expect(embedded[0]?.externalId).toBe("88901");
    const escaped = parseMatchList(`<script>self.__next_f.push([1,"${JSON.stringify(matches).replace(/"/g, '\\"')}"]);</script>`);
    expect(embedded[0]?.externalId).toBe("88901");
    const current = parseCommentary({
      matchHeader: { matchId: 151532, status: "India won", state: "Complete", team1: { name: "India" }, team2: { name: "West Indies" } },
      miniscore: { inningsId: 2, overs: 41.4 },
      matchCommentary: {
        "1790524879581": {
          commType: "commentary",
          commText: "Keacy Carty to Virat Kohli, <b>SIX</b>, finishes it.",
          inningsId: 2,
          event: ["team_hundred", "six", "all"],
          ballMetric: 41.4,
          timestamp: 1790524879581,
          batsmanDetails: { playerId: 1413, playerName: "Virat Kohli" },
          bowlerDetails: { playerId: 11217, playerName: "Keacy Carty" },
        },
        "1": { commType: "snippet", eventType: "Plugin:video", headline: "Video" },
      },
    }, "151532");
    const six = normalizeCommentary("match-live", current, new Date("2026-09-28T12:00:00.000Z")).find((event) => event.eventType === "SIX");
    expect(six).toMatchObject({
      over: 41,
      ball: 4,
      battingExternalId: "1413",
      battingName: "Virat Kohli",
      bowlingExternalId: "11217",
      sourceEventId: "cb:151532:2:41.4",
      rawDescription: "Keacy Carty to Virat Kohli, SIX, finishes it.",
    });
  });

  it("normalizes four, six, wicket, run out, and a milestone", () => {
    const parsed = parseCommentary(commentary, "88901");
    const events = normalizeCommentary("match-1", parsed, new Date("2026-09-28T12:00:00.000Z"));
    const byBall = Object.fromEntries(events.map((event) => [`${event.over}.${event.ball}:${event.eventType}`, event]));
    expect(byBall["12.1:FOUR"]).toMatchObject({ isFour: true, battingExternalId: "1413", battingName: "Virat Kohli", source: "Cricbuzz" });
    expect(byBall["12.2:SIX"]).toMatchObject({ isSix: true, runsTotal: 6 });
    expect(byBall["12.3:WICKET"]).toMatchObject({ wicketType: "BOWLED" });
    expect(byBall["12.4:WICKET"]).toMatchObject({ wicketType: "RUN_OUT", sourceEventId: "cb:88901:1:12.4" });
    expect(byBall["12.5:FIFTY"]?.sourceEventId).toBe("cb:88901:1:12.5:FIFTY:1413");
    expect(wouldPriceAs(byBall["12.1:FOUR"]!)).toEqual(["FOUR"]);
    expect(wouldPriceAs(byBall["12.2:SIX"]!)).toEqual(["SIX"]);
    expect(wouldPriceAs(byBall["12.3:WICKET"]!)).toEqual(["BATTER_WICKET", "BOWLER_WICKET"]);
    expect(wouldPriceAs(byBall["12.4:WICKET"]!)).toEqual(["BATTER_WICKET"]);
    expect(byBall["12.1:FOUR"]?.sourceTimestamp).toBe(new Date(1759018200000).toISOString());
    expect(events.every((event) => !("matchHeader" in event))).toBe(true);
  });

  it("does not call the provider when there are no matches to poll", async () => {
    const source = new CricbuzzLiveSource({
      getMatchList: async () => {
        throw new Error("should not fetch");
      },
      getCommentary: async () => {
        throw new Error("should not fetch");
      },
    });
    expect(await source.poll({ matches: [], now: new Date() })).toEqual([]);
  });

  it("retries a timeout and does not retry a client error", async () => {
    let timeouts = 0;
    const recovering = createCricbuzzClient({
      sleep: async () => {},
      timeoutMs: 20,
      cacheMs: 0,
      fetchImpl: async () => {
        timeouts += 1;
        if (timeouts < 3) {
          const error = new Error("aborted");
          error.name = "AbortError";
          throw error;
        }
        return new Response(JSON.stringify({ typeMatches: [] }), { status: 200 });
      },
    });
    await expect(recovering.getMatchList()).resolves.toEqual({ typeMatches: [] });
    expect(timeouts).toBe(3);

    let denied = 0;
    const rejected = createCricbuzzClient({
      sleep: async () => {},
      cacheMs: 0,
      fetchImpl: async () => {
        denied += 1;
        return new Response("missing", { status: 404 });
      },
    });
    await expect(rejected.getMatchList()).rejects.toBeInstanceOf(CricbuzzTransportError);
    expect(denied).toBe(1);
  });

  it("retains an unclassified provider delivery", () => {
    const parsed = {
      externalMatchId: "88901",
      providerStatus: "",
      state: "",
      homeTeam: "India",
      awayTeam: "Australia",
      innings: 1,
      overLabel: "1.1",
      score: null,
      deliveries: [{
        innings: 1,
        over: 1,
        ball: 1,
        sequence: 2,
        eventCode: "APPEAL",
        text: "Appeal for caught behind",
        timestamp: null,
        batterId: "1413",
        batterName: "Virat Kohli",
        bowlerId: "9",
        bowlerName: "Bowler",
      }],
    };
    const now = new Date("2026-09-30T12:00:00.000Z");
    const split = partitionCommentary("match-1", parsed, now);
    expect(split.events).toEqual([]);
    expect(split.unclassified[0]).toMatchObject({ providerCode: "APPEAL", rawDescription: "Appeal for caught behind" });
    expect(normalizeCommentary("match-1", parsed, now)).toEqual([]);
  });
});
