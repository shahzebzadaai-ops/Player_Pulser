import { describe, expect, it } from "vitest";
import { changePercent, divRoundHalfAwayFromZero, formatPaise, toPaise } from "./money";
import { quoteFromMid } from "./spread";
import { splitProceeds, takeLotCost, weightedAveragePaise } from "./lots";
import {
  conversionReady,
  feedIsStale,
  planWithdrawal,
  priceChangeNeedsConfirmation,
  quoteIsFirm,
  resolveBuyFunding,
  wageringIncrement,
  WITHDRAWAL_RULE_UNRESOLVED,
} from "./rules";
import { nextSimulatedMid, prepareSimulatedTick } from "./pricing";
import { bonusIssuanceAllowed, defaultFeatureFlags } from "./features";
import { journalBalances } from "./settings";
import { devAuthAllowed, normalizeIndianPhone, passwordIssue } from "./phone";

describe("money", () => {
  it("formats paise with Indian grouping", () => {
    expect(formatPaise(245000n)).toBe("₹2,450.00");
    expect(formatPaise(8040n)).toBe("₹80.40");
    expect(formatPaise(-640n)).toBe("-₹6.40");
    expect(formatPaise(10_00_000_00n)).toBe("₹10,00,000.00");
  });

  it("rounds half away from zero", () => {
    expect(divRoundHalfAwayFromZero(5n, 2n)).toBe(3n);
    expect(divRoundHalfAwayFromZero(-5n, 2n)).toBe(-3n);
    expect(divRoundHalfAwayFromZero(1n, 3n)).toBe(0n);
  });

  it("rejects fractional paise", () => {
    expect(() => toPaise(1.5)).toThrow(/integer/);
    expect(() => toPaise("80.40")).toThrow(/integer/);
  });

  it("computes display percent without using it for settlement", () => {
    expect(changePercent(8040n, 7807n)).toBeCloseTo(2.984, 2);
  });
});

describe("spread quotes", () => {
  it("applies a 1% spread around ₹80.40", () => {
    const quote = quoteFromMid(8040n, 10_000);
    expect(quote.buyPaise).toBe(8080n);
    expect(quote.sellPaise).toBe(8000n);
  });

  it("applies a 1.25% live spread around ₹80.40", () => {
    const quote = quoteFromMid(8040n, 12_500);
    expect(quote.buyPaise).toBe(8090n);
    expect(quote.sellPaise).toBe(7990n);
  });

  it("rejects an odd spread that would split a part-per-million", () => {
    expect(() => quoteFromMid(8040n, 10_001)).toThrow(/even/);
  });
});

describe("lots and rounding", () => {
  it("keeps the last units' remaining cost exact", () => {
    const first = takeLotCost({ quantityRemaining: 3, cashCostPaise: 200n, bonusCostPaise: 100n }, 1);
    expect(first.cashTaken + first.bonusTaken).toBeLessThanOrEqual(300n);
    const rest = takeLotCost(
      {
        quantityRemaining: 2,
        cashCostPaise: 200n - first.cashTaken,
        bonusCostPaise: 100n - first.bonusTaken,
      },
      2,
    );
    expect(rest.cashTaken).toBe(200n - first.cashTaken);
    expect(rest.bonusTaken).toBe(100n - first.bonusTaken);
  });

  it("splits sale proceeds so cash and bonus sum to the quote", () => {
    const split = splitProceeds(8000n, 5000n, 3000n);
    expect(split.cashPaise + split.bonusPaise).toBe(8000n);
    expect(split.bonusPaise).toBe(3000n);
  });

  it("shows a weighted average while lots stay separate", () => {
    const average = weightedAveragePaise([
      { quantity: 10, costPaise: 70_000n },
      { quantity: 2, costPaise: 20_000n },
    ]);
    expect(average).toBe(7_500n);
  });
});

describe("bonus and withdrawal rules", () => {
  it("requires at least half cash and refuses a bonus-only buy", () => {
    const blocked = resolveBuyFunding({
      notionalPaise: 8_000n,
      requestedBonusPaise: 8_000n,
      cashAvailablePaise: 0n,
      bonusAvailablePaise: 8_000n,
      minCashPortionBps: 5_000,
    });
    expect(blocked.ok).toBe(false);
    const allowed = resolveBuyFunding({
      notionalPaise: 8_000n,
      requestedBonusPaise: null,
      cashAvailablePaise: 12_000n,
      bonusAvailablePaise: 4_000n,
      minCashPortionBps: 5_000,
    });
    expect(allowed).toEqual({ ok: true, value: { cashPaise: 4_000n, bonusPaise: 4_000n } });
  });

  it("counts buy notional toward wagering and ignores sells", () => {
    expect(wageringIncrement("BUY", 8_080n)).toBe(8_080n);
    expect(wageringIncrement("SELL", 8_000n)).toBe(0n);
  });

  it("converts only when wagering, deposits, and expiry all pass", () => {
    const now = new Date("2026-09-27T12:00:00.000Z");
    const base = {
      status: "ACTIVE" as const,
      now,
      expiresAt: new Date("2026-10-01T00:00:00.000Z"),
      wageringProgressPaise: 60_000n,
      wageringRequiredPaise: 60_000n,
      settledDepositsPaise: 50_000n,
      depositRequiredPaise: 50_000n,
    };
    expect(conversionReady(base)).toBe(true);
    expect(conversionReady({ ...base, settledDepositsPaise: 49_999n })).toBe(false);
    expect(conversionReady({ ...base, now: new Date("2026-10-02T00:00:00.000Z") })).toBe(false);
  });

  it("leaves the 5% in the wallet and blocks an unresolved small withdrawal", () => {
    const planned = planWithdrawal({
      eligibleCashPaise: 100_000n,
      minimumPaise: 50_000n,
      standardBps: 9_500,
    });
    expect(planned).toEqual({ ok: true, value: { standardPaise: 95_000n, remainderPaise: 5_000n } });
    const dust = planWithdrawal({
      eligibleCashPaise: 49_999n,
      minimumPaise: 50_000n,
      standardBps: 9_500,
    });
    expect(dust.ok).toBe(false);
    if (!dust.ok) expect(dust.code).toBe(WITHDRAWAL_RULE_UNRESOLVED);
    const awkward = planWithdrawal({
      eligibleCashPaise: 50_000n,
      minimumPaise: 50_000n,
      standardBps: 9_500,
    });
    expect(awkward.ok).toBe(false);
  });
});

describe("feed, quotes, and simulation", () => {
  it("marks a quiet feed stale and an expired quote unusable", () => {
    const now = new Date("2026-09-27T12:00:30.000Z");
    expect(feedIsStale(new Date("2026-09-27T12:00:00.000Z"), now, 30)).toBe(false);
    expect(feedIsStale(new Date("2026-09-27T11:59:00.000Z"), now, 30)).toBe(true);
    expect(feedIsStale(null, now, 30)).toBe(true);
    expect(quoteIsFirm(new Date("2026-09-27T12:00:30.000Z"), now)).toBe(true);
    expect(quoteIsFirm(new Date("2026-09-27T12:00:29.000Z"), now)).toBe(false);
  });

  it("asks for confirmation when the mid jumps past the threshold", () => {
    expect(priceChangeNeedsConfirmation(10_000n, 10_040n, 50)).toBe(false);
    expect(priceChangeNeedsConfirmation(10_000n, 10_050n, 50)).toBe(true);
  });

  it("caps a simulated tick and does not present the cap as a production rule", () => {
    const up = nextSimulatedMid({
      midPaise: 10_000n,
      performance: 1,
      demand: 1,
      news: 1,
      capBps: 200,
    });
    expect(up.midPaise).toBe(10_200n);
    expect(up.moveBps).toBe(200);
    const down = nextSimulatedMid({
      midPaise: 100n,
      performance: -1,
      demand: -1,
      news: -1,
      capBps: 200,
    });
    expect(down.midPaise).toBe(100n);
  });

  it("removes the news contribution when news movement is off", () => {
    const gated = prepareSimulatedTick({
      previousMidPaise: 10_000n,
      performance: 0,
      demand: 0,
      news: 1,
      capBps: 200,
      newsPriceMovementEnabled: false,
      demandPriceMovementEnabled: true,
    });
    const open = nextSimulatedMid({ midPaise: 10_000n, performance: 0, demand: 0, news: 1, capBps: 200 });
    expect(gated.news).toBe(0);
    expect(gated.newsBps).toBe(0);
    expect(gated.midPaise).not.toBe(open.midPaise);
    expect(gated.reason).toContain("news held at zero");
  });

  it("removes the demand contribution when demand movement is off", () => {
    const gated = prepareSimulatedTick({
      previousMidPaise: 10_000n,
      performance: 0,
      demand: 1,
      news: 0,
      capBps: 200,
      newsPriceMovementEnabled: true,
      demandPriceMovementEnabled: false,
    });
    expect(gated.demand).toBe(0);
    expect(gated.demandBps).toBe(0);
    expect(gated.midPaise).toBe(10_000n);
  });

  it("keeps performance when news and demand movement are both off", () => {
    const gated = prepareSimulatedTick({
      previousMidPaise: 10_000n,
      performance: 1,
      demand: 1,
      news: 1,
      capBps: 200,
      newsPriceMovementEnabled: false,
      demandPriceMovementEnabled: false,
    });
    expect(gated.performanceBps).not.toBe(0);
    expect(gated.demandBps).toBe(0);
    expect(gated.newsBps).toBe(0);
    expect(gated.midPaise).toBe(10_100n);
  });
});

describe("feature controls", () => {
  it("treats the bonus system and welcome bonus as separate switches", () => {
    const flags = defaultFeatureFlags();
    expect(bonusIssuanceAllowed({ ...flags, welcomeBonusEnabled: false }, "WELCOME")).toBe(false);
    expect(bonusIssuanceAllowed({ ...flags, welcomeBonusEnabled: false }, "OTHER")).toBe(true);
    expect(bonusIssuanceAllowed({ ...flags, bonusSystemEnabled: false, welcomeBonusEnabled: true }, "OTHER")).toBe(false);
    expect(bonusIssuanceAllowed(flags, "WELCOME")).toBe(true);
  });
});

describe("auth boundaries and journals", () => {
  it("keeps development login out of production", () => {
    expect(devAuthAllowed({ NODE_ENV: "production", DEV_AUTH_ENABLED: "true" })).toBe(false);
    expect(devAuthAllowed({ NODE_ENV: "development", DEV_AUTH_ENABLED: "true" })).toBe(true);
    expect(devAuthAllowed({ NODE_ENV: "development", DEV_AUTH_ENABLED: "false" })).toBe(false);
  });

  it("normalizes Indian mobile numbers", () => {
    expect(normalizeIndianPhone("9876543210")).toBe("+919876543210");
    expect(normalizeIndianPhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizeIndianPhone("12345")).toBeNull();
    expect(passwordIssue("short")).toMatch(/6\+/);
    expect(passwordIssue("longpassword")).toMatch(/number/);
    expect(passwordIssue("fan-pass-1")).toBeNull();
  });

  it("requires a journal to sum to zero", () => {
    expect(journalBalances([{ amountPaise: 100n }, { amountPaise: -100n }])).toBe(true);
    expect(journalBalances([{ amountPaise: 100n }, { amountPaise: -90n }])).toBe(false);
  });
});
