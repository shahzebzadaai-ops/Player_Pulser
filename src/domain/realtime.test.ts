import { describe, expect, it } from "vitest";
import { compactNotice, listenerHealth, NOTIFY_PAYLOAD_LIMIT, parseNotice, sseHealth, sseRetryDelayMs } from "./realtime";

describe("postgres realtime notices", () => {
  it("sends a compact notice and recovers health from the latest snapshot age", () => {
    const payload = compactNotice({
      type: "price",
      playerId: "player-1",
      matchId: null,
      priceTickId: "tick-1",
      eventId: null,
      publishedAt: "2026-09-28T14:12:11.000Z",
    });
    expect(payload.length).toBeLessThan(NOTIFY_PAYLOAD_LIMIT);
    expect(Object.keys(JSON.parse(payload)).sort()).toEqual(["eventId", "matchId", "playerId", "priceTickId", "publishedAt", "type"]);
    expect(parseNotice(payload)?.priceTickId).toBe("tick-1");
    expect(parseNotice("not-json")).toBeNull();
    expect(listenerHealth(null)).toBe("DOWN");
    expect(listenerHealth(5_000)).toBe("HEALTHY");
    expect(listenerHealth(30_000)).toBe("DEGRADED");
    expect(sseHealth({ listener: "HEALTHY", lastPushAgeMs: null })).toBe("DEGRADED");
    expect(sseHealth({ listener: "HEALTHY", lastPushAgeMs: 1_000 })).toBe("HEALTHY");
    expect(sseHealth({ listener: "DOWN", lastPushAgeMs: null })).toBe("DOWN");
    expect(sseRetryDelayMs(0)).toBe(1000);
    expect(sseRetryDelayMs(4)).toBe(10_000);
  });
});
