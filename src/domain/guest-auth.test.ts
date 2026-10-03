import { expect, test } from "vitest";
import { audienceMembership } from "./audiences";
import { visibleAuthParts } from "./auth-surface";
import { CUSTOMER_LOGO_HREF, authFlags, customerRouteAccess } from "./auth-flags";
import { CUSTOMER_NAV } from "./customer-nav";
import { intentContinuation, parseAuthIntent, readAuthIntent, signAuthIntent } from "./auth-intent";
import { currentIndicativePaise, guestTradeTotalPaise, priceUpdateNotice } from "./indicative-price";
import { readGoogleLink, signGoogleLink } from "./google-link";
import { lifecycleStage } from "./growth";
import { googleAccountDecision, normalizeInternationalPhone, shouldGrantWelcomeBonus } from "./identities";
import { INVESTOR_DEMO_EMAIL } from "./investor-demo";

test("customer logo points at the landing hero", () => {
  expect(CUSTOMER_LOGO_HREF).toBe("/#top");
});

test("market and player pages stay public while wallet and portfolio stay private", () => {
  expect(customerRouteAccess("/")).toBe("public");
  expect(customerRouteAccess("/market")).toBe("public");
  expect(customerRouteAccess("/players/virat-kohli")).toBe("public");
  expect(customerRouteAccess("/p/virat-kohli")).toBe("public");
  expect(customerRouteAccess("/home")).toBe("private");
  expect(customerRouteAccess("/portfolio")).toBe("private");
  expect(customerRouteAccess("/wallet")).toBe("private");
  expect(customerRouteAccess("/wallet/deposit")).toBe("private");
  expect(customerRouteAccess("/rewards")).toBe("private");
  expect(customerRouteAccess("/notifications")).toBe("private");
  expect(customerRouteAccess("/settings")).toBe("private");
});

test("customer navigation is the trading product, and a closed auth sheet renders nothing", () => {
  expect(CUSTOMER_NAV.map((item) => item.href)).toEqual(["/home", "/market", "/portfolio", "/wallet", "/settings"]);
  expect(CUSTOMER_NAV.map((item) => item.label)).not.toContain("Rewards");
  expect(visibleAuthParts(false)).toEqual([]);
  expect(visibleAuthParts(true)).toEqual(["sheet"]);
});

test("a buy intent keeps quantity and rejects an open redirect", () => {
  expect(parseAuthIntent({ type: "BUY", returnUrl: "https://evil.example" })).toBeNull();
  const intent = parseAuthIntent({
    type: "BUY",
    playerId: "abc12345",
    slug: "virat-kohli",
    quantity: 3,
    side: "BUY",
    seenPricePaise: "5210",
  });
  expect(intent).toMatchObject({ quantity: 3, slug: "virat-kohli", displayedIndicativePrice: "5210" });
  expect(parseAuthIntent({ type: "BUY", playerId: "abc12345", slug: "virat-kohli", quantity: 3, side: "BUY", displayedIndicativePrice: "0" })).toBeNull();
  expect(parseAuthIntent({ type: "BUY", playerId: "abc12345", slug: "virat-kohli", quantity: 3, side: "BUY" })).toBeNull();
  const token = signAuthIntent(intent!, "secret");
  expect(readAuthIntent(token, "secret")).toEqual(intent);
  expect(readAuthIntent(token, "other")).toBeNull();
});

test("google sign-in does not merge an existing email or the investor demo", () => {
  expect(googleAccountDecision({ email: INVESTOR_DEMO_EMAIL, existingBySubjectUserId: null, existingByEmailUserId: "user" })).toBe("REJECTED");
  expect(googleAccountDecision({ email: "fan@example.com", existingBySubjectUserId: null, existingByEmailUserId: "user" })).toBe("LINK_REQUIRED");
  expect(googleAccountDecision({ email: "fan@example.com", existingBySubjectUserId: "user", existingByEmailUserId: "other" })).toBe("SIGN_IN");
  expect(googleAccountDecision({ email: "new@example.com", existingBySubjectUserId: null, existingByEmailUserId: null })).toBe("CREATE");
  expect(shouldGrantWelcomeBonus(false)).toBe(false);
  expect(shouldGrantWelcomeBonus(true)).toBe(true);
});

test("mobile entry accepts India and other countries", () => {
  expect(normalizeInternationalPhone("IN", "9876543210")).toBe("+919876543210");
  expect(normalizeInternationalPhone("US", "2025550143")).toBe("+12025550143");
});

test("password fallback stays available until real providers are configured", () => {
  const flags = authFlags({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
  expect(flags.legacyPasswordEnabled).toBe(true);
  expect(flags.googleEnabled).toBe(false);
  expect(flags.phoneOtpEnabled).toBe(false);
  expect(flags.emailOtpEnabled).toBe(false);
  const simulated = authFlags({
    NODE_ENV: "production",
    DEV_AUTH_ENABLED: "true",
    AUTH_PHONE_OTP_ENABLED: "true",
    OTP_PROVIDER: "simulated",
  } as NodeJS.ProcessEnv);
  expect(simulated.phoneOtpEnabled).toBe(false);
  expect(simulated.emailOtpEnabled).toBe(false);
  expect(simulated.googleEnabled).toBe(false);
  const local = authFlags({ NODE_ENV: "development", DEV_AUTH_ENABLED: "true" } as NodeJS.ProcessEnv);
  expect(local.phoneOtpEnabled).toBe(true);
  expect(local.emailOtpEnabled).toBe(true);
  expect(local.googleEnabled).toBe(false);
});

test("a guest total uses the displayed quote and never invents ₹1", () => {
  expect(currentIndicativePaise(undefined, undefined)).toBeNull();
  expect(currentIndicativePaise("", "0")).toBeNull();
  expect(currentIndicativePaise(undefined, "8090")).toBe("8090");
  expect(currentIndicativePaise("8105", "8090")).toBe("8105");
  expect(guestTradeTotalPaise(null, 3)).toBeNull();
  expect(guestTradeTotalPaise("8090", 3)).toBe("24270");
  expect(priceUpdateNotice("8090", "8105")).toBe("Price updated\n₹80.90 → ₹81.05");
  expect(priceUpdateNotice(undefined, "8105")).toBeNull();
  expect(priceUpdateNotice("100", "8105")).toBe("Price updated\n₹1.00 → ₹81.05");
});

test("deposit intent resumes to deposit and clears, while a missing intent goes home", () => {
  expect(intentContinuation(null)).toEqual({ path: "/home", clearIntent: false });
  expect(intentContinuation({ type: "DEPOSIT" })).toEqual({ path: "/wallet/deposit", clearIntent: true });
  const buy = parseAuthIntent({
    type: "BUY",
    playerId: "abc12345",
    slug: "virat-kohli",
    quantity: 3,
    side: "BUY",
    displayedIndicativePrice: "8090",
    createdAt: 1,
  });
  expect(intentContinuation(buy)).toEqual({ path: "/players/virat-kohli?resume=1", clearIntent: false });
});

test("existing lifecycle results stay in place when the new flags are absent", () => {
  expect(lifecycleStage({
    registered: true,
    bonusReceived: false,
    depositPending: false,
    deposited: false,
    traded: false,
    cooling: false,
    churnRisk: false,
  })).toBe("REGISTERED");
  expect(lifecycleStage({
    registered: true,
    bonusReceived: false,
    depositPending: false,
    deposited: false,
    traded: false,
    cooling: false,
    churnRisk: false,
    contactVerified: true,
  })).toBe("CONTACT_VERIFIED");
});

test("a registered account with no deposit is its own audience", () => {
  expect(audienceMembership({
    registered: true,
    depositCount: 0,
    tradeCount: 0,
    lifetimeDepositPaise: 0n,
    lastTradeAt: null,
    lastDepositAt: null,
    reactivated: false,
    now: new Date("2026-10-04T00:00:00Z"),
  })).toEqual(["REGISTERED_NO_DEPOSIT"]);
});

test("a tampered google link is rejected", () => {
  const token = signGoogleLink({
    sub: "google-subject",
    email: "fan@example.com",
    givenName: "A",
    familyName: "Fan",
    name: "A Fan",
    picture: null,
  }, "secret");
  expect(readGoogleLink(token, "secret")?.email).toBe("fan@example.com");
  expect(readGoogleLink(token, "other")).toBeNull();
});
