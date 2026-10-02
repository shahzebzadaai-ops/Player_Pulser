import { describe, expect, it } from "vitest";
import { PERFORMANCE_RULES } from "./pricing-engine";
import { DEFAULT_APP_SETTINGS } from "./settings";
import {
  CUSTOMER_MIN_DEPOSIT_PAISE,
  assessWelcomeBonus,
  creditFromPaymentReturn,
  customerCta,
  customerDepositAllowed,
  dataLayerEventName,
  gatewayChangeAllowed,
  indexingForPath,
  lifecycleStage,
  marketingPayload,
  otpAttemptAllowed,
  otpResendAllowed,
  signupPromptVisible,
  webhookAmountAccepted,
  webhookCurrencyAccepted,
  withinRateWindow,
} from "./growth";

describe("growth funnel and payment safety", () => {
  it("grants the welcome bonus once and holds uncertain matches for review", () => {
    expect(assessWelcomeBonus({ alreadyGranted: false, sameDeviceGrant: false, samePaymentIdentityGrant: false }).decision).toBe("GRANT");
    expect(assessWelcomeBonus({ alreadyGranted: true, sameDeviceGrant: false, samePaymentIdentityGrant: false }).decision).toBe("NOT_ELIGIBLE");
    expect(assessWelcomeBonus({ alreadyGranted: false, sameDeviceGrant: true, samePaymentIdentityGrant: false }).decision).toBe("PENDING_REVIEW");
  });

  it("limits OTP guesses and resends", () => {
    expect(otpAttemptAllowed(4)).toBe(true);
    expect(otpAttemptAllowed(5)).toBe(false);
    expect(otpResendAllowed(1_000, 20_000)).toBe(false);
    expect(otpResendAllowed(1_000, 31_000)).toBe(true);
    expect(withinRateWindow([0, 1, 2], 1_000, 60_000, 3)).toBe(false);
  });

  it("does not credit a wallet from a payment return and rejects a mismatched webhook", () => {
    expect(creditFromPaymentReturn().credited).toBe(false);
    expect(webhookAmountAccepted(100_000n, 100_000n)).toBe(true);
    expect(webhookAmountAccepted(100_000n, 50_000n)).toBe(false);
    expect(webhookAmountAccepted(100_000n, -1n)).toBe(false);
    expect(webhookCurrencyAccepted("inr")).toBe(true);
    expect(webhookCurrencyAccepted("USD")).toBe(false);
    expect(customerDepositAllowed(CUSTOMER_MIN_DEPOSIT_PAISE)).toBe(true);
    expect(customerDepositAllowed(10_000n)).toBe(false);
  });

  it("strips personal data from marketing payloads", () => {
    const safe = marketingPayload({ campaign: "india", phone: "9000000001", email: "a@b.c", amountPaise: 50000, walletBalance: 10 });
    expect(safe).toEqual({ campaign: "india", amountPaise: 50000 });
    expect(JSON.stringify(safe)).not.toContain("9000000001");
    expect(dataLayerEventName("SIGNUP_COMPLETED")).toBe("playerpulser_signup_completed");
  });

  it("moves the customer through one stage at a time", () => {
    expect(lifecycleStage({ registered: false, bonusReceived: false, depositPending: false, deposited: false, traded: false, cooling: false, churnRisk: false })).toBe("VISITOR");
    expect(customerCta("VISITOR")).toBe("signup");
    expect(lifecycleStage({ registered: true, bonusReceived: true, depositPending: false, deposited: false, traded: false, cooling: false, churnRisk: false })).toBe("BONUS_RECEIVED");
    expect(customerCta("BONUS_RECEIVED")).toBe("deposit");
    expect(lifecycleStage({ registered: true, bonusReceived: true, depositPending: false, deposited: true, traded: false, cooling: false, churnRisk: false })).toBe("FIRST_DEPOSITOR");
    expect(customerCta("FIRST_DEPOSITOR")).toBe("trade");
    expect(lifecycleStage({ registered: true, bonusReceived: true, depositPending: false, deposited: true, traded: true, cooling: false, churnRisk: false })).toBe("ACTIVE");
  });

  it("respects a dismissed signup prompt and indexes only public policies", () => {
    expect(signupPromptVisible({ dismissedAtMs: null, nowMs: 20_000, elapsedMs: 5_000 })).toBe(false);
    expect(signupPromptVisible({ dismissedAtMs: null, nowMs: 20_000, elapsedMs: 12_000 })).toBe(true);
    expect(signupPromptVisible({ dismissedAtMs: 10_000, nowMs: 20_000, elapsedMs: 20_000 })).toBe(false);
    expect(indexingForPath("/terms")).toBe("index");
    expect(indexingForPath("/admin/money/gateways/banking")).toBe("noindex");
    expect(indexingForPath("/wallet/deposit")).toBe("noindex");
  });

  it("requires a reason and permission before a gateway change", () => {
    expect(gatewayChangeAllowed({ permission: true, reason: "Maintenance window" })).toBe(true);
    expect(gatewayChangeAllowed({ permission: false, reason: "Maintenance window" })).toBe(false);
    expect(gatewayChangeAllowed({ permission: true, reason: "no" })).toBe(false);
  });

  it("does not alter approved pricing defaults", () => {
    expect(DEFAULT_APP_SETTINGS.engineMode).toBe("SIMULATION");
    expect(DEFAULT_APP_SETTINGS.bonusWelcomePaise).toBe(20_000n);
    expect(PERFORMANCE_RULES.SIX.bps).toBe(30);
  });
});
