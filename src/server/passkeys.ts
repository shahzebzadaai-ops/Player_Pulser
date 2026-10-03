import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { AppError } from "@/domain/errors";
import { isInvestorDemoIdentity } from "@/domain/investor-demo";
import { passkeyRelyingParty } from "@/domain/passkey";
import { attachIdentity } from "./identities";
import { prisma } from "./prisma";
import { setSessionCookie } from "./http";

const CHALLENGE_COOKIE = "pp_webauthn";
export const PASSKEY_HINT_COOKIE = "pp_pk";
export const PASSKEY_SKIP_COOKIE = "pp_passkey_skipped";

function cookieBase() {
  return {
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export function passkeyContext(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const rpID = passkeyRelyingParty(host, process.env.WEBAUTHN_RP_ID);
  const origin = request.headers.get("origin") ?? url.origin;
  if (!rpID) throw new AppError("UNAVAILABLE", "Device sign-in is not available on this address.", 404);
  return { rpID, origin };
}

export async function savePasskeyChallenge(challenge: string) {
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, challenge, { ...cookieBase(), httpOnly: true, maxAge: 5 * 60 });
}

async function takePasskeyChallenge() {
  const jar = await cookies();
  const challenge = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete(CHALLENGE_COOKIE);
  if (!challenge) throw new AppError("CHALLENGE", "That sign-in step expired. Please try again.", 400);
  return challenge;
}

export async function passkeyOfferEligible(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user || isInvestorDemoIdentity(user)) return false;
  const existing = await prisma.passkeyCredential.count({ where: { userId } });
  return existing === 0;
}

export async function registrationOptions(request: Request, user: { id: string; email: string | null; phone: string | null; username: string | null; displayName: string }) {
  if (isInvestorDemoIdentity(user)) throw new AppError("DEMO", "Device sign-in is not available for this session.", 403);
  const { rpID } = passkeyContext(request);
  const existing = await prisma.passkeyCredential.findMany({ where: { userId: user.id }, select: { credentialId: true, transports: true } });
  const options = await generateRegistrationOptions({
    rpName: "PlayerPulser",
    rpID,
    userName: user.username || user.email || user.phone || user.id,
    userID: new TextEncoder().encode(user.id),
    userDisplayName: user.displayName || "PlayerPulser",
    attestationType: "none",
    preferredAuthenticatorType: "localDevice",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
      authenticatorAttachment: "platform",
    },
    excludeCredentials: existing.map((row) => ({
      id: row.credentialId,
      transports: row.transports?.split(",").filter(Boolean),
    })),
  });
  await savePasskeyChallenge(options.challenge);
  return options;
}

export async function verifyRegistration(request: Request, userId: string, response: RegistrationResponseJSON) {
  if (!response?.id || !response.response) throw new AppError("INVALID", "We couldn't set up device sign-in. Please try again.", 400);
  const { rpID, origin } = passkeyContext(request);
  const expectedChallenge = await takePasskeyChallenge();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    throw new AppError("INVALID", "We couldn't set up device sign-in. Please try again.", 400);
  }
  if (!verification.verified) throw new AppError("INVALID", "We couldn't set up device sign-in. Please try again.", 400);
  const credential = verification.registrationInfo.credential;
  const transports = response.response.transports?.join(",") ?? null;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.passkeyCredential.create({
        data: {
          userId,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey),
          counter: BigInt(credential.counter),
          transports,
        },
      });
      await attachIdentity(tx, {
        userId,
        provider: "PASSKEY",
        providerAccountId: credential.id,
        verifiedAt: new Date(),
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("EXISTS", "This identity is already connected to another account.", 409);
    }
    throw error;
  }
  const jar = await cookies();
  jar.set(PASSKEY_HINT_COOKIE, "1", { ...cookieBase(), httpOnly: false, maxAge: 60 * 60 * 24 * 400 });
}

export async function authenticationOptions(request: Request) {
  const { rpID } = passkeyContext(request);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
  });
  await savePasskeyChallenge(options.challenge);
  return options;
}

export async function verifyAuthentication(request: Request, response: AuthenticationResponseJSON) {
  if (!response?.id || !response.response) throw new AppError("INVALID", "We couldn't sign you in. Please try again.", 400);
  const { rpID, origin } = passkeyContext(request);
  const expectedChallenge = await takePasskeyChallenge();
  const stored = await prisma.passkeyCredential.findUnique({ where: { credentialId: response.id } });
  if (!stored) throw new AppError("INVALID", "We couldn't sign you in. Please try again.", 400);
  const owner = await prisma.user.findUnique({ where: { id: stored.userId }, select: { id: true, email: true } });
  if (!owner || isInvestorDemoIdentity(owner)) throw new AppError("INVALID", "We couldn't sign you in. Please try again.", 400);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(stored.publicKey),
        counter: Number(stored.counter),
        transports: stored.transports?.split(",").filter(Boolean),
      },
    });
  } catch {
    throw new AppError("INVALID", "We couldn't sign you in. Please try again.", 400);
  }
  if (!verification.verified) throw new AppError("INVALID", "We couldn't sign you in. Please try again.", 400);
  await prisma.passkeyCredential.update({
    where: { id: stored.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter) },
  });
  await setSessionCookie(owner.id);
}

export async function skipPasskeyOffer() {
  const jar = await cookies();
  jar.set(PASSKEY_SKIP_COOKIE, "1", { ...cookieBase(), httpOnly: false, maxAge: 60 * 60 * 24 * 400 });
}
