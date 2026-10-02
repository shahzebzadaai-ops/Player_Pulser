import { describe, expect, it } from "vitest";
import { classifyTouch, parseAttributionSearch, sourceBucket } from "./attribution";
import { isChurnRisk, isHighValue } from "./crm";
import { DEFAULT_APP_SETTINGS } from "./settings";
import { isVip, vipReasons } from "./vip";
import { attentionItems, operationalNgr, ratesAreComparable, summarizeBonus, trackingWarning } from "./reporting";

describe("bonus reporting", () => {
  it("does not treat an unused grant as realized bonus cost", () => {
    const report = summarizeBonus([
      { entryType: "BONUS_GRANT", account: "USER_BONUS", amountPaise: 20_000n },
      { entryType: "BONUS_GRANT", account: "OFFSET_BONUS", amountPaise: -20_000n },
    ]);
    expect(report.issuedPaise).toBe(20_000n);
    expect(report.usedPaise).toBe(0n);
    expect(report.realizedCostPaise).toBe(0n);
    expect(operationalNgr({ ggrPaise: 500n, realizedBonusCostPaise: report.realizedCostPaise })).toBe(500n);
  });

  it("realizes only converted cash, and keeps used bonus separate", () => {
    const report = summarizeBonus([
      { entryType: "BONUS_GRANT", account: "USER_BONUS", amountPaise: 20_000n },
      { entryType: "TRADE_BUY", account: "USER_BONUS", amountPaise: -4_000n },
      { entryType: "BONUS_CONVERT", account: "USER_CASH", amountPaise: 1_500n },
      { entryType: "BONUS_EXPIRE", account: "USER_BONUS", amountPaise: -6_000n },
    ]);
    expect(report.usedPaise).toBe(4_000n);
    expect(report.expiredPaise).toBe(6_000n);
    expect(report.convertedPaise).toBe(1_500n);
    expect(report.realizedCostPaise).toBe(1_500n);
    expect(report.realizedCostPaise).not.toBe(report.issuedPaise);
  });
});

describe("tracking coverage", () => {
  it("warns when the window starts before the first visitor", () => {
    const first = new Date("2026-09-27T18:00:00.000Z");
    const warning = trackingWarning(new Date("2026-09-01T00:00:00.000Z"), first);
    expect(warning).toContain("Visitor and acquisition data is available only from");
    expect(warning).toContain("Financial/account metrics may include older records.");
    expect(ratesAreComparable(new Date("2026-09-01T00:00:00.000Z"), first)).toBe(false);
    expect(ratesAreComparable(new Date("2026-09-28T00:00:00.000Z"), first)).toBe(true);
    expect(trackingWarning(new Date("2026-09-28T00:00:00.000Z"), first)).toBeNull();
  });
});

describe("microsoft clicks", () => {
  it("stores msclkid without a source as microsoft paid search", () => {
    const touch = classifyTouch(parseAttributionSearch("msclkid=click-1"), null);
    expect(touch.source).toBe("microsoft");
    expect(touch.medium).toBe("paid_search");
    expect(sourceBucket("microsoft")).toBe("Microsoft");
    expect(sourceBucket("bing")).toBe("Microsoft");
  });
});

describe("CRM thresholds and VIP", () => {
  it("uses the configured high-value and churn settings", () => {
    expect(DEFAULT_APP_SETTINGS.highValueDepositThresholdPaise).toBe(1_000_000n);
    expect(DEFAULT_APP_SETTINGS.churnRiskInactiveDays).toBe(14);
    expect(isHighValue(999_999n, 1_000_000n)).toBe(false);
    expect(isHighValue(1_000_000n, 1_000_000n)).toBe(true);
    const now = new Date("2026-09-27T00:00:00.000Z");
    expect(isChurnRisk({
      accountCreatedAt: new Date("2026-08-01T00:00:00.000Z"),
      lastTradeAt: new Date("2026-09-20T00:00:00.000Z"),
      now,
      inactiveDays: 14,
    })).toBe(false);
    expect(isChurnRisk({
      accountCreatedAt: new Date("2026-08-01T00:00:00.000Z"),
      lastTradeAt: new Date("2026-09-01T00:00:00.000Z"),
      now,
      inactiveDays: 14,
    })).toBe(true);
  });

  it("uses one VIP rule for segment, status, and an open task", () => {
    const quiet = { segmentNames: ["Holders"], openVipTask: false };
    expect(isVip(quiet)).toBe(false);
    expect(vipReasons({ ...quiet, segmentNames: ["vip"] })).toEqual(["VIP segment"]);
    expect(vipReasons({ ...quiet, explicitVip: true })).toEqual(["Explicit VIP status"]);
    expect(vipReasons({ ...quiet, openVipTask: true })).toEqual(["Open VIP call task"]);
    expect(isVip({ segmentNames: ["VIP"], explicitVip: true, openVipTask: true })).toBe(true);
  });
});

describe("overview attention", () => {
  it("stays quiet when nothing needs action and lists each live issue", () => {
    expect(attentionItems({
      pendingWithdrawals: 0,
      paymentsNeedingAttention: 0,
      worker: "HEALTHY",
      bannersExpiring: 0,
      highValueChurn: 0,
      disabledFeatures: [],
    })).toEqual([]);
    const items = attentionItems({
      pendingWithdrawals: 2,
      paymentsNeedingAttention: 1,
      worker: "DOWN",
      bannersExpiring: 1,
      highValueChurn: 3,
      disabledFeatures: ["Live trading"],
    });
    expect(items.map((item) => item.href)).toEqual([
      "/admin/money/withdrawals",
      "/admin/payments",
      "/admin/operations/health",
      "/admin/content/banners",
      "/admin/customers/crm",
      "/admin/operations/features",
    ]);
  });
});
