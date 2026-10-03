import { describe, expect, it } from "vitest";
import { nextChartPoint, reducePriceFrame, emptyPriceStore } from "./live-prices";
import {
  buildShowcaseHistory,
  initialShowcaseState,
  MAJOR_PLAYER_SLUGS,
  rangeBand,
  rangePercent,
  rangePressure,
  showcasePricingActive,
  stepShowcase,
} from "./showcase-market";

describe("showcase market", () => {
  it("keeps event-driven mode off the showcase path", () => {
    expect(showcasePricingActive({ marketMode: "EVENT_DRIVEN", engineMode: "SIMULATION", pricingMode: "simulation" })).toBe(false);
    expect(showcasePricingActive({ marketMode: "SHOWCASE", engineMode: "EVENT_DRIVEN", pricingMode: "simulation" })).toBe(false);
    expect(showcasePricingActive({ marketMode: "SHOWCASE", engineMode: "SIMULATION", pricingMode: "paused" })).toBe(false);
    expect(showcasePricingActive({ marketMode: "SHOWCASE", engineMode: "SIMULATION", pricingMode: "simulation" })).toBe(true);
  });

  it("changes range pressure by band without pinning a price", () => {
    expect(rangeBand(10)).toBe("normal");
    expect(rangeBand(30)).toBe("persist");
    expect(rangeBand(42)).toBe("explore");
    expect(rangeBand(50)).toBe("active");
    expect(rangeBand(70)).toBe("revert");
    expect(rangePressure(30).persistence).toBeGreaterThan(rangePressure(70).persistence);
    expect(rangePressure(42).exploreChance).toBeGreaterThan(rangePressure(10).exploreChance);
    expect(rangePressure(70).reversionBoost).toBeGreaterThan(rangePressure(10).reversionBoost);
  });

  it("does not alternate direction on every step", () => {
    const slug = "virat-kohli";
    let state = initialShowcaseState(slug, 10_000n);
    let mid = 10_000n;
    let high = mid;
    let low = mid;
    const random = seeded(99);
    const directions: number[] = [];
    for (let index = 0; index < 240; index += 1) {
      const next = stepShowcase({
        midPaise: mid,
        referencePaise: 10_000n,
        highPaise: high,
        lowPaise: low,
        state,
        performance: 0,
        demand: 0,
        news: 0,
        major: true,
        random,
      });
      state = next.state;
      if (!next.moved) continue;
      directions.push(Math.sign(next.moveBps));
      mid = next.midPaise;
      if (mid > high) high = mid;
      if (mid < low) low = mid;
      expect(Math.abs(next.moveBps)).toBeLessThan(120);
    }
    expect(directions.length).toBeGreaterThan(40);
    let flips = 0;
    for (let index = 1; index < directions.length; index += 1) {
      if (directions[index] !== directions[index - 1]) flips += 1;
    }
    expect(flips / (directions.length - 1)).toBeLessThan(0.85);
  });

  it("moves players independently", () => {
    const left = runSlug("virat-kohli", 1);
    const right = runSlug("kuldeep-yadav", 1);
    expect(left).not.toBe(right);
  });

  it("stores a varied 24h path whose high and low are the ticks themselves", () => {
    const history = buildShowcaseHistory({
      slug: "rohit-sharma",
      referencePaise: 10_000n,
      now: new Date("2026-10-03T00:00:00.000Z"),
    });
    const mids = history.points.map((point) => point.midPaise);
    const high = mids.reduce((max, value) => (value > max ? value : max));
    const low = mids.reduce((min, value) => (value < min ? value : min));
    expect(high).toBe(history.highPaise);
    expect(low).toBe(history.lowPaise);
    const percent = rangePercent(high, low, 10_000n);
    expect(percent).toBeGreaterThan(35);
    expect(percent).toBeLessThan(70);
    expect(MAJOR_PLAYER_SLUGS.has("rohit-sharma")).toBe(true);
    const times = history.points.map((point) => point.at.getTime());
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
  });

  it("publishes a tick into the shared store and extends the chart without a reload", () => {
    const before = emptyPriceStore();
    const after = reducePriceFrame(before, {
      type: "prices",
      marketMode: "SHOWCASE",
      players: [{ id: "p1", midPaise: "10420", chartTime: 100, chartValue: 104.2, source: "showcase" }],
    }, 1_000);
    expect(after.players.get("p1")?.midPaise).toBe("10420");
    expect(after.marketMode).toBe("SHOWCASE");
    expect(nextChartPoint(90, { time: 100, value: 104.2 })).toEqual({ time: 100, value: 104.2 });
    expect(nextChartPoint(100, { time: 100, value: 104.4 })).toEqual({ time: 100, value: 104.4 });
  });
});

function seeded(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function runSlug(slug: string, seed: number): string {
  let state = initialShowcaseState(slug, 8_000n);
  let mid = 8_000n;
  let high = mid;
  let low = mid;
  const random = seeded(seed + slug.length * 17);
  for (let index = 0; index < 80; index += 1) {
    const next = stepShowcase({
      midPaise: mid,
      referencePaise: 8_000n,
      highPaise: high,
      lowPaise: low,
      state,
      performance: 0,
      demand: 0,
      news: 0,
      major: MAJOR_PLAYER_SLUGS.has(slug),
      random,
    });
    state = next.state;
    if (!next.moved) continue;
    mid = next.midPaise;
    if (mid > high) high = mid;
    if (mid < low) low = mid;
  }
  return mid.toString();
}
