import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { simulationCycleMs } from "./settings";
import {
  appendSparkline,
  createSharedConnection,
  emptyPriceStore,
  formatExternalPrice,
  heartbeatFrame,
  HEARTBEAT_MS,
  nextChartPoint,
  nextReconnectAttempt,
  playersUnaffectedByMarkets,
  priceFlash,
  publicPriceSource,
  quoteDirection,
  reducePriceFrame,
  SPARKLINE_CAP,
  SSE_HEADERS,
  streamHealth,
  type ExternalQuote,
  type PlayerQuote,
} from "./live-prices";

const player = (mid: string): PlayerQuote => ({
  id: "p1",
  slug: "virat-kohli",
  midPaise: mid,
  buyPaise: "10100",
  sellPaise: "9900",
  changePaise: "100",
  changePercent: 1,
  previousMidPricePaise: "10000",
  createdAt: "2026-10-03T00:00:00.000Z",
  source: "simulation",
  chartTime: 1_700_000_000,
  chartValue: Number(mid) / 100,
});

describe("live price stream", () => {
  it("opens one shared connection for every subscriber", () => {
    const hub = createSharedConnection<{ close(): void }>();
    const first = hub.acquire(() => ({ close() {} }));
    const second = hub.acquire(() => ({ close() {} }));
    expect(first).toBe(second);
    expect(hub.opens).toBe(1);
    expect(hub.holders).toBe(2);
    hub.release();
    expect(hub.connected).toBe(true);
    hub.release();
    expect(hub.connected).toBe(false);
    expect(hub.opens).toBe(1);
  });

  it("applies the initial snapshot and later ticks", () => {
    const snapshot = reducePriceFrame(emptyPriceStore(), { players: [player("10000")], markets: [] }, 1_000);
    expect(snapshot.players.get("p1")?.midPaise).toBe("10000");
    const ticked = reducePriceFrame(snapshot, { players: [player("10150")] }, 2_000);
    expect(ticked.players.get("p1")?.midPaise).toBe("10150");
    expect(ticked.players.get("p1")?.slug).toBe("virat-kohli");
    expect(ticked.lastEventAt).toBe(2_000);
  });

  it("treats a heartbeat as a live signal without changing prices", () => {
    const snapshot = reducePriceFrame(emptyPriceStore(), { players: [player("10000")] }, 1_000);
    const beat = reducePriceFrame(snapshot, { type: "heartbeat" }, 2_000);
    expect(beat.players.get("p1")?.midPaise).toBe("10000");
    expect(beat.lastEventAt).toBe(2_000);
    expect(heartbeatFrame("2026-10-03T00:00:00.000Z")).toContain('"type":"heartbeat"');
    expect(heartbeatFrame("2026-10-03T00:00:00.000Z").endsWith("\n\n")).toBe(true);
    expect(HEARTBEAT_MS).toBeGreaterThanOrEqual(15_000);
    expect(HEARTBEAT_MS).toBeLessThanOrEqual(20_000);
    expect(SSE_HEADERS["Cache-Control"]).toContain("no-cache");
    expect(SSE_HEADERS["Cache-Control"]).toContain("no-store");
    expect(SSE_HEADERS["X-Accel-Buffering"]).toBe("no");
    expect(SSE_HEADERS.Connection).toBe("keep-alive");
  });

  it("flashes only when the price itself changes", () => {
    expect(priceFlash(null, 100)).toBe("none");
    expect(priceFlash(100, 100)).toBe("none");
    expect(priceFlash(100, 101)).toBe("up");
    expect(priceFlash(101, 100)).toBe("down");
  });

  it("does not let a customer balance choose the flash direction", () => {
    expect(quoteDirection(100, 90, "999999999")).toBe("down");
    expect(quoteDirection(100, 110, "0")).toBe("up");
    expect(quoteDirection(100, 100, "500000")).toBe("none");
  });

  it("reconnects with a capped backoff and resets after a successful open", () => {
    expect(nextReconnectAttempt(3, true)).toBe(0);
    expect(nextReconnectAttempt(1, false)).toBe(2);
  });

  it("marks the stream delayed when no event arrives inside the threshold", () => {
    expect(streamHealth({ phase: "reconnecting", lastEventAt: 1_000, now: 2_000 })).toBe("reconnecting");
    expect(streamHealth({ phase: "open", lastEventAt: null, now: 2_000 })).toBe("delayed");
    expect(streamHealth({ phase: "open", lastEventAt: 1_000, now: 30_000 })).toBe("delayed");
    expect(streamHealth({ phase: "open", lastEventAt: 20_000, now: 30_000 })).toBe("live");
  });

  it("appends sparkline points without growing past the cap", () => {
    expect(appendSparkline([1, 2], 2)).toEqual([1, 2]);
    const capped = appendSparkline(Array.from({ length: SPARKLINE_CAP }, (_, index) => index), SPARKLINE_CAP + 5);
    expect(capped).toHaveLength(SPARKLINE_CAP);
    expect(capped[capped.length - 1]).toBe(SPARKLINE_CAP + 5);
  });

  it("updates a chart point in place and rejects an older timestamp", () => {
    expect(nextChartPoint(100, { time: 100, value: 12 })).toEqual({ time: 100, value: 12 });
    expect(nextChartPoint(100, { time: 101, value: 13 })).toEqual({ time: 101, value: 13 });
    expect(nextChartPoint(100, { time: 99, value: 11 })).toBeNull();
  });

  it("keeps the simulation cycle inside the admin window", () => {
    expect(simulationCycleMs(undefined)).toBe(4_000);
    expect(simulationCycleMs(3_000)).toBe(3_000);
    expect(simulationCycleMs(5_000)).toBe(5_000);
    expect(simulationCycleMs(1)).toBe(3_000);
    expect(simulationCycleMs(9_000)).toBe(5_000);
    expect(simulationCycleMs("4500")).toBe(4_500);
  });

  it("labels external markets without writing them into player prices", () => {
    const markets: ExternalQuote[] = [{
      symbol: "BTC/USD",
      label: "BTC/USD",
      price: 65000,
      changePercent: 1,
      currency: "USD",
      source: "Kraken ticker",
      cadence: "live",
      updatedAt: "2026-10-03T00:00:00.000Z",
    }];
    const before = [player("10000")];
    expect(playersUnaffectedByMarkets(before, markets)).toBe(before);
    expect(playersUnaffectedByMarkets(before, markets)[0]?.midPaise).toBe("10000");
    expect(formatExternalPrice(markets[0]!)).toBe("$65,000");
    expect(publicPriceSource("SIMULATION_ONLY", "simulation")).toBe("simulation");
    const source = readFileSync(new URL("../server/external-markets.ts", import.meta.url), "utf8");
    expect(source).not.toContain("priceTick");
    expect(source).not.toContain("prepareSimulatedTick");
    expect(source).not.toContain("publishPriceUpdate");
    expect(source).not.toContain("prisma");
  });
});
