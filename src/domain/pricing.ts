import { divRoundHalfAwayFromZero } from "./money";

/**
 * SIMULATION ONLY.
 * This is not an approved production pricing formula. It exists so local
 * development has a moving fictional price. Performance, demand, and news
 * are separate inputs so a real model can replace this function later.
 *
 * score = 0.5 * performance + 0.3 * demand + 0.2 * news, each clamped to [-1, 1]
 * move is capped at `capBps` basis points per tick (default 200 = 2%).
 * The next mid is rounded half away from zero and cannot fall below ₹1.00.
 */
export const SIMULATION_LABEL = "SIMULATION_ONLY";

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function nextSimulatedMid(input: {
  midPaise: bigint;
  performance: number;
  demand: number;
  news: number;
  capBps: number;
}): { midPaise: bigint; moveBps: number; performanceBps: number; demandBps: number; newsBps: number } {
  if (input.midPaise <= 0n) throw new Error("Mid price must be positive");
  if (!Number.isFinite(input.capBps) || input.capBps <= 0) throw new Error("Movement cap must be positive");
  const performanceUnit = clampUnit(input.performance);
  const demandUnit = clampUnit(input.demand);
  const newsUnit = clampUnit(input.news);
  const score = 0.5 * performanceUnit + 0.3 * demandUnit + 0.2 * newsUnit;
  const moveBps = Math.max(-input.capBps, Math.min(input.capBps, score * input.capBps));
  const rawMoveBps = score * input.capBps;
  const scale = rawMoveBps === 0 ? 0 : moveBps / rawMoveBps;
  const performanceBps = 0.5 * performanceUnit * input.capBps * scale;
  const demandBps = 0.3 * demandUnit * input.capBps * scale;
  const newsBps = 0.2 * newsUnit * input.capBps * scale;
  const movePpm = BigInt(Math.round(moveBps * 100));
  let midPaise = divRoundHalfAwayFromZero(input.midPaise * (1_000_000n + movePpm), 1_000_000n);
  if (midPaise < 100n) midPaise = 100n;
  return { midPaise, moveBps, performanceBps, demandBps, newsBps };
}

export function applyPriceFactorFlags(
  input: { performance: number; demand: number; news: number },
  flags: { newsPriceMovementEnabled: boolean; demandPriceMovementEnabled: boolean },
): { performance: number; demand: number; news: number } {
  return {
    performance: input.performance,
    demand: flags.demandPriceMovementEnabled ? input.demand : 0,
    news: flags.newsPriceMovementEnabled ? input.news : 0,
  };
}

export function prepareSimulatedTick(input: {
  previousMidPaise: bigint;
  performance: number;
  demand: number;
  news: number;
  capBps: number;
  newsPriceMovementEnabled: boolean;
  demandPriceMovementEnabled: boolean;
}): {
  previousMidPaise: bigint;
  midPaise: bigint;
  performance: number;
  demand: number;
  news: number;
  performanceBps: number;
  demandBps: number;
  newsBps: number;
  source: string;
  reason: string;
} {
  const factors = applyPriceFactorFlags(input, input);
  const next = nextSimulatedMid({
    midPaise: input.previousMidPaise,
    performance: factors.performance,
    demand: factors.demand,
    news: factors.news,
    capBps: input.capBps,
  });
  const reason = [
    "Simulated tick",
    "performance included",
    input.demandPriceMovementEnabled ? "demand included" : "demand held at zero",
    input.newsPriceMovementEnabled ? "news included" : "news held at zero",
  ].join(". ");
  return {
    previousMidPaise: input.previousMidPaise,
    midPaise: next.midPaise,
    performance: factors.performance,
    demand: factors.demand,
    news: factors.news,
    performanceBps: next.performanceBps,
    demandBps: next.demandBps,
    newsBps: next.newsBps,
    source: SIMULATION_LABEL,
    reason,
  };
}
