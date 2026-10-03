/**
 * Temporary investor demo.
 *
 * Enabled unless INVESTOR_DEMO_ENABLED is exactly "false".
 * To turn it off, set INVESTOR_DEMO_ENABLED=false in the web app environment
 * and restart the web process. New demo sessions are rejected and the landing
 * button is hidden. An existing demo session can still use Exit Demo.
 * Leave the implementation in place. Do not delete it to disable the demo.
 */
export const INVESTOR_DEMO_EMAIL = "investor-demo@playerpulser.invalid";
export const INVESTOR_DEMO_NAME = "Investor Demo";
/** ₹5,000 in paise. */
export const INVESTOR_DEMO_CASH_PAISE = 500_000n;
export const INVESTOR_DEMO_HOLDING_SLUG = "virat-kohli";

export function investorDemoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.INVESTOR_DEMO_ENABLED !== "false";
}

export function isInvestorDemoIdentity(user: { email?: string | null } | null | undefined): boolean {
  return user?.email === INVESTOR_DEMO_EMAIL;
}
