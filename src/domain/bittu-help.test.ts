import { describe, expect, it } from "vitest";
import { BITTU_POSES } from "./bittu";
import {
  BITTU_UNCERTAIN,
  bittuAiConfigured,
  helpFacts,
  helpTopics,
  matchHelpTopic,
  plainHelpText,
  SUGGESTED_QUESTIONS,
} from "./bittu-help";

const facts = helpFacts({
  welcomePaise: 20_000n,
  validityDays: 14,
  wageringMultiplier: 3,
  qualifyingDepositPaise: 50_000n,
  withdrawalMinPaise: 50_000n,
  cashPortionBps: 5_000,
  depositsEnabled: true,
  withdrawalsEnabled: true,
  welcomeBonusEnabled: true,
  bonusSystemEnabled: true,
  liveTradingEnabled: true,
  demoEnabled: true,
  demoCashPaise: 500_000n,
});

describe("Bittu help topics", () => {
  it("answers the suggested questions from the supplied rules", () => {
    const topics = helpTopics(facts);
    expect(topics.map((topic) => topic.question)).toEqual([...SUGGESTED_QUESTIONS]);
    const byId = Object.fromEntries(topics.map((topic) => [topic.id, topic.answer]));
    expect(byId["how-it-works"]).toContain("not guaranteed");
    expect(byId.browse).toContain("without an account");
    expect(byId["buy-sell"]).toContain("50%");
    expect(byId.prices).toContain("spread");
    expect(byId["cash-bonus"]).toContain("Withdrawable cash");
    expect(byId.welcome).toContain("₹200.00");
    expect(byId.welcome).toContain("14 days");
    expect(byId.payments).toContain("UPI");
    expect(byId.payments).toContain("100%");
    expect(byId.payments).not.toContain("95%");
    expect(byId.payments).not.toContain("crypto");
    expect(byId.demo).toContain("₹5,000.00");
    expect(byId.account).toContain("Complaints");
  });

  it("matches a typed question and stays quiet when the topic is unknown", () => {
    expect(matchHelpTopic("How does the welcome bonus work?", facts)?.id).toBe("welcome");
    expect(matchHelpTopic("Can I withdraw my cash?", facts)?.id).toBe("payments");
    expect(matchHelpTopic("What is the weather in Mumbai?", facts)).toBeNull();
    expect(BITTU_UNCERTAIN).toContain("not sure");
  });

  it("changes payment and bonus answers when those features are off", () => {
    const paused = helpTopics({ ...facts, depositsEnabled: false, withdrawalsEnabled: false, welcomeBonusEnabled: false });
    const payments = paused.find((topic) => topic.id === "payments")?.answer ?? "";
    const welcome = paused.find((topic) => topic.id === "welcome")?.answer ?? "";
    expect(payments).toContain("Deposits are temporarily unavailable.");
    expect(payments).toContain("Withdrawals are temporarily unavailable.");
    expect(welcome).toContain("New welcome bonuses are paused.");
  });

  it("keeps replies as plain text and treats a missing key as unconfigured", () => {
    expect(plainHelpText("<script>alert(1)</script> Hello   there")).toBe("alert(1) Hello there");
    expect(bittuAiConfigured({} as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(bittuAiConfigured({ BITTU_AI_API_KEY: " " } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(bittuAiConfigured({ BITTU_AI_API_KEY: "sk-test" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });

  it("catalogs every supplied pose and leaves the missing number out", () => {
    expect(Object.keys(BITTU_POSES)).toHaveLength(22);
    expect(BITTU_POSES.present.src).toBe("/bittu/pose-19.webp");
    expect(BITTU_POSES.launcher.src).toBe("/bittu/avatar.webp");
    expect(JSON.stringify(BITTU_POSES)).not.toContain("pose-16");
  });
});
