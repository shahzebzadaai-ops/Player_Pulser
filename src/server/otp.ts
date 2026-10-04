import { createHash, randomInt } from "crypto";
import type { User } from "@prisma/client";
import { AppError } from "@/domain/errors";
import { authFlags } from "@/domain/auth-flags";
import { otpAttemptAllowed, otpResendAllowed } from "@/domain/growth";
import { AGE_CONSENT_MESSAGE, ageConsentAccepted } from "@/domain/registration";
import { normalizeEmail } from "@/domain/identities";
import { INVESTOR_DEMO_EMAIL, isInvestorDemoIdentity } from "@/domain/investor-demo";
import { devAuthAllowed } from "@/domain/phone";
import { attachIdentity } from "./identities";
import { withUserLock } from "./ledger";
import { deliverOtp } from "./otp-provider";
import { prisma, type Tx } from "./prisma";
import { assertDurableRate } from "./rate-limit";
import { grantWelcomeBonus } from "./bonus";
import { recordPolicyAcceptance } from "./consent";
import { getSettings } from "./settings";
import { assignTemporaryUsername } from "./usernames";

const E164 = /^\+[1-9]\d{7,14}$/;

async function sharedWelcomeSignals(tx: Tx, userId: string, visitorId?: string | null) {
  if (!visitorId) return {};
  const visitor = await tx.visitor.findUnique({ where: { id: visitorId } });
  if (!visitor?.userId || visitor.userId === userId) return {};
  const prior = await tx.bonusGrant.findUnique({ where: { userId_source: { userId: visitor.userId, source: "WELCOME" } } });
  return prior ? { sameDeviceGrant: true } : {};
}

export async function requestPhoneOtp(phone: string): Promise<{ challengeId: string; devCode: string }> {
  if (!authFlags().phoneOtpEnabled) throw new AppError("NOT_FOUND", "Not found.", 404);
  if (!E164.test(phone)) throw new AppError("INVALID", "Enter a valid mobile number.", 400);
  await assertDurableRate("otp-request", phone, 10 * 60_000, 5);
  const latest = await prisma.otpChallenge.findFirst({ where: { phone }, orderBy: { createdAt: "desc" } });
  if (latest && !otpResendAllowed(latest.createdAt.getTime(), Date.now())) {
    throw new AppError("RATE_LIMIT", "Wait a few seconds before requesting another code.", 429, { retryAfter: "30" });
  }
  const devCode = randomInt(100000, 999999).toString();
  const challenge = await prisma.$transaction(async (tx) => {
    const created = await tx.otpChallenge.create({
      data: {
        channel: "PHONE",
        phone,
        codeHash: createHash("sha256").update(devCode).digest("hex"),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    await tx.otpChallenge.updateMany({
      where: { phone, consumedAt: null, id: { not: created.id } },
      data: { consumedAt: new Date() },
    });
    return created;
  });
  await deliverOtp({ channel: "PHONE", destination: phone, code: devCode });
  return { challengeId: challenge.id, devCode };
}

export async function requestEmailOtp(emailInput: string): Promise<{ challengeId: string; devCode: string }> {
  if (!authFlags().emailOtpEnabled) throw new AppError("NOT_FOUND", "Not found.", 404);
  const email = normalizeEmail(emailInput);
  if (!email) throw new AppError("INVALID", "Enter a valid email address.", 400);
  if (email === INVESTOR_DEMO_EMAIL) throw new AppError("INVALID", "Enter a valid email address.", 400);
  await assertDurableRate("otp-request", email, 10 * 60_000, 5);
  const latest = await prisma.otpChallenge.findFirst({ where: { email }, orderBy: { createdAt: "desc" } });
  if (latest && !otpResendAllowed(latest.createdAt.getTime(), Date.now())) {
    throw new AppError("RATE_LIMIT", "Wait a few seconds before requesting another code.", 429, { retryAfter: "30" });
  }
  const devCode = randomInt(100000, 999999).toString();
  const challenge = await prisma.$transaction(async (tx) => {
    const created = await tx.otpChallenge.create({
      data: {
        channel: "EMAIL",
        email,
        codeHash: createHash("sha256").update(devCode).digest("hex"),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    await tx.otpChallenge.updateMany({
      where: { email, consumedAt: null, id: { not: created.id } },
      data: { consumedAt: new Date() },
    });
    return created;
  });
  await deliverOtp({ channel: "EMAIL", destination: email, code: devCode });
  return { challengeId: challenge.id, devCode };
}

export async function verifyEmailOtp(
  challengeId: string,
  code: string,
  consent?: { accepted: boolean; acceptedAge?: boolean; displayName?: string; givenName?: string; familyName?: string; ip?: string | null; userAgent?: string | null; visitorId?: string | null; sessionUserId?: string | null },
): Promise<User> {
  if (!authFlags().emailOtpEnabled && !devAuthAllowed()) throw new AppError("NOT_FOUND", "Not found.", 404);
  const challenge = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge || challenge.channel !== "EMAIL" || !challenge.email || challenge.consumedAt) {
    throw new AppError("INVALID_OTP", "That code has expired. Send a new one.", 401);
  }
  if (challenge.expiresAt.getTime() < Date.now()) {
    throw new AppError("INVALID_OTP", "That code has expired. Send a new one.", 401);
  }
  const email = challenge.email;
  if (email === INVESTOR_DEMO_EMAIL) throw new AppError("INVALID_OTP", "That code is not valid any more.", 401);
  await assertDurableRate("otp-verify", email, 10 * 60_000, 15);
  if (!otpAttemptAllowed(challenge.attempts)) {
    throw new AppError("RATE_LIMIT", "Too many attempts. Try again shortly.", 429, { retryAfter: "300" });
  }
  const hash = createHash("sha256").update(code).digest("hex");
  if (challenge.codeHash !== hash) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw new AppError("INVALID_OTP", "That code was not accepted.", 401);
  }
  const consumed = await prisma.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null, codeHash: hash, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) throw new AppError("INVALID_OTP", "That code has expired. Send a new one.", 401);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (consent?.sessionUserId) {
    if (existing && existing.id !== consent.sessionUserId) {
      throw new AppError("EXISTS", "That identity is already connected to another account.", 409);
    }
    const owner = await prisma.user.findUnique({ where: { id: consent.sessionUserId } });
    if (!owner || isInvestorDemoIdentity(owner) || (owner.email && owner.email !== email)) {
      throw new AppError("EXISTS", "That identity is already connected to another account.", 409);
    }
    await attachIdentity(prisma, {
      userId: owner.id,
      provider: "EMAIL",
      providerAccountId: email,
      normalizedEmail: email,
      verifiedAt: new Date(),
    });
    if (owner.accountStatus !== "RESTRICTED") {
      await prisma.user.update({
        where: { id: owner.id },
        data: {
          email,
          emailVerifiedAt: owner.emailVerifiedAt ?? new Date(),
          accountStatus: owner.accountStatus === "REGISTERED" ? "CONTACT_VERIFIED" : owner.accountStatus,
        },
      });
    }
    return owner;
  }
  if (existing) {
    await attachIdentity(prisma, {
      userId: existing.id,
      provider: "EMAIL",
      providerAccountId: email,
      normalizedEmail: email,
      verifiedAt: new Date(),
    });
    if (existing.accountStatus !== "RESTRICTED") {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
          accountStatus: existing.accountStatus === "REGISTERED" ? "CONTACT_VERIFIED" : existing.accountStatus,
        },
      });
    }
    return existing;
  }
  if (!consent || !ageConsentAccepted({ acceptedAge: consent.acceptedAge, acceptedTerms: consent.accepted })) {
    throw new AppError("CONSENT", AGE_CONSENT_MESSAGE, 400);
  }
  const settings = await getSettings();
  return withUserLock(`otp:${email}`, async (tx) => {
    const again = await tx.user.findUnique({ where: { email } });
    if (again) return again;
    const user = await tx.user.create({
      data: {
        email,
        givenName: consent.givenName?.trim() || null,
        familyName: consent.familyName?.trim() || null,
        displayName: [consent.givenName, consent.familyName].filter(Boolean).join(" ").trim() || consent.displayName?.trim() || "Cricket Fan",
        role: "CUSTOMER",
        signupMethod: "EMAIL",
        emailVerifiedAt: new Date(),
        accountStatus: "CONTACT_VERIFIED",
      },
    });
    await attachIdentity(tx, {
      userId: user.id,
      provider: "EMAIL",
      providerAccountId: email,
      normalizedEmail: email,
      verifiedAt: new Date(),
    });
    await recordPolicyAcceptance(tx, { userId: user.id, ip: consent.ip, userAgent: consent.userAgent });
    await grantWelcomeBonus(tx, user.id, settings, await sharedWelcomeSignals(tx, user.id, consent.visitorId));
      await assignTemporaryUsername(tx, user.id);
    return user;
  });
}

export function publicOtpPayload(result: { challengeId: string; devCode: string }) {
  if (devAuthAllowed()) return result;
  return { challengeId: result.challengeId };
}
