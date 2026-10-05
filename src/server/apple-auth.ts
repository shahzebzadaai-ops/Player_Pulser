import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { authFlags } from "@/domain/auth-flags";
import { googleAccountDecision } from "@/domain/identities";
import { readOauthState, signOauthState } from "@/domain/provider-profile";
import { appleSetupMessage } from "@/domain/provider-setup";
import { AGE_CONSENT_MESSAGE, ageConsentAccepted } from "@/domain/registration";
import { normalizeUsername } from "@/domain/username";
import { AppError } from "@/domain/errors";
import { linkVisitor, recordEvent } from "./attribution";
import { attachIdentity } from "./identities";
import { grantWelcomeBonus } from "./bonus";
import { authSecret } from "./auth";
import { withUserLock } from "./ledger";
import { prisma } from "./prisma";
import { assignTemporaryUsername } from "./usernames";
import { getSettings } from "./settings";
import { json, setSessionCookie } from "./http";
import { PASSKEY_SKIP_COOKIE, passkeyOfferEligible } from "./passkeys";
import { rememberReferral } from "./referrals";
import { recordPolicyAcceptance } from "./consent";
import { clearAppleSignup, currentAppleSignup, currentIntent, saveAppleSignup } from "./intent-cookie";
import { appleClientSecret, appleTokenKid, readAppleIdentity } from "./apple-token";

const STATE_COOKIE = "pp_apple_state";

function stateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "none" as const,
    secure: true,
    path: "/",
    maxAge: 10 * 60,
  };
}

export async function beginApple(request: Request): Promise<Response> {
  const setup = appleSetupMessage(process.env, new URL(request.url).origin);
  if (setup || !authFlags().appleEnabled) return json({ error: { code: "NOT_CONFIGURED", message: setup ?? "Apple sign-in is not configured." } }, 503);
  const nonce = randomBytes(16).toString("base64url");
  const jar = await cookies();
  jar.set(STATE_COOKIE, nonce, stateCookieOptions());
  const redirectUri = new URL("/api/auth/apple/callback", request.url).toString();
  const params = new URLSearchParams({
    client_id: process.env.APPLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "form_post",
    scope: "name email",
    state: signOauthState(nonce, authSecret()),
  });
  return Response.redirect(`https://appleid.apple.com/auth/authorize?${params.toString()}`);
}

async function identityFromCode(request: Request, code: string) {
  const clientId = process.env.APPLE_CLIENT_ID ?? "";
  const redirectUri = new URL("/api/auth/apple/callback", request.url).toString();
  const tokenResponse = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: appleClientSecret(process.env),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenResponse.ok) return null;
  const tokenBody = (await tokenResponse.json()) as { id_token?: string };
  if (!tokenBody.id_token) return null;
  const kid = appleTokenKid(tokenBody.id_token);
  const keysResponse = await fetch("https://appleid.apple.com/auth/keys");
  if (!keysResponse.ok) return null;
  const keysBody = (await keysResponse.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
  const jwk = keysBody.keys?.find((key) => key.kid === kid);
  if (!jwk) return null;
  return readAppleIdentity(tokenBody.id_token, jwk, clientId);
}

function namesFromUser(raw: string | null): { givenName: string | null; familyName: string | null } {
  if (!raw) return { givenName: null, familyName: null };
  try {
    const parsed = JSON.parse(raw) as { name?: { firstName?: string; lastName?: string } };
    return {
      givenName: parsed.name?.firstName?.slice(0, 40) ?? null,
      familyName: parsed.name?.lastName?.slice(0, 40) ?? null,
    };
  } catch {
    return { givenName: null, familyName: null };
  }
}

export async function finishApple(request: Request): Promise<Response> {
  const loginError = new URL("/login?error=apple", request.url);
  if (!authFlags().appleEnabled) return Response.redirect(loginError);
  const form = request.method === "POST" ? await request.formData() : null;
  const url = new URL(request.url);
  const code = form?.get("code")?.toString() || url.searchParams.get("code");
  const state = form?.get("state")?.toString() || url.searchParams.get("state");
  const providerError = form?.get("error")?.toString() || url.searchParams.get("error");
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  const nonce = readOauthState(state, authSecret());
  if (providerError) return Response.redirect(await signupReturn(request, "cancelled"));
  if (!code || !nonce || !expected || nonce !== expected) return Response.redirect(loginError);
  const identity = await identityFromCode(request, code);
  if (!identity) return Response.redirect(loginError);
  const names = namesFromUser(form?.get("user")?.toString() ?? null);
  const bySubject = await prisma.authIdentity.findUnique({
    where: { provider_providerAccountId: { provider: "APPLE", providerAccountId: identity.sub } },
    select: { userId: true },
  });
  const byEmail = identity.email ? await prisma.user.findUnique({ where: { email: identity.email }, select: { id: true } }) : null;
  const decision = googleAccountDecision({
    email: identity.email,
    existingBySubjectUserId: bySubject?.userId ?? null,
    existingByEmailUserId: byEmail?.id ?? null,
  });
  if (decision === "REJECTED") return Response.redirect(new URL("/login?error=demo", request.url));
  if (decision === "LINK_REQUIRED") return Response.redirect(new URL("/login?link=apple", request.url));
  if (decision === "SIGN_IN" && bySubject) {
    await setSessionCookie(bySubject.userId);
    await prisma.user.update({ where: { id: bySubject.userId }, data: { lastLoginAt: new Date() } });
    await linkVisitor(bySubject.userId, jar.get("pp_vid")?.value ?? null, "login");
    const offerPasskey = jar.get(PASSKEY_SKIP_COOKIE)?.value !== "1" && await passkeyOfferEligible(bySubject.userId);
    return Response.redirect(new URL(offerPasskey ? "/?auth=login&passkey=1" : "/continue", request.url));
  }
  if (!identity.email) return Response.redirect(loginError);
  await saveAppleSignup({
    sub: identity.sub,
    email: identity.email,
    givenName: names.givenName,
    familyName: names.familyName,
    name: [names.givenName, names.familyName].filter(Boolean).join(" ") || null,
  });
  return Response.redirect(await signupReturn(request, "apple"));
}

async function signupReturn(request: Request, kind: "apple" | "cancelled"): Promise<URL> {
  const intent = await currentIntent();
  const path = intent?.type === "BUY" ? `/players/${intent.slug}` : "/";
  const target = new URL(path, request.url);
  target.searchParams.set("auth", "signup");
  if (kind === "apple") target.searchParams.set("apple", "1");
  if (kind === "cancelled") target.searchParams.set("error", "cancelled");
  return target;
}

export async function completeAppleSignup(input: {
  givenName: string;
  familyName: string;
  username?: string;
  referralCode?: string;
  acceptedAge: boolean;
  acceptedTerms: boolean;
  ip?: string | null;
  userAgent?: string | null;
  visitorId?: string | null;
}): Promise<{ userId: string }> {
  if (!ageConsentAccepted(input)) throw new AppError("CONSENT", AGE_CONSENT_MESSAGE, 400);
  const givenName = input.givenName.trim();
  const familyName = input.familyName.trim();
  if (!givenName || !familyName) throw new AppError("INVALID", "Enter your first and last name.", 400);
  const username = input.username?.trim() ? normalizeUsername(input.username) : null;
  if (input.username?.trim() && !username) throw new AppError("INVALID", "Use 3–24 letters, numbers, dots, or underscores.", 400);
  const pending = await currentAppleSignup();
  if (!pending?.email) throw new AppError("INVALID", "Apple sign-in expired. Try again.", 400);
  const bySubject = await prisma.authIdentity.findUnique({
    where: { provider_providerAccountId: { provider: "APPLE", providerAccountId: pending.sub } },
    select: { userId: true },
  });
  const byEmail = await prisma.user.findUnique({ where: { email: pending.email }, select: { id: true } });
  const decision = googleAccountDecision({
    email: pending.email,
    existingBySubjectUserId: bySubject?.userId ?? null,
    existingByEmailUserId: byEmail?.id ?? null,
  });
  if (decision === "REJECTED") throw new AppError("INVALID", "That Apple account cannot be used here.", 400);
  if (decision === "LINK_REQUIRED") {
    await clearAppleSignup();
    throw new AppError("EXISTS", "This Apple account matches an existing email. Sign in with your current method to link it.", 409);
  }
  if (decision === "SIGN_IN" && bySubject) {
    await clearAppleSignup();
    return { userId: bySubject.userId };
  }
  const settings = await getSettings();
  try {
    const user = await withUserLock(`apple:${pending.sub}`, async (tx) => {
      if (username) {
        const taken = await tx.user.findFirst({ where: { usernameNormalized: username }, select: { id: true } });
        if (taken) throw new AppError("EXISTS", "That username is already taken.", 409);
      }
      const created = await tx.user.create({
        data: {
          email: pending.email,
          displayName: [givenName, familyName].join(" "),
          givenName,
          familyName,
          ...(username ? { username, usernameNormalized: username, usernameCustomized: true } : {}),
          role: "CUSTOMER",
          signupMethod: "APPLE",
          emailVerifiedAt: new Date(),
          accountStatus: "PROFILE_COMPLETE",
        },
      });
      await attachIdentity(tx, {
        userId: created.id,
        provider: "APPLE",
        providerAccountId: pending.sub,
        normalizedEmail: pending.email,
        verifiedAt: new Date(),
      });
      await recordPolicyAcceptance(tx, { userId: created.id, ip: input.ip, userAgent: input.userAgent });
      await rememberReferral(tx, created.id, input.referralCode);
      await grantWelcomeBonus(tx, created.id, settings);
      if (!username) await assignTemporaryUsername(tx, created.id);
      return created;
    });
    await clearAppleSignup();
    await recordEvent({ eventName: "signup_completed", dedupeKey: `signup-apple:${user.id}`, userId: user.id });
    return { userId: user.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await clearAppleSignup();
      throw new AppError("EXISTS", "This Apple account matches an existing email. Sign in with your current method to link it.", 409);
    }
    throw error;
  }
}
