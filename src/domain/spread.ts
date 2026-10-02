import { divRoundHalfAwayFromZero } from "./money";

/**
 * Quote construction from a mid price.
 *
 * This is a proposed, configurable rule. It is not an approved production
 * market-making policy. See docs/trading-and-pricing.md before changing it.
 *
 * spreadPpm is parts per million of the mid. 1% = 10_000. 1.25% = 12_500.
 * The value must be an even non-negative integer so half the spread is an
 * integer number of parts per million.
 *
 * buy  = round_half_away(mid * (1_000_000 + spreadPpm / 2) / 1_000_000)
 * sell = round_half_away(mid * (1_000_000 - spreadPpm / 2) / 1_000_000)
 *
 * The gap between the quotes is the configured spread, before paise rounding.
 * Rounding uses half away from zero on the exact rational result.
 */
export const SPREAD_SCALE = 1_000_000n;

export type SpreadQuote = {
  midPaise: bigint;
  spreadPpm: number;
  buyPaise: bigint;
  sellPaise: bigint;
};

export function quoteFromMid(midPaise: bigint, spreadPpm: number): SpreadQuote {
  if (midPaise <= 0n) throw new Error("Mid price must be positive");
  if (!Number.isInteger(spreadPpm) || spreadPpm < 0 || spreadPpm % 2 !== 0) {
    throw new Error("Spread must be a non-negative even integer in parts per million");
  }
  if (spreadPpm >= Number(SPREAD_SCALE)) throw new Error("Spread must stay below 100%");

  const half = BigInt(spreadPpm / 2);
  let buyPaise = divRoundHalfAwayFromZero(midPaise * (SPREAD_SCALE + half), SPREAD_SCALE);
  let sellPaise = divRoundHalfAwayFromZero(midPaise * (SPREAD_SCALE - half), SPREAD_SCALE);
  if (buyPaise < 1n) buyPaise = 1n;
  if (sellPaise < 1n) sellPaise = 1n;
  if (sellPaise >= buyPaise) {
    sellPaise = buyPaise - 1n;
    if (sellPaise < 1n) {
      buyPaise = 2n;
      sellPaise = 1n;
    }
  }
  return { midPaise, spreadPpm, buyPaise, sellPaise };
}
