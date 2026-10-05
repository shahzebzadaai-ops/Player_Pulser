import { createHmac, timingSafeEqual } from "crypto";
import { normalizeEmail } from "./identities";

export type ProviderProfile = {
  sub: string;
  email: string;
  givenName: string | null;
  familyName: string | null;
  name: string | null;
};

const MAX_AGE_MS = 30 * 60 * 1000;

export function signProviderProfile(link: ProviderProfile, secret: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ link, exp: now + MAX_AGE_MS })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readProviderProfile(token: string | null | undefined, secret: string, now = Date.now()): ProviderProfile | null {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { link?: Partial<ProviderProfile>; exp?: number };
    if (typeof parsed.exp !== "number" || parsed.exp < now) return null;
    const email = normalizeEmail(parsed.link?.email);
    const sub = parsed.link?.sub;
    if (!email || typeof sub !== "string" || !/^[A-Za-z0-9._-]{6,255}$/.test(sub)) return null;
    return {
      sub,
      email,
      givenName: typeof parsed.link?.givenName === "string" ? parsed.link.givenName.slice(0, 40) : null,
      familyName: typeof parsed.link?.familyName === "string" ? parsed.link.familyName.slice(0, 40) : null,
      name: typeof parsed.link?.name === "string" ? parsed.link.name.slice(0, 80) : null,
    };
  } catch {
    return null;
  }
}

export function signOauthState(nonce: string, secret: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ nonce, exp: now + 10 * 60 * 1000 })).toString("base64url");
  const sig = createHmac("sha256", secret).update(`apple-state:${body}`).digest("base64url");
  return `${body}.${sig}`;
}

export function readOauthState(token: string | null | undefined, secret: string, now = Date.now()): string | null {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(`apple-state:${body}`).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { nonce?: string; exp?: number };
    if (typeof parsed.exp !== "number" || parsed.exp < now || typeof parsed.nonce !== "string") return null;
    return parsed.nonce;
  } catch {
    return null;
  }
}
