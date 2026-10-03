import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { authFlags } from "@/domain/auth-flags";
import { googleAccountDecision, normalizeEmail } from "@/domain/identities";
import { linkVisitor, recordEvent } from "./attribution";
import { attachIdentity } from "./identities";
import { saveGoogleLink } from "./intent-cookie";
import { grantWelcomeBonus } from "./bonus";
import { withUserLock } from "./ledger";
import { prisma } from "./prisma";
import { assignTemporaryUsername } from "./usernames";
import { getSettings } from "./settings";
import { json, setSessionCookie } from "./http";
import { PASSKEY_SKIP_COOKIE, passkeyOfferEligible } from "./passkeys";

const STATE_COOKIE = "pp_google_state";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  };
}

export async function beginGoogle(request: Request): Promise<Response> {
  if (!authFlags().googleEnabled || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);
  }
  const state = randomBytes(16).toString("base64url");
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, cookieOptions());
  const redirectUri = new URL("/api/auth/google/callback", request.url).toString();
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

type GoogleProfile = {
  sub: string;
  email: string | null;
  givenName: string | null;
  familyName: string | null;
  name: string | null;
  picture: string | null;
};

async function profileFromCode(request: Request, code: string): Promise<GoogleProfile | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const redirectUri = new URL("/api/auth/google/callback", request.url).toString();
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) return null;
  const tokenBody = (await tokenResponse.json()) as { id_token?: string };
  if (!tokenBody.id_token) return null;
  const infoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenBody.id_token)}`);
  if (!infoResponse.ok) return null;
  const info = (await infoResponse.json()) as {
    aud?: string;
    sub?: string;
    iss?: string;
    email?: string;
    email_verified?: string | boolean;
    given_name?: string;
    family_name?: string;
    name?: string;
    picture?: string;
  };
  const issuerOk = info.iss === "accounts.google.com" || info.iss === "https://accounts.google.com";
  if (!issuerOk || info.aud !== clientId || typeof info.sub !== "string") return null;
  const verified = info.email_verified === true || info.email_verified === "true";
  return {
    sub: info.sub,
    email: verified ? normalizeEmail(info.email) : null,
    givenName: info.given_name?.slice(0, 40) ?? null,
    familyName: info.family_name?.slice(0, 40) ?? null,
    name: info.name?.slice(0, 80) ?? null,
    picture: info.picture?.startsWith("https://") ? info.picture.slice(0, 500) : null,
  };
}

export async function finishGoogle(request: Request): Promise<Response> {
  const loginError = new URL("/login?error=google", request.url);
  if (!authFlags().googleEnabled) return Response.redirect(loginError);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  if (!code || !state || !expected || state !== expected) return Response.redirect(loginError);
  const profile = await profileFromCode(request, code);
  if (!profile) return Response.redirect(loginError);
  const bySubject = await prisma.authIdentity.findUnique({
    where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: profile.sub } },
    select: { userId: true },
  });
  const byEmail = profile.email ? await prisma.user.findUnique({ where: { email: profile.email }, select: { id: true } }) : null;
  const decision = googleAccountDecision({
    email: profile.email,
    existingBySubjectUserId: bySubject?.userId ?? null,
    existingByEmailUserId: byEmail?.id ?? null,
  });
  if (decision === "REJECTED") return Response.redirect(new URL("/login?error=demo", request.url));
  if (decision === "LINK_REQUIRED" && profile.email) {
    await saveGoogleLink({
      sub: profile.sub,
      email: profile.email,
      givenName: profile.givenName,
      familyName: profile.familyName,
      name: profile.name,
      picture: profile.picture,
    });
    return Response.redirect(new URL("/login?link=1", request.url));
  }
  if (decision === "SIGN_IN" && bySubject) {
    await setSessionCookie(bySubject.userId);
    await prisma.user.update({ where: { id: bySubject.userId }, data: { lastLoginAt: new Date() } });
    await linkVisitor(bySubject.userId, jar.get("pp_vid")?.value ?? null, "login");
    const offerPasskey = jar.get(PASSKEY_SKIP_COOKIE)?.value !== "1" && await passkeyOfferEligible(bySubject.userId);
    return Response.redirect(new URL(offerPasskey ? "/?auth=login&passkey=1" : "/continue", request.url));
  }
  const settings = await getSettings();
  const displayName = profile.name || [profile.givenName, profile.familyName].filter(Boolean).join(" ") || "Cricket Fan";
  try {
    const user = await withUserLock(`google:${profile.sub}`, async (tx) => {
      const created = await tx.user.create({
        data: {
          email: profile.email,
          displayName,
          givenName: profile.givenName,
          familyName: profile.familyName,
          avatarUrl: profile.picture,
          role: "CUSTOMER",
          signupMethod: "GOOGLE",
          emailVerifiedAt: profile.email ? new Date() : null,
          accountStatus: profile.email ? "CONTACT_VERIFIED" : "REGISTERED",
        },
      });
      await attachIdentity(tx, {
        userId: created.id,
        provider: "GOOGLE",
        providerAccountId: profile.sub,
        normalizedEmail: profile.email,
        verifiedAt: new Date(),
      });
      await grantWelcomeBonus(tx, created.id, settings);
      await assignTemporaryUsername(tx, created.id);
      return created;
    });
    await setSessionCookie(user.id);
    await linkVisitor(user.id, jar.get("pp_vid")?.value ?? null, "signup");
    await recordEvent({ eventName: "signup_completed", dedupeKey: `signup-google:${user.id}`, userId: user.id });
    return Response.redirect(new URL("/?auth=signup&profile=1", request.url));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && profile.email) {
      await saveGoogleLink({
        sub: profile.sub,
        email: profile.email,
        givenName: profile.givenName,
        familyName: profile.familyName,
        name: profile.name,
        picture: profile.picture,
      });
      return Response.redirect(new URL("/login?link=1", request.url));
    }
    return Response.redirect(loginError);
  }
}
