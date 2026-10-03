import { createHmac, timingSafeEqual } from "crypto";
import { normalizeEmail } from "./identities";

export type GoogleLink = {
  sub: string;
  email: string;
  givenName: string | null;
  familyName: string | null;
  name: string | null;
  picture: string | null;
};

const MAX_AGE_MS = 30 * 60 * 1000;

export function signGoogleLink(link: GoogleLink, secret: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ link, exp: now + MAX_AGE_MS })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readGoogleLink(token: string | null | undefined, secret: string, now = Date.now()): GoogleLink | null {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { link?: Partial<GoogleLink>; exp?: number };
    if (typeof parsed.exp !== "number" || parsed.exp < now) return null;
    const email = normalizeEmail(parsed.link?.email);
    const sub = parsed.link?.sub;
    if (!email || typeof sub !== "string" || !/^[A-Za-z0-9_-]{6,255}$/.test(sub)) return null;
    return {
      sub,
      email,
      givenName: typeof parsed.link?.givenName === "string" ? parsed.link.givenName.slice(0, 40) : null,
      familyName: typeof parsed.link?.familyName === "string" ? parsed.link.familyName.slice(0, 40) : null,
      name: typeof parsed.link?.name === "string" ? parsed.link.name.slice(0, 80) : null,
      picture: typeof parsed.link?.picture === "string" && parsed.link.picture.startsWith("https://") ? parsed.link.picture.slice(0, 500) : null,
    };
  } catch {
    return null;
  }
}
