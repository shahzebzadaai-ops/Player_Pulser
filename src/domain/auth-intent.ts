import { createHmac, timingSafeEqual } from "crypto";

export const AUTH_INTENT_COOKIE = "pp_intent";
export const AUTH_LINK_COOKIE = "pp_link";
const MAX_AGE_MS = 30 * 60 * 1000;

export type AuthIntent =
  | { type: "BUY"; playerId: string; slug: string; quantity: number; side: "BUY" | "SELL"; displayedIndicativePrice: string; createdAt: number }
  | { type: "DEPOSIT" }
  | { type: "PORTFOLIO" }
  | { type: "REWARDS" }
  | { type: "WATCHLIST" }
  | { type: "REFERRAL" }
  | { type: "HOME" }
  | { type: "WALLET" }
  | { type: "NOTIFICATIONS" };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID = /^[a-z0-9]{8,40}$/i;
const PAISE = /^\d{1,12}$/;

export function parseAuthIntent(value: unknown): AuthIntent | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type === "DEPOSIT" || record.type === "PORTFOLIO" || record.type === "REWARDS" || record.type === "WATCHLIST" || record.type === "REFERRAL" || record.type === "HOME" || record.type === "WALLET" || record.type === "NOTIFICATIONS") {
    return { type: record.type };
  }
  if (record.type !== "BUY") return null;
  if (typeof record.playerId !== "string" || !ID.test(record.playerId)) return null;
  if (typeof record.slug !== "string" || !SLUG.test(record.slug)) return null;
  if (typeof record.quantity !== "number" || !Number.isInteger(record.quantity) || record.quantity < 1 || record.quantity > 100) return null;
  if (record.side !== "BUY" && record.side !== "SELL") return null;
  const displayed = typeof record.displayedIndicativePrice === "string" ? record.displayedIndicativePrice : record.seenPricePaise;
  if (typeof displayed !== "string" || !PAISE.test(displayed) || BigInt(displayed) <= 0n) return null;
  const createdAt = typeof record.createdAt === "number" && Number.isFinite(record.createdAt) ? record.createdAt : nowOrZero(record);
  return {
    type: "BUY",
    playerId: record.playerId,
    slug: record.slug,
    quantity: record.quantity,
    side: record.side,
    displayedIndicativePrice: displayed,
    createdAt,
  };
}

function nowOrZero(record: Record<string, unknown>): number {
  return typeof record.createdAt === "string" && /^\d+$/.test(record.createdAt) ? Number(record.createdAt) : 0;
}

export function signAuthIntent(intent: AuthIntent, secret: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ intent, exp: now + MAX_AGE_MS })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readAuthIntent(token: string | null | undefined, secret: string, now = Date.now()): AuthIntent | null {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { intent?: unknown; exp?: number };
    if (typeof parsed.exp !== "number" || parsed.exp < now) return null;
    return parseAuthIntent(parsed.intent);
  } catch {
    return null;
  }
}

export function intentContinuation(intent: AuthIntent | null): { path: string; clearIntent: boolean } {
  if (!intent) return { path: "/home", clearIntent: false };
  return { path: intentResumePath(intent), clearIntent: intent.type !== "BUY" };
}

export function intentResumePath(intent: AuthIntent): string {
  if (intent.type === "BUY") return `/players/${intent.slug}?resume=1`;
  if (intent.type === "DEPOSIT") return "/wallet/deposit";
  if (intent.type === "PORTFOLIO") return "/portfolio";
  if (intent.type === "REWARDS") return "/rewards";
  if (intent.type === "WATCHLIST") return "/market";
  if (intent.type === "HOME") return "/home";
  if (intent.type === "WALLET") return "/wallet";
  if (intent.type === "NOTIFICATIONS") return "/notifications";
  return "/rewards";
}
