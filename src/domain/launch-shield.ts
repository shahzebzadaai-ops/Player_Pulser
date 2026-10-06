import { createHash, createHmac, timingSafeEqual } from "crypto";

export const PREVIEW_COOKIE = "pp_investor_preview";
export const PREVIEW_TTL_MS = 15 * 60 * 1000;
export const PREVIEW_MAX_AGE_SECONDS = 900;
export const PREVIEW_TOKEN_BYTES = 32;

export const COMING_SOON_HEADLINE = "Feel the Pulse of the Game.";
export const COMING_SOON_SUBTEXT = "PlayerPulser is getting ready for launch.";
export const COMING_SOON_NOTE = "Private preview currently available by invitation only.";
export const PREVIEW_USED_MESSAGE = "Preview link is no longer valid.";
export const PREVIEW_INVALID_MESSAGE = "This preview link is invalid or has expired.";

const PUBLIC_EXACT = new Set(["/", "/coming-soon", "/robots.txt", "/sitemap.xml", "/favicon.ico"]);
const PUBLIC_API = new Set(["/api/health", "/api/payments/webhook", "/api/auth/login", "/api/auth/logout"]);

export type ShieldSurface = "public" | "product" | "admin" | "admin-login";

export type ShieldDecision = {
  action: "next" | "redirect" | "not-found";
  location: "/";
  surface: ShieldSurface;
  privateCache: boolean;
  robotsNoIndex: boolean;
  grantsAdmin: boolean;
};

export function unusedLinkExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + PREVIEW_TTL_MS);
}

export function sessionExpiresAt(activatedAt: Date): Date {
  return new Date(activatedAt.getTime() + PREVIEW_TTL_MS);
}

export function shieldSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.AUTH_SECRET ?? "";
  if (env.NODE_ENV === "production" && secret.length < 32) {
    throw new Error("AUTH_SECRET is not configured.");
  }
  return secret || "development-only-pepper";
}

export function hashPreviewToken(token: string, secret = shieldSecret()): string {
  return createHash("sha256").update(`${secret}:${token}`).digest("hex");
}

export function previewCookieOptions(nodeEnv: string | undefined) {
  return {
    httpOnly: true as const,
    secure: nodeEnv === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: PREVIEW_MAX_AGE_SECONDS,
  };
}

export function signPreviewCookie(token: string, expiresAtMs: number, secret = shieldSecret()): string {
  const payload = `${expiresAtMs}.${token}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function readPreviewCookie(value: string | undefined, now: number, secret = shieldSecret()): { token: string; expiresAtMs: number } | null {
  if (!value) return null;
  const first = value.indexOf(".");
  const last = value.lastIndexOf(".");
  if (first <= 0 || last <= first) return null;
  const expText = value.slice(0, first);
  const token = value.slice(first + 1, last);
  const signature = value.slice(last + 1);
  if (!/^\d+$/.test(expText) || token.length < 43) return null;
  const payload = `${expText}.${token}`;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  const expiresAtMs = Number(expText);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) return null;
  return { token, expiresAtMs };
}

export type PreviewLinkState = "ACTIVE" | "USED" | "REVOKED" | "EXPIRED";

export function previewLinkStatus(
  row: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
): PreviewLinkState {
  if (row.usedAt) return "USED";
  if (row.revokedAt) return "REVOKED";
  if (row.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "ACTIVE";
}

export function canRedeemPreview(status: PreviewLinkState): boolean {
  return status === "ACTIVE";
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isAdminApi(pathname: string): boolean {
  return pathname === "/api/admin" || pathname.startsWith("/api/admin/");
}

export function shieldAccess(input: { pathname: string; previewValid: boolean }): ShieldDecision {
  const pathname = normalizePath(input.pathname);
  const base = {
    location: "/" as const,
    grantsAdmin: false,
    robotsNoIndex: true,
  };

  if (PUBLIC_EXACT.has(pathname) || pathname.startsWith("/brand/")) {
    return { ...base, action: "next", surface: "public", privateCache: true };
  }
  if (pathname === "/admin/login") {
    return { ...base, action: "next", surface: "admin-login", privateCache: true };
  }
  if (isAdminPath(pathname) || isAdminApi(pathname)) {
    return { ...base, action: "next", surface: "admin", privateCache: true };
  }
  if (/^\/preview\/[^/]+$/.test(pathname)) {
    return { ...base, action: "next", surface: "public", privateCache: true };
  }
  if (PUBLIC_API.has(pathname)) {
    return { ...base, action: "next", surface: "public", privateCache: true };
  }

  if (!input.previewValid) {
    if (pathname.startsWith("/api/")) {
      return { ...base, action: "not-found", surface: "public", privateCache: true };
    }
    return { ...base, action: "redirect", surface: "public", privateCache: true };
  }

  return { ...base, action: "next", surface: "product", privateCache: true };
}

export const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
} as const;
