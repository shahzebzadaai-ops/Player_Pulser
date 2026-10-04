import { randomUUID } from "crypto";
import { expect, test } from "vitest";
import { INVESTOR_DEMO_EMAIL } from "@/domain/investor-demo";
import { linkVisitor } from "./attribution";
import { requestDevOtp, signup, verifyDevOtp } from "./auth";
import { requestEmailOtp, verifyEmailOtp } from "./otp";
import { prisma } from "./prisma";

function phone(): string {
  return `+91${6 + Math.floor(Math.random() * 3)}${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`;
}

test("password signup stores one identity and does not grant a second bonus", async () => {
  const national = phone().slice(3);
  const user = await signup({ method: "phone", phone: national, password: "secret1", displayName: "Auth Fan", acceptedTerms: true });
  const identities = await prisma.authIdentity.findMany({ where: { userId: user.id } });
  expect(identities).toHaveLength(1);
  expect(identities[0]?.provider).toBe("PHONE");
  expect(identities[0]?.verifiedAt).toBeNull();
  expect(await prisma.bonusGrant.count({ where: { userId: user.id, source: "WELCOME" } })).toBe(1);
  await expect(signup({ method: "phone", phone: national, password: "secret1", displayName: "Auth Fan", acceptedTerms: true })).rejects.toMatchObject({ code: "EXISTS" });
  expect(await prisma.bonusGrant.count({ where: { userId: user.id, source: "WELCOME" } })).toBe(1);
});

test("a later phone code verifies the same account without another bonus", async () => {
  const national = phone().slice(3);
  const user = await signup({ method: "phone", phone: national, password: "secret1", acceptedTerms: true });
  const issued = await requestDevOtp(national);
  const loggedIn = await verifyDevOtp(issued.challengeId, issued.devCode, { accepted: true });
  expect(loggedIn.id).toBe(user.id);
  expect(await prisma.bonusGrant.count({ where: { userId: user.id, source: "WELCOME" } })).toBe(1);
  const identity = await prisma.authIdentity.findFirst({ where: { userId: user.id, provider: "PHONE" } });
  expect(identity?.verifiedAt).not.toBeNull();
});

test("the same provider account cannot belong to two users", async () => {
  const firstPhone = phone();
  const user = await prisma.user.create({ data: { phone: firstPhone, displayName: "One", role: "CUSTOMER" } });
  const other = await prisma.user.create({ data: { phone: phone(), displayName: "Two", role: "CUSTOMER" } });
  await prisma.authIdentity.create({
    data: { userId: user.id, provider: "PHONE", providerAccountId: firstPhone, normalizedPhone: firstPhone, verifiedAt: new Date() },
  });
  await expect(prisma.authIdentity.create({
    data: { userId: other.id, provider: "PHONE", providerAccountId: firstPhone, normalizedPhone: phone(), verifiedAt: new Date() },
  })).rejects.toMatchObject({ code: "P2002" });
});

test("the investor demo email cannot sign up or take an email identity", async () => {
  await expect(signup({ method: "email", email: INVESTOR_DEMO_EMAIL, password: "secret1", acceptedTerms: true })).rejects.toMatchObject({ code: "EXISTS" });
  await expect(requestEmailOtp(INVESTOR_DEMO_EMAIL)).rejects.toMatchObject({ code: "INVALID" });
});

test("email otp creates one account and one bonus", async () => {
  const email = `fan-${randomUUID().slice(0, 8)}@example.com`;
  const issued = await requestEmailOtp(email);
  const user = await verifyEmailOtp(issued.challengeId, issued.devCode, { accepted: true, acceptedAge: true, displayName: "Email Fan" });
  expect(user.signupMethod).toBe("EMAIL");
  expect(user.emailVerifiedAt).not.toBeNull();
  expect(await prisma.authIdentity.count({ where: { userId: user.id, provider: "EMAIL" } })).toBe(1);
  expect(await prisma.bonusGrant.count({ where: { userId: user.id, source: "WELCOME" } })).toBe(1);
  await prisma.otpChallenge.updateMany({ where: { email }, data: { createdAt: new Date(Date.now() - 60_000) } });
  const again = await requestEmailOtp(email);
  const same = await verifyEmailOtp(again.challengeId, again.devCode, { accepted: true });
  expect(same.id).toBe(user.id);
  expect(await prisma.bonusGrant.count({ where: { userId: user.id, source: "WELCOME" } })).toBe(1);
});

test("signup stitches a visitor and keeps the first touch", async () => {
  const national = phone().slice(3);
  const user = await signup({ method: "phone", phone: national, password: "secret1", acceptedTerms: true });
  const visitorId = randomUUID();
  await prisma.visitor.create({ data: { id: visitorId, firstTouchId: "touch-first", lastTouchId: "touch-last" } });
  await linkVisitor(user.id, visitorId, "signup");
  const linked = await prisma.visitor.findUnique({ where: { id: visitorId } });
  expect(linked?.userId).toBe(user.id);
  expect(linked?.firstTouchId).toBe("touch-first");
  const attribution = await prisma.userAttribution.findUnique({ where: { userId: user.id } });
  expect(attribution?.signupTouchId).toBe("touch-last");
  await prisma.visitor.update({ where: { id: visitorId }, data: { lastTouchId: "touch-newer" } });
  await linkVisitor(user.id, visitorId, "signup");
  const again = await prisma.userAttribution.findUnique({ where: { userId: user.id } });
  expect(again?.signupTouchId).toBe("touch-last");
});
