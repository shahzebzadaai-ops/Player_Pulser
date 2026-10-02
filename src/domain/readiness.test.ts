import { describe, expect, it } from "vitest";
import { marketingTagsAllowed, needsPolicyReacceptance } from "./consent";
import { customerDepositAllowed } from "./growth";
import { canExpirePayment, normalizePaymentStatus, paymentExpired, safeProviderIdentity } from "./payment-lifecycle";
import { POLICY_VERSIONS } from "./policy-versions";

describe("production readiness rules", () => {
  it("maps stored settlement to success and expires only pending payments", () => {
    expect(normalizePaymentStatus("SETTLED")).toBe("SUCCESS");
    expect(normalizePaymentStatus("PENDING")).toBe("PENDING");
    expect(canExpirePayment("PENDING")).toBe(true);
    expect(canExpirePayment("SETTLED")).toBe(false);
    expect(paymentExpired(new Date(0), new Date(31 * 60 * 1000), 30 * 60 * 1000)).toBe(true);
  });

  it("keeps consent history and separates marketing consent", () => {
    const current = { policyType: "TERMS", version: POLICY_VERSIONS.terms, termsVersion: POLICY_VERSIONS.terms, privacyVersion: POLICY_VERSIONS.privacy };
    expect(needsPolicyReacceptance([current], "TERMS")).toBe(false);
    expect(needsPolicyReacceptance([current], "TERMS", "terms-later")).toBe(true);
    expect(marketingTagsAllowed({ termsAccepted: true, marketingConsent: null })).toBe(false);
    expect(marketingTagsAllowed({ termsAccepted: true, marketingConsent: "granted" })).toBe(true);
  });

  it("drops raw card numbers and still allows a missing provider identity", () => {
    expect(safeProviderIdentity({ payerReference: "4242424242424242" }).payerReference).toBeNull();
    expect(safeProviderIdentity({ providerCustomerId: "cust_123" }).providerCustomerId).toBe("cust_123");
    expect(safeProviderIdentity({}).providerCustomerId).toBeNull();
    expect(customerDepositAllowed(-1n)).toBe(false);
    expect(customerDepositAllowed(10_000_000_000n)).toBe(false);
  });
});
