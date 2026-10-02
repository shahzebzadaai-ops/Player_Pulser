import { divCeilPositive } from "./money";

export type RuleResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

export function fail<T = never>(code: string, message: string): RuleResult<T> {
  return { ok: false, code, message };
}

export const WITHDRAWAL_RULE_UNRESOLVED = "WITHDRAWAL_RULE_UNRESOLVED";

/**
 * Proposed buy funding rule, taken from the trade-ticket design:
 * bonus cannot pay for a buy on its own, and at least `minCashPortionBps`
 * of the notional must be cash. 5000 bps = 50%.
 *
 * When requested bonus is omitted, the largest allowed bonus is used.
 * The server never spends more bonus to paper over a cash shortfall.
 */
export function resolveBuyFunding(input: {
  notionalPaise: bigint;
  requestedBonusPaise: bigint | null;
  cashAvailablePaise: bigint;
  bonusAvailablePaise: bigint;
  minCashPortionBps: number;
}): RuleResult<{ cashPaise: bigint; bonusPaise: bigint }> {
  if (input.notionalPaise <= 0n) return fail("NOTIONAL", "Trade amount must be positive.");
  if (!Number.isInteger(input.minCashPortionBps) || input.minCashPortionBps <= 0 || input.minCashPortionBps > 10_000) {
    return fail("CONFIG", "The cash portion rule is not configured correctly.");
  }
  const minCash = divCeilPositive(input.notionalPaise * BigInt(input.minCashPortionBps), 10_000n);
  const maxBonus = input.notionalPaise - minCash;
  let bonus = input.requestedBonusPaise ?? maxBonus;
  if (bonus < 0n) bonus = 0n;
  if (bonus > maxBonus) bonus = maxBonus;
  if (bonus > input.bonusAvailablePaise) bonus = input.bonusAvailablePaise;
  const cash = input.notionalPaise - bonus;
  if (cash < minCash || bonus === input.notionalPaise) {
    return fail(
      "BONUS_CASH_MINIMUM",
      "Bonus cannot be used alone. At least half of each buy must be paid with cash.",
    );
  }
  if (cash > input.cashAvailablePaise) {
    return fail("INSUFFICIENT_CASH", "Cash balance is not enough for this buy.");
  }
  return { ok: true, value: { cashPaise: cash, bonusPaise: bonus } };
}

/** Proposed wagering rule: completed buy notional counts. Sells do not. */
export function wageringIncrement(side: "BUY" | "SELL", notionalPaise: bigint): bigint {
  if (notionalPaise < 0n) return 0n;
  return side === "BUY" ? notionalPaise : 0n;
}

export function conversionReady(input: {
  status: string;
  now: Date;
  expiresAt: Date;
  wageringProgressPaise: bigint;
  wageringRequiredPaise: bigint;
  settledDepositsPaise: bigint;
  depositRequiredPaise: bigint;
}): boolean {
  return (
    input.status === "ACTIVE" &&
    input.now.getTime() < input.expiresAt.getTime() &&
    input.wageringProgressPaise >= input.wageringRequiredPaise &&
    input.settledDepositsPaise >= input.depositRequiredPaise
  );
}

/**
 * Standard withdrawal is 95% of eligible cash, rounded down to a paise.
 * The other 5% stays in cash. It is not a fee.
 * Below-minimum and full-balance cases are refused until the business rule is decided.
 */
export function planWithdrawal(input: {
  eligibleCashPaise: bigint;
  minimumPaise: bigint;
  standardBps: number;
}): RuleResult<{ standardPaise: bigint; remainderPaise: bigint }> {
  if (input.eligibleCashPaise <= 0n) {
    return fail("NOTHING_TO_WITHDRAW", "There is no withdrawable cash.");
  }
  if (!Number.isInteger(input.standardBps) || input.standardBps <= 0 || input.standardBps >= 10_000) {
    return fail("CONFIG", "The withdrawal portion is not configured correctly.");
  }
  const standardPaise = (input.eligibleCashPaise * BigInt(input.standardBps)) / 10_000n;
  const remainderPaise = input.eligibleCashPaise - standardPaise;
  if (input.eligibleCashPaise < input.minimumPaise || standardPaise < input.minimumPaise) {
    return fail(
      WITHDRAWAL_RULE_UNRESOLVED,
      "Withdrawing less than ₹500, including taking the final balance, is an open business decision. Your cash stays in the wallet.",
    );
  }
  return { ok: true, value: { standardPaise, remainderPaise } };
}

export function priceChangeNeedsConfirmation(
  seenMidPaise: bigint,
  currentMidPaise: bigint,
  thresholdBps: number,
): boolean {
  if (seenMidPaise <= 0n || thresholdBps < 0) return false;
  const diff = currentMidPaise > seenMidPaise ? currentMidPaise - seenMidPaise : seenMidPaise - currentMidPaise;
  return diff * 10_000n >= seenMidPaise * BigInt(thresholdBps);
}

export function feedIsStale(lastTickAt: Date | null, now: Date, staleAfterSeconds: number): boolean {
  if (!lastTickAt) return true;
  return now.getTime() - lastTickAt.getTime() > staleAfterSeconds * 1000;
}

export function quoteIsFirm(expiresAt: Date, now: Date): boolean {
  return now.getTime() <= expiresAt.getTime();
}
