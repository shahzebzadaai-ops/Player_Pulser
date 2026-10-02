import { describe, expect, it } from "vitest";
import { fairValue } from "./pricing-engine";
import { hasPermission } from "./permissions";
import { attentionItems } from "./reporting";
import { requireReason } from "@/server/audit";
import {
  assessTrade,
  concentrationAlert,
  customerRiskMessage,
  DEFAULT_RISK_LIMITS,
  effectiveRiskState,
  planRiskTransition,
  riskAttention,
  riskMetricsSnapshot,
  riskSettingAffectsState,
  riskSettingRequiresReason,
  StaticRiskCapacityProvider,
  usageState,
  type TradeAdmission,
} from "./risk";

const limits = DEFAULT_RISK_LIMITS;

function admission(overrides: Partial<TradeAdmission> = {}): TradeAdmission {
  return {
    side: "BUY",
    quantity: 1,
    midPaise: 10_000n,
    userPlayerQuantity: 0,
    userTotalNotionalPaise: 0n,
    playerOutstanding: 0,
    manualMode: "AUTO",
    maxUserPlayerExposurePaise: limits.maxUserPlayerExposurePaise,
    maxUserTotalExposurePaise: limits.maxUserTotalExposurePaise,
    maxPlatformPlayerLiabilityPaise: limits.maxPlatformPlayerLiabilityPaise,
    warningThresholdPct: limits.warningThresholdPct,
    restrictedThresholdPct: limits.restrictedThresholdPct,
    ...overrides,
  };
}

describe("trade admission", () => {
  it("accepts a buy that stays inside every limit", () => {
    expect(assessTrade(admission()).ok).toBe(true);
  });

  it("rejects a buy over the user player limit", () => {
    const result = assessTrade(admission({
      quantity: 2,
      midPaise: 6_000_000n,
      maxUserPlayerExposurePaise: 10_000_000n,
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("USER_PLAYER_LIMIT");
  });

  it("rejects a buy over the user total limit", () => {
    const result = assessTrade(admission({
      quantity: 1,
      midPaise: 1_000n,
      userTotalNotionalPaise: 50_000_000n,
      maxUserTotalExposurePaise: 50_000_000n,
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("USER_TOTAL_LIMIT");
  });

  it("rejects a buy over the platform player limit", () => {
    const result = assessTrade(admission({
      quantity: 1,
      midPaise: 1_000n,
      playerOutstanding: 0,
      maxPlatformPlayerLiabilityPaise: 500n,
      warningThresholdPct: 101,
      restrictedThresholdPct: 101,
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("PLAYER_PLATFORM_LIMIT");
  });

  it("allows a reducing sell while restricted and blocks it when all trading is paused", () => {
    const restricted = assessTrade(admission({
      side: "SELL",
      manualMode: "PAUSE_BUYS",
      userPlayerQuantity: 2,
    }));
    expect(restricted).toEqual({ ok: true, state: "RESTRICTED" });
    const paused = assessTrade(admission({ side: "SELL", manualMode: "PAUSE_ALL", userPlayerQuantity: 2 }));
    expect(paused.ok).toBe(false);
    if (!paused.ok) expect(paused.reason).toBe("TRADING_PAUSED");
  });

  it("does not change fair value while it admits or rejects a trade", () => {
    const price = {
      midPaise: 10_000n,
      anchorPaise: 10_000n,
      performanceBps: 30,
      demandBps: 10,
      newsBps: -5,
      circuitBreakerBps: 1800,
    };
    const before = fairValue(price);
    const decision = assessTrade(admission({ midPaise: price.midPaise, quantity: 100 }));
    expect(fairValue(price)).toEqual(before);
    expect(decision).not.toHaveProperty("midPaise");
    expect(before.performanceBps).toBe(30);
    expect(before.demandBps).toBe(10);
    expect(before.newsBps).toBe(-5);
  });
});

describe("states, concentration, and controls", () => {
  it("marks warning at 70 percent and restricted at 90 percent", () => {
    expect(usageState(699n, 1_000n, 70, 90)).toBe("NORMAL");
    expect(usageState(700n, 1_000n, 70, 90)).toBe("WARNING");
    expect(usageState(899n, 1_000n, 70, 90)).toBe("WARNING");
    expect(usageState(900n, 1_000n, 70, 90)).toBe("RESTRICTED");
    expect(effectiveRiskState("AUTO", "WARNING")).toBe("WARNING");
    expect(effectiveRiskState("PAUSE_BUYS", "NORMAL")).toBe("RESTRICTED");
    expect(effectiveRiskState("PAUSE_ALL", "NORMAL")).toBe("PAUSED");
  });

  it("alerts when one holder reaches the concentration threshold", () => {
    expect(concentrationAlert(9, 100, 10)).toBe(false);
    expect(concentrationAlert(10, 100, 10)).toBe(true);
    const alerts = riskAttention([
      { playerId: "p1", name: "Virat", state: "WARNING", limitUsedPct: 84, concentrationAlert: true },
      { playerId: "p2", name: "Bumrah", state: "RESTRICTED", limitUsedPct: 92, concentrationAlert: false },
    ]);
    expect(alerts.map((item) => item.label)).toEqual([
      "Virat exposure at 84%",
      "Large user concentration detected · Virat",
      "Bumrah exposure at 92%",
      "Bumrah is in RESTRICTED state",
    ]);
    expect(attentionItems({
      pendingWithdrawals: 0,
      paymentsNeedingAttention: 0,
      worker: "HEALTHY",
      bannersExpiring: 0,
      highValueChurn: 0,
      disabledFeatures: [],
      riskAlerts: alerts.slice(0, 1),
    })[0]?.label).toBe("Virat exposure at 84%");
  });

  it("rejects new buys after pause buys, and both sides after pause all trading", () => {
    const buysPaused = assessTrade(admission({ manualMode: "PAUSE_BUYS" }));
    expect(buysPaused.ok).toBe(false);
    if (!buysPaused.ok) expect(buysPaused.reason).toBe("BUYS_PAUSED");
    const allPaused = assessTrade(admission({ manualMode: "PAUSE_ALL" }));
    expect(allPaused.ok).toBe(false);
    if (!allPaused.ok) expect(allPaused.reason).toBe("TRADING_PAUSED");
  });

  it("gives risk view to analysts, manage without emergency pause to operations, and requires a reason", () => {
    expect(hasPermission("ANALYST", "risk.view")).toBe(true);
    expect(hasPermission("ANALYST", "risk.manage")).toBe(false);
    expect(hasPermission("ANALYST", "risk.pause")).toBe(false);
    expect(hasPermission("OPERATIONS_MANAGER", "risk.view")).toBe(true);
    expect(hasPermission("OPERATIONS_MANAGER", "risk.manage")).toBe(true);
    expect(hasPermission("OPERATIONS_MANAGER", "risk.pause")).toBe(false);
    expect(hasPermission("SUPER_ADMIN", "risk.pause")).toBe(true);
    expect(hasPermission("FINANCE", "risk.view")).toBe(true);
    expect(hasPermission("FINANCE", "risk.manage")).toBe(false);
    expect(riskSettingRequiresReason("risk.maxUserPlayerExposurePaise")).toBe(true);
    expect(riskSettingRequiresReason("spread.normalPpm")).toBe(false);
    expect(requireReason("cap")).toBe("cap");
    expect(() => requireReason("no")).toThrow(/reason/i);
  });
});

const bands = { platformLimitPaise: 1_000n, warningThresholdPct: 70, restrictedThresholdPct: 90 };

describe("automatic state changes", () => {
  it("raises warning and restricted as marked exposure rises, then returns as it falls", () => {
    const warning = planRiskTransition({
      storedState: "NORMAL",
      manualMode: "AUTO",
      markedPaise: 700n,
      ...bands,
    });
    expect(warning).toEqual({ state: "WARNING", previousState: "NORMAL", writeHistory: true });
    const restricted = planRiskTransition({
      storedState: "WARNING",
      manualMode: "AUTO",
      markedPaise: 900n,
      ...bands,
    });
    expect(restricted).toEqual({ state: "RESTRICTED", previousState: "WARNING", writeHistory: true });
    const eased = planRiskTransition({
      storedState: "RESTRICTED",
      manualMode: "AUTO",
      markedPaise: 700n,
      ...bands,
    });
    expect(eased).toEqual({ state: "WARNING", previousState: "RESTRICTED", writeHistory: true });
    const cleared = planRiskTransition({
      storedState: "WARNING",
      manualMode: "AUTO",
      markedPaise: 100n,
      ...bands,
    });
    expect(cleared).toEqual({ state: "NORMAL", previousState: "WARNING", writeHistory: true });
  });

  it("keeps pause buys above the automatic state and pause all above everything", () => {
    const buys = planRiskTransition({ storedState: "NORMAL", manualMode: "PAUSE_BUYS", markedPaise: 0n, ...bands });
    expect(buys.state).toBe("RESTRICTED");
    const buysHeld = planRiskTransition({ storedState: "RESTRICTED", manualMode: "PAUSE_BUYS", markedPaise: 0n, ...bands });
    expect(buysHeld.writeHistory).toBe(false);
    const paused = planRiskTransition({ storedState: "RESTRICTED", manualMode: "PAUSE_ALL", markedPaise: 900n, ...bands });
    expect(paused).toEqual({ state: "PAUSED", previousState: "RESTRICTED", writeHistory: true });
    const held = planRiskTransition({ storedState: "PAUSED", manualMode: "PAUSE_ALL", markedPaise: 0n, ...bands });
    expect(held.writeHistory).toBe(false);
    expect(effectiveRiskState("PAUSE_ALL", "NORMAL")).toBe("PAUSED");
  });

  it("does not ask for another history row when the state is unchanged", () => {
    const again = planRiskTransition({ storedState: "WARNING", manualMode: "AUTO", markedPaise: 750n, ...bands });
    expect(again.writeHistory).toBe(false);
    expect(again.state).toBe("WARNING");
  });

  it("keeps customer messages free of platform liability", () => {
    const messages = [
      customerRiskMessage("USER_PLAYER_LIMIT"),
      customerRiskMessage("USER_TOTAL_LIMIT"),
      customerRiskMessage("PLAYER_PLATFORM_LIMIT"),
      customerRiskMessage("BUYS_PAUSED"),
      customerRiskMessage("TRADING_PAUSED"),
    ];
    expect(messages[0]).toBe("You've reached the current position limit for this player.");
    expect(messages[1]).toBe("You've reached your current total position limit.");
    expect(messages[2]).toBe("New buys are temporarily unavailable for this player.");
    expect(messages[3]).toBe(messages[2]);
    expect(messages[4]).toBe("Trading is temporarily unavailable for this player.");
    for (const message of messages) {
      expect(message.toLowerCase()).not.toMatch(/liability|platform limit|company exposure|other user/);
    }
  });

  it("uses the configured platform limit from the static capacity provider", () => {
    const configured = 500n;
    const capacity = new StaticRiskCapacityProvider().quote({ configuredPlatformLimitPaise: configured });
    expect(capacity.availableRiskCapitalPaise).toBe(configured);
    expect(capacity.recommendedPlayerLimitPaise).toBe(configured);
    const input = { quantity: 1, midPaise: 600n, warningThresholdPct: 101, restrictedThresholdPct: 101 };
    const direct = assessTrade(admission({ ...input, maxPlatformPlayerLiabilityPaise: configured }));
    const throughProvider = assessTrade(admission({ ...input, maxPlatformPlayerLiabilityPaise: capacity.recommendedPlayerLimitPaise }));
    expect(throughProvider).toEqual(direct);
    const snapshot = riskMetricsSnapshot({
      midPaise: 10n,
      outstanding: 4,
      markedPaise: 40n,
      platformLimitPaise: configured,
      limitUsedPct: 8,
      largestHolderQuantity: 3,
      largestHolderPct: 75,
      top10SharePct: 100,
      unrealizedPaise: -5n,
      manualMode: "AUTO",
    });
    expect(Object.keys(snapshot).sort()).toEqual([
      "customerUnrealizedPnlPaise",
      "largestHolderPct",
      "largestHolderPulsers",
      "limitUsedPct",
      "manualMode",
      "markedValuePaise",
      "midPricePaise",
      "outstandingPulsers",
      "platformLimitPaise",
      "top10ConcentrationPct",
    ]);
    expect(snapshot.platformLimitPaise).toBe("500");
    expect(riskSettingAffectsState("risk.warningThresholdPct")).toBe(true);
    expect(riskSettingAffectsState("risk.maxPlatformPlayerLiabilityPaise")).toBe(true);
    expect(riskSettingAffectsState("risk.restrictedThresholdPct")).toBe(true);
    expect(riskSettingAffectsState("risk.singleUserConcentrationAlertPct")).toBe(true);
    expect(riskSettingAffectsState("risk.maxUserPlayerExposurePaise")).toBe(false);
  });
});
