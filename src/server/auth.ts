import { createHash, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { Prisma, type User } from "@prisma/client";
import { authFlags } from "@/domain/auth-flags";
import { AppError } from "@/domain/errors";
import { otpAttemptAllowed, otpResendAllowed } from "@/domain/growth";
import { INVESTOR_DEMO_EMAIL, isInvestorDemoIdentity } from "@/domain/investor-demo";
import { devAuthAllowed, normalizeIndianPhone, passwordIssue } from "@/domain/phone";
import { prisma, type Tx } from "./prisma";
import { grantWelcomeBonus } from "./bonus";
import { recordPolicyAcceptance } from "./consent";
import { attachIdentity } from "./identities";
import { withUserLock } from "./ledger";
import { deliverOtp } from "./otp-provider";
import { assertDurableRate } from "./rate-limit";
import { getSettings } from "./settings";
import { rememberReferral } from "./referrals";
import { assignTemporaryUsername } from "./usernames";
import { normalizeUsername } from "@/domain/username";
import { AGE_CONSENT_MESSAGE, ageConsentAccepted } from "@/domain/registration";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "pp_session";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 32)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, hex] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !hex) return false;
  const derived = (await scrypt(password, salt, 32)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function authSecret(): string {
  const secret = process.env.AUTH_SECRET ?? "";
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    throw new AppError("CONFIG", "AUTH_SECRET is not configured.", 500);
  }
  return secret || "development-only-pepper";
}

function sessionPepper(): string {
  return authSecret();
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(`${sessionPepper()}:${token}`).digest("hex");
}

export async function issueSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { userId, tokenHash: hashSessionToken(token), expiresAt },
  });
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  return { token, expiresAt };
}

export async function userFromToken(token: string | null | undefined): Promise<User | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  return session.user;
}

export function tokenFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function destroySession(token: string | null): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

export function assertAdmin(user: { role: string } | null): asserts user is { role: "ADMIN" } {
  if (!user) throw new AppError("UNAUTHENTICATED", "Sign in required.", 401);
  if (user.role !== "ADMIN") throw new AppError("FORBIDDEN", "Admin access is required.", 403);
}

export async function signup(input: {
  method: "phone" | "email";
  phone?: string;
  email?: string;
  password: string;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  username?: string;
  referralCode?: string;
  acceptedTerms?: boolean;
  acceptedAge?: boolean;
  ip?: string | null;
  userAgent?: string | null;
  visitorId?: string | null;
}): Promise<User> {
  const issue = passwordIssue(input.password);
  if (issue) throw new AppError("INVALID", issue, 400);
  const phone = input.phone ? normalizeIndianPhone(input.phone) : null;
  const email = input.email?.trim().toLowerCase() || null;
  if (input.method === "phone" && !phone) throw new AppError("INVALID", "Enter a valid Indian mobile number.", 400);
  if (input.method === "email" && (!email || !email.includes("@"))) {
    throw new AppError("INVALID", "Enter a valid email address.", 400);
  }
  if (phone && (await prisma.user.findUnique({ where: { phone } }))) {
    throw new AppError("EXISTS", "An account with this mobile number already exists.", 409);
  }
  if (email === INVESTOR_DEMO_EMAIL) {
    throw new AppError("EXISTS", "An account with this email already exists.", 409);
  }
  if (email && (await prisma.user.findUnique({ where: { email } }))) {
    throw new AppError("EXISTS", "An account with this email already exists.", 409);
  }
  if (input.acceptedAge !== undefined && !ageConsentAccepted(input)) {
    throw new AppError("CONSENT", AGE_CONSENT_MESSAGE, 400);
  }
  const givenName = input.givenName?.trim() || null;
  const familyName = input.familyName?.trim() || null;
  const username = input.username?.trim() ? normalizeUsername(input.username) : null;
  if (input.username?.trim() && !username) {
    throw new AppError("INVALID", "Use 3–24 letters, numbers, dots, or underscores.", 400);
  }
  const passwordHash = await hashPassword(input.password);
  const settings = await getSettings();
  try {
    return await prisma.$transaction(async (tx) => {
      if (username) {
        const taken = await tx.user.findFirst({ where: { usernameNormalized: username }, select: { id: true } });
        if (taken) throw new AppError("EXISTS", "That username is already taken.", 409);
      }
      const user = await tx.user.create({
        data: {
          phone,
          email,
          givenName,
          familyName,
          displayName: [givenName, familyName].filter(Boolean).join(" ") || input.displayName?.trim() || "Cricket Fan",
          ...(username ? { username, usernameNormalized: username, usernameCustomized: true } : {}),
          passwordHash,
          role: "CUSTOMER",
          signupMethod: "PASSWORD",
          accountStatus: givenName && familyName ? "PROFILE_COMPLETE" : "REGISTERED",
        },
      });
      await rememberReferral(tx, user.id, input.referralCode);
      await attachIdentity(tx, {
        userId: user.id,
        provider: phone ? "PHONE" : "EMAIL",
        providerAccountId: (phone ?? email) as string,
        normalizedPhone: phone,
        normalizedEmail: email,
        verifiedAt: null,
      });
      if (input.acceptedTerms) {
        await recordPolicyAcceptance(tx, { userId: user.id, ip: input.ip, userAgent: input.userAgent });
      }
      await grantWelcomeBonus(tx, user.id, settings, await sharedWelcomeSignals(tx, user.id, input.visitorId));
      if (!username) await assignTemporaryUsername(tx, user.id);
      return user;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("EXISTS", "We couldn't create that account. Try signing in.", 409);
    }
    throw error;
  }
}

export async function loginWithPassword(identifier: string, password: string): Promise<User> {
  const phone = normalizeIndianPhone(identifier);
  const email = identifier.trim().toLowerCase();
  const user = phone
    ? await prisma.user.findUnique({ where: { phone } })
    : await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash || isInvestorDemoIdentity(user) || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError("INVALID_LOGIN", "Phone or password is incorrect.", 401);
  }
  return user;
}

export async function devLogin(phoneInput: string): Promise<User> {
  if (!devAuthAllowed()) throw new AppError("NOT_FOUND", "Not found.", 404);
  const phone = normalizeIndianPhone(phoneInput);
  if (!phone) throw new AppError("INVALID", "Enter a valid Indian mobile number.", 400);
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) throw new AppError("NOT_FOUND", "No development account uses that number.", 404);
  return user;
}

async function sharedWelcomeSignals(tx: Tx, userId: string, visitorId?: string | null) {
  if (!visitorId) return {};
  const visitor = await tx.visitor.findUnique({ where: { id: visitorId } });
  if (!visitor?.userId || visitor.userId === userId) return {};
  const prior = await tx.bonusGrant.findUnique({ where: { userId_source: { userId: visitor.userId, source: "WELCOME" } } });
  return prior ? { sameDeviceGrant: true } : {};
}

export async function requestDevOtp(phoneInput: string): Promise<{ challengeId: string; devCode: string }> {
  if (!devAuthAllowed()) throw new AppError("NOT_FOUND", "Not found.", 404);
  const phone = normalizeIndianPhone(phoneInput);
  if (!phone) throw new AppError("INVALID", "Enter a valid Indian mobile number.", 400);
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

export async function verifyDevOtp(
  challengeId: string,
  code: string,
  consent?: { accepted: boolean; acceptedAge?: boolean; displayName?: string; givenName?: string; familyName?: string; ip?: string | null; userAgent?: string | null; visitorId?: string | null; sessionUserId?: string | null },
  allowConfigured = false,
): Promise<User> {
  if (!devAuthAllowed() && !(allowConfigured && authFlags().phoneOtpEnabled)) throw new AppError("NOT_FOUND", "Not found.", 404);
  const challenge = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge || !challenge.phone || challenge.consumedAt) {
    throw new AppError("INVALID_OTP", "That code has expired. Send a new one.", 401);
  }
  if (challenge.expiresAt.getTime() < Date.now()) {
    throw new AppError("INVALID_OTP", "That code has expired. Send a new one.", 401);
  }
  const phone = challenge.phone;
  await assertDurableRate("otp-verify", phone, 10 * 60_000, 15);
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
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (consent?.sessionUserId) {
    if (existing && existing.id !== consent.sessionUserId) {
      throw new AppError("EXISTS", "That identity is already connected to another account.", 409);
    }
    const owner = await prisma.user.findUnique({ where: { id: consent.sessionUserId } });
    if (!owner || isInvestorDemoIdentity(owner) || (owner.phone && owner.phone !== phone)) {
      throw new AppError("EXISTS", "That identity is already connected to another account.", 409);
    }
    await attachIdentity(prisma, {
      userId: owner.id,
      provider: "PHONE",
      providerAccountId: phone,
      normalizedPhone: phone,
      verifiedAt: new Date(),
    });
    if (owner.accountStatus !== "RESTRICTED") {
      await prisma.user.update({
        where: { id: owner.id },
        data: {
          phone,
          phoneVerifiedAt: owner.phoneVerifiedAt ?? new Date(),
          accountStatus: owner.accountStatus === "REGISTERED" ? "CONTACT_VERIFIED" : owner.accountStatus,
        },
      });
    }
    return owner;
  }
  if (existing) {
    await attachIdentity(prisma, {
      userId: existing.id,
      provider: "PHONE",
      providerAccountId: phone,
      normalizedPhone: phone,
      verifiedAt: new Date(),
    });
    if (existing.accountStatus !== "RESTRICTED") {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          phoneVerifiedAt: existing.phoneVerifiedAt ?? new Date(),
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
  return withUserLock(`otp:${phone}`, async (tx) => {
    const again = await tx.user.findUnique({ where: { phone } });
    if (again) return again;
    const user = await tx.user.create({
      data: {
        phone,
        givenName: consent.givenName?.trim() || null,
        familyName: consent.familyName?.trim() || null,
        displayName: [consent.givenName, consent.familyName].filter(Boolean).join(" ").trim() || consent.displayName?.trim() || "Cricket Fan",
        role: "CUSTOMER",
        signupMethod: "PHONE",
        phoneVerifiedAt: new Date(),
        accountStatus: "CONTACT_VERIFIED",
      },
    });
    await attachIdentity(tx, {
      userId: user.id,
      provider: "PHONE",
      providerAccountId: phone,
      normalizedPhone: phone,
      verifiedAt: new Date(),
    });
    await recordPolicyAcceptance(tx, { userId: user.id, ip: consent.ip, userAgent: consent.userAgent });
    await grantWelcomeBonus(tx, user.id, settings, await sharedWelcomeSignals(tx, user.id, consent.visitorId));
    await assignTemporaryUsername(tx, user.id);
    return user;
  });
}
