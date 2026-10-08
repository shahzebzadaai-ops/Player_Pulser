import { readFileSync } from "fs";
import { describe, expect, test } from "vitest";
import { isInvestorDemoIdentity } from "./investor-demo";
import {
  COMING_SOON_HEADLINE,
  hashPreviewToken,
  PREVIEW_COOKIE,
  PREVIEW_MAX_AGE_SECONDS,
  PREVIEW_TOKEN_BYTES,
  PREVIEW_TTL_MS,
  previewCookieOptions,
  PRIVATE_RESPONSE_HEADERS,
  readPreviewCookie,
  sessionExpiresAt,
  shieldAccess,
  signPreviewCookie,
  unusedLinkExpiresAt,
} from "./launch-shield";

const secret = "test-secret-test-secret-test-secret";

describe("launch shield routes", () => {
  test("public home is the coming soon page and does not render the product", () => {
    const page = readFileSync("src/app/page.tsx", "utf8");
    const view = readFileSync("src/components/coming-soon.tsx", "utf8");
    expect(COMING_SOON_HEADLINE).toBe("Feel the Pulse of the Game.");
    expect(view).toContain("COMING_SOON_HEADLINE");
    expect(view).not.toContain("PriceText");
    expect(page).not.toContain("listPlayers");
    expect(shieldAccess({ pathname: "/", previewValid: false }).action).toBe("next");
    expect(shieldAccess({ pathname: "/coming-soon", previewValid: false }).surface).toBe("public");
  });

  test("customer routes stay closed without a preview session", () => {
    for (const pathname of ["/home", "/market", "/players/test", "/p/virat-kohli", "/portfolio", "/wallet", "/signup", "/login"]) {
      expect(shieldAccess({ pathname, previewValid: false }).action).toBe("redirect");
    }
  });

  test("admin login and admin APIs stay open", () => {
    expect(shieldAccess({ pathname: "/admin/login", previewValid: false }).action).toBe("next");
    expect(shieldAccess({ pathname: "/admin/login", previewValid: false }).surface).toBe("admin-login");
    expect(shieldAccess({ pathname: "/admin", previewValid: false }).action).toBe("next");
    expect(shieldAccess({ pathname: "/admin/investor-preview", previewValid: false }).surface).toBe("admin");
    expect(shieldAccess({ pathname: "/api/admin/investor-preview", previewValid: false }).action).toBe("next");
  });

  test("a preview session opens the product and still does not grant admin", () => {
    const home = shieldAccess({ pathname: "/home", previewValid: true });
    expect(home.action).toBe("next");
    expect(home.surface).toBe("product");
    expect(home.privateCache).toBe(true);
    const admin = shieldAccess({ pathname: "/admin", previewValid: true });
    expect(admin.grantsAdmin).toBe(false);
    expect(admin.surface).toBe("admin");
    expect(readFileSync("src/app/admin/(console)/layout.tsx", "utf8")).toContain('user.role !== "ADMIN"');
  });

  test("expired preview sessions are treated as logged out", () => {
    expect(shieldAccess({ pathname: "/market", previewValid: false }).action).toBe("redirect");
  });

  test("health stays public and hidden APIs do not", () => {
    expect(shieldAccess({ pathname: "/api/health", previewValid: false }).action).toBe("next");
    expect(shieldAccess({ pathname: "/api/prices/stream", previewValid: false }).action).toBe("not-found");
    expect(shieldAccess({ pathname: "/api/wallet/deposit", previewValid: false }).action).toBe("not-found");
    expect(shieldAccess({ pathname: "/api/admin/settings", previewValid: false }).action).toBe("next");
  });

  test("preview responses are private and noindex", () => {
    expect(PRIVATE_RESPONSE_HEADERS["Cache-Control"]).toContain("private");
    expect(PRIVATE_RESPONSE_HEADERS["Cache-Control"]).toContain("no-store");
    expect(PRIVATE_RESPONSE_HEADERS["X-Robots-Tag"]).toBe("noindex, nofollow");
    expect(shieldAccess({ pathname: "/players/test", previewValid: true }).robotsNoIndex).toBe(true);
  });
});

describe("preview tokens and cookies", () => {
  test("token hash is not the raw token and uses 256-bit input", () => {
    expect(PREVIEW_TOKEN_BYTES).toBe(32);
    const raw = "a".repeat(43);
    const hash = hashPreviewToken(raw, secret);
    expect(hash).not.toBe(raw);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("unused links and activated sessions each last 15 minutes from their own start", () => {
    const created = new Date("2026-10-06T15:00:00.000Z");
    const opened = new Date("2026-10-06T15:05:00.000Z");
    expect(unusedLinkExpiresAt(created).toISOString()).toBe("2026-10-06T15:15:00.000Z");
    expect(sessionExpiresAt(opened).toISOString()).toBe("2026-10-06T15:20:00.000Z");
    expect(PREVIEW_TTL_MS).toBe(15 * 60 * 1000);
    expect(PREVIEW_MAX_AGE_SECONDS).toBe(900);
  });

  test("preview cookie is httpOnly and secure only in production", () => {
    expect(PREVIEW_COOKIE).toBe("pp_investor_preview");
    const dev = previewCookieOptions("development");
    expect(dev.httpOnly).toBe(true);
    expect(dev.secure).toBe(false);
    expect(dev.sameSite).toBe("lax");
    expect(dev.path).toBe("/");
    expect(dev.maxAge).toBe(900);
    expect(previewCookieOptions("production").secure).toBe(true);
  });

  test("signed preview cookies reject tampering and expiry", () => {
    const token = "b".repeat(43);
    const expiresAt = Date.parse("2026-10-06T15:20:00.000Z");
    const signed = signPreviewCookie(token, expiresAt, secret);
    expect(readPreviewCookie(signed, expiresAt - 1_000, secret)?.token).toBe(token);
    expect(readPreviewCookie(signed, expiresAt, secret)).toBeNull();
    const tampered = `${signed.slice(0, -1)}${signed.endsWith("a") ? "b" : "a"}`;
    expect(readPreviewCookie(tampered, expiresAt - 1_000, secret)).toBeNull();
  });

  test("activation reuses the investor demo and blocks real payments", () => {
    const route = readFileSync("src/app/preview/[token]/route.ts", "utf8");
    expect(route).toContain("enterInvestorDemo");
    expect(readFileSync("src/app/api/wallet/deposit/route.ts", "utf8")).toContain("assertDemoPaymentsBlocked");
    expect(readFileSync("src/app/api/wallet/withdraw/route.ts", "utf8")).toContain("assertDemoPaymentsBlocked");
    expect(isInvestorDemoIdentity({ email: "investor-demo@playerpulser.invalid" })).toBe(true);
  });
});
