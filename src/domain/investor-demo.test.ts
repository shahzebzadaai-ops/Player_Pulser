import { describe, expect, it } from "vitest";
import { INVESTOR_DEMO_EMAIL, investorDemoEnabled, isInvestorDemoIdentity } from "./investor-demo";

describe("investor demo flag", () => {
  it("stays on unless the environment value is exactly false", () => {
    expect(investorDemoEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(investorDemoEnabled({ INVESTOR_DEMO_ENABLED: "true" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(investorDemoEnabled({ INVESTOR_DEMO_ENABLED: "false" } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("recognizes only the dedicated demo identity", () => {
    expect(isInvestorDemoIdentity({ email: INVESTOR_DEMO_EMAIL })).toBe(true);
    expect(isInvestorDemoIdentity({ email: "fan@example.com" })).toBe(false);
    expect(isInvestorDemoIdentity({ email: null })).toBe(false);
    expect(isInvestorDemoIdentity(null)).toBe(false);
  });
});
