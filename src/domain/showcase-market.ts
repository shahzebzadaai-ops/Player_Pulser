import { divRoundHalfAwayFromZero } from "./money";

/**
 * Showcase market path. This is server-side only.
 * EVENT_DRIVEN pricing must not call these functions.
 * Moves are small basis-point steps. There is no sine wave and no forced high/low alternation.
 */
export const SHOWCASE_SOURCE = "SHOWCASE";
export const PERSONALITIES = ["MOMENTUM", "MEAN_REVERTING", "BREAKOUT", "VOLATILE", "STEADY"] as const;
export type ShowcasePersonality = (typeof PERSONALITIES)[number];
export type MarketMode = "SHOWCASE" | "EVENT_DRIVEN";

export const MAJOR_PLAYER_SLUGS = new Set([
  "virat-kohli",
  "rohit-sharma",
  "jasprit-bumrah",
  "hardik-pandya",
  "rishabh-pant",
  "shubman-gill",
  "yashasvi-jaiswal",
  "suryakumar-yadav",
  "kl-rahul",
]);

export type ShowcaseState = {
  personality: ShowcasePersonality;
  momentumBps: number;
  volatility: number;
  meanReversion: number;
  lastDirection: -1 | 0 | 1;
  hiddenTargetPaise: bigint;
  impulseIn: number;
  pauseFor: number;
};

export type RangeBand = "normal" | "persist" | "explore" | "active" | "revert";

export function showcasePricingActive(input: {
  marketMode: MarketMode;
  engineMode: "SIMULATION" | "EVENT_DRIVEN";
  pricingMode: "simulation" | "paused";
}): boolean {
  return input.marketMode === "SHOWCASE" && input.pricingMode === "simulation" && input.engineMode === "SIMULATION";
}

export function marketMode(value: unknown): MarketMode {
  return value === "EVENT_DRIVEN" ? "EVENT_DRIVEN" : "SHOWCASE";
}

export function clampShowcaseTarget(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(70, Math.max(30, Math.round(parsed)));
}

export function clampShowcaseVolatility(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(200, Math.max(50, Math.round(parsed)));
}

export function rangePercent(highPaise: bigint, lowPaise: bigint, referencePaise: bigint): number {
  if (referencePaise <= 0n) return 0;
  const span = highPaise > lowPaise ? highPaise - lowPaise : 0n;
  return (Number(span) / Number(referencePaise)) * 100;
}

export function rangeBand(percent: number, target = 50): RangeBand {
  const center = clampShowcaseTarget(target);
  if (percent < center - 25) return "normal";
  if (percent < center - 10) return "persist";
  if (percent < center - 5) return "explore";
  if (percent <= center + 5) return "active";
  return "revert";
}

/** Influences probabilities. It does not pin the next price to a high or a low. */
export function rangePressure(percent: number, target = 50): { persistence: number; reversionBoost: number; exploreChance: number } {
  const band = rangeBand(percent, target);
  if (band === "persist") return { persistence: 0.88, reversionBoost: 0, exploreChance: 0.05 };
  if (band === "explore") return { persistence: 0.7, reversionBoost: 0, exploreChance: 0.62 };
  if (band === "active") return { persistence: 0.74, reversionBoost: 0.05, exploreChance: 0.15 };
  if (band === "revert") return { persistence: 0.42, reversionBoost: 0.4, exploreChance: 0 };
  return { persistence: 0.7, reversionBoost: 0.08, exploreChance: 0.08 };
}

export function personalityFor(slug: string): ShowcasePersonality {
  const hash = hashSeed(slug);
  if (MAJOR_PLAYER_SLUGS.has(slug)) {
    const active: ShowcasePersonality[] = ["MOMENTUM", "BREAKOUT", "VOLATILE", "MEAN_REVERTING"];
    return active[hash % active.length] ?? "MOMENTUM";
  }
  return PERSONALITIES[hash % PERSONALITIES.length] ?? "STEADY";
}

export function hashRandom(seed: string): () => number {
  return mulberry32(hashSeed(seed));
}

export function initialShowcaseState(slug: string, referencePaise: bigint): ShowcaseState {
  const random = hashRandom(`${slug}:state`);
  const personality = personalityFor(slug);
  const major = MAJOR_PLAYER_SLUGS.has(slug);
  const ref = Number(referencePaise);
  const span = major ? 0.18 : 0.08;
  const target = Math.max(100, Math.round(ref * (1 + (random() * 2 - 1) * span)));
  const volatility = personality === "VOLATILE" ? 1.35 : personality === "STEADY" ? 0.42 : personality === "BREAKOUT" ? 1.05 : 0.8;
  const meanReversion = personality === "MEAN_REVERTING" ? 0.34 : personality === "MOMENTUM" ? 0.08 : 0.16;
  return {
    personality,
    momentumBps: (random() * 2 - 1) * (personality === "MOMENTUM" ? 16 : 7),
    volatility,
    meanReversion,
    lastDirection: 0,
    hiddenTargetPaise: BigInt(target),
    impulseIn: 4 + Math.floor(random() * 14),
    pauseFor: Math.floor(random() * 3),
  };
}

export function stepShowcase(input: {
  midPaise: bigint;
  referencePaise: bigint;
  highPaise: bigint;
  lowPaise: bigint;
  state: ShowcaseState;
  performance: number;
  demand: number;
  news: number;
  major: boolean;
  random: () => number;
  rangeTarget?: number;
  volatilityScale?: number;
}): {
  moved: boolean;
  midPaise: bigint;
  state: ShowcaseState;
  moveBps: number;
  performance: number;
  demand: number;
  news: number;
  performanceBps: number;
  demandBps: number;
  newsBps: number;
} {
  const state: ShowcaseState = { ...input.state, hiddenTargetPaise: input.state.hiddenTargetPaise };
  const idle = {
    moved: false,
    midPaise: input.midPaise,
    state,
    moveBps: 0,
    performance: input.performance,
    demand: input.demand,
    news: input.news,
    performanceBps: 0,
    demandBps: 0,
    newsBps: 0,
  };
  if (input.midPaise <= 0n) return idle;
  if (state.pauseFor > 0) {
    state.pauseFor -= 1;
    return idle;
  }
  const pauseChance = input.major ? 0.12 : state.personality === "STEADY" ? 0.48 : state.personality === "VOLATILE" ? 0.1 : 0.26;
  if (input.random() < pauseChance) {
    state.pauseFor = 1 + Math.floor(input.random() * (state.personality === "MOMENTUM" ? 2 : 4));
    return idle;
  }

  const high = input.highPaise > input.midPaise ? input.highPaise : input.midPaise;
  const low = input.lowPaise > 0n && input.lowPaise < input.midPaise ? input.lowPaise : input.midPaise;
  const percent = rangePercent(high, low, input.referencePaise);
  const pressure = rangePressure(percent, input.rangeTarget ?? 50);
  const scale = (input.volatilityScale ?? 100) / 100;
  const current = Number(input.midPaise);
  const gapBps = ((Number(state.hiddenTargetPaise) - current) / current) * 10_000;
  const noise = (input.random() * 2 - 1) * 11 * state.volatility * scale;
  let momentum = state.momentumBps * pressure.persistence + noise * 0.4;
  const attraction = gapBps * (state.meanReversion + pressure.reversionBoost) * 0.12;
  let explore = 0;
  if (input.random() < pressure.exploreChance) {
    const midpoint = (Number(high) + Number(low)) / 2;
    const unvisited = current >= midpoint ? -1 : 1;
    explore = unvisited * (6 + input.random() * (input.major ? 16 : 8));
  }
  state.impulseIn -= 1;
  let impulse = 0;
  if (state.impulseIn <= 0) {
    const sign = momentum === 0 ? (input.random() < 0.5 ? -1 : 1) : Math.sign(momentum);
    impulse = sign * (8 + input.random() * (input.major ? 22 : 12));
    if (pressure.reversionBoost > 0.2) impulse *= 0.35;
    const midpoint = (Number(high) + Number(low)) / 2;
    const unvisited = current >= midpoint ? -1 : 1;
    const expand = input.major && percent < 52;
    state.impulseIn = expand && percent < 45
      ? 20 + Math.floor(input.random() * 16)
      : 6 + Math.floor(input.random() * (state.personality === "BREAKOUT" ? 10 : 18));
    const targetSign = expand && percent >= 40 ? unvisited : Math.sign(momentum || (input.random() < 0.5 ? -1 : 1));
    const drift = expand
      ? targetSign * (0.24 + input.random() * 0.08)
      : (input.random() * 2 - 1) * (input.major ? 0.08 : 0.035);
    const nextTarget = Math.max(100, Math.round(Number(input.referencePaise) * (1 + drift)));
    state.hiddenTargetPaise = BigInt(nextTarget);
  }
  const performanceBps = clampUnit(input.performance) * 6;
  const demandBps = clampUnit(input.demand) * 4;
  const newsBps = clampUnit(input.news) * 3;
  let moveBps = momentum + attraction + explore + impulse + performanceBps + demandBps + newsBps;
  const cap = input.major ? (percent < 45 ? 95 : 70) : 42;
  moveBps = Math.max(-cap, Math.min(cap, moveBps));
  if (Math.abs(moveBps) < 1.2) {
    state.pauseFor = 1;
    return idle;
  }
  state.momentumBps = moveBps * 0.62 + state.momentumBps * 0.38;
  state.lastDirection = moveBps > 0 ? 1 : -1;
  const movePpm = BigInt(Math.round(moveBps * 100));
  let midPaise = divRoundHalfAwayFromZero(input.midPaise * (1_000_000n + movePpm), 1_000_000n);
  if (midPaise < 100n) midPaise = 100n;
  if (midPaise === input.midPaise) midPaise = input.midPaise + (moveBps >= 0 ? 1n : -1n);
  return {
    moved: true,
    midPaise,
    state,
    moveBps,
    performance: input.performance,
    demand: input.demand,
    news: input.news,
    performanceBps,
    demandBps,
    newsBps,
  };
}

export function buildShowcaseHistory(input: {
  slug: string;
  referencePaise: bigint;
  now: Date;
  hours?: number;
  stepMs?: number;
}): { points: { at: Date; midPaise: bigint }[]; highPaise: bigint; lowPaise: bigint } {
  const stepMs = input.stepMs ?? 4_000;
  const hours = input.hours ?? 24;
  const steps = Math.round((hours * 60 * 60 * 1000) / stepMs);
  const random = hashRandom(`${input.slug}:history`);
  const major = MAJOR_PLAYER_SLUGS.has(input.slug);
  let state = initialShowcaseState(input.slug, input.referencePaise);
  let mid = input.referencePaise;
  let high = mid;
  let low = mid;
  const start = input.now.getTime() - hours * 60 * 60 * 1000;
  const points: { at: Date; midPaise: bigint }[] = [{ at: new Date(start), midPaise: mid }];
  for (let index = 1; index <= steps; index += 1) {
    const next = stepShowcase({
      midPaise: mid,
      referencePaise: input.referencePaise,
      highPaise: high,
      lowPaise: low,
      state,
      performance: (random() * 2 - 1) * 0.35,
      demand: (random() * 2 - 1) * 0.35,
      news: (random() * 2 - 1) * 0.2,
      major,
      random,
      rangeTarget: 50,
      volatilityScale: major ? 115 : 90,
    });
    state = next.state;
    if (!next.moved) continue;
    mid = next.midPaise;
    if (mid > high) high = mid;
    if (mid < low) low = mid;
    const extreme = mid === high || mid === low;
    if (index % 15 === 0 || extreme) points.push({ at: new Date(start + index * stepMs), midPaise: mid });
  }
  const last = points[points.length - 1];
  if (!last || last.midPaise !== mid) points.push({ at: input.now, midPaise: mid });
  else last.at = input.now;
  return { points, highPaise: high, lowPaise: low };
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}
