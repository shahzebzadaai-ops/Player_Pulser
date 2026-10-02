import { randomUUID } from "crypto";
import { expect, test } from "vitest";
import { TERMS_VERSION, marketingPayload } from "@/domain/growth";
import { AppError } from "@/domain/errors";
import { signup, requestDevOtp, verifyDevOtp } from "@/server/auth";
import { grantWelcomeBonus } from "@/server/bonus";
import { saveGateway } from "@/server/gateways";
import { accountBalance } from "@/server/ledger";
import { applyProviderResult, createDeposit, verifyWebhookSignature } from "@/server/payments";
import { prisma } from "@/server/prisma";
import { getSettings } from "@/server/settings";

function phone(): string {
  return `+91${6 + Math.floor(Math.random() * 3)}${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`;
}

test("welcome bonus is granted once and a review hold does not post cash", async () => {
  const settings = await getSettings();
  const user = await prisma.user.create({ data: { phone: phone(), displayName: "Bonus Fan", role: "CUSTOMER" } });
  const first = await prisma.$transaction((tx) => grantWelcomeBonus(tx, user.id, settings));
  const second = await prisma.$transaction((tx) => grantWelcomeBonus(tx, user.id, settings));
  expect(first?.id).toBe(second?.id);
  expect(await prisma.ledgerEntry.count({ where: { referenceId: first?.id, account: "USER_BONUS" } })).toBe(1);
  const other = await prisma.user.create({ data: { phone: phone(), displayName: "Held Fan", role: "CUSTOMER" } });
  const held = await prisma.$transaction((tx) => grantWelcomeBonus(tx, other.id, settings, { sameDeviceGrant: true }));
  expect(held?.status).toBe("PENDING_REVIEW");
  expect(await accountBalance(prisma, other.id, "USER_BONUS")).toBe(0n);
  expect(await prisma.abuseFlag.count({ where: { userId: other.id } })).toBe(1);
});

test("signup stores the terms and privacy versions", async () => {
  const national = phone().slice(3);
  const user = await signup({
    method: "phone",
    phone: national,
    password: "secret1",
    displayName: "Consent Fan",
    acceptedTerms: true,
    ip: "127.0.0.1",
    userAgent: "vitest",
  });
  const row = await prisma.policyAcceptance.findFirst({ where: { userId: user.id } });
  expect(row?.termsVersion).toBe(TERMS_VERSION);
  expect(row?.ip).toBe("127.0.0.1");
  const again = signup({ method: "phone", phone: national, password: "secret1", acceptedTerms: true });
  await expect(again).rejects.toBeInstanceOf(AppError);
});

test("otp expires and stops after too many guesses", async () => {
  const phone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
  const issued = await requestDevOtp(phone);
  await prisma.otpChallenge.update({ where: { id: issued.challengeId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await expect(verifyDevOtp(issued.challengeId, issued.devCode, { accepted: true })).rejects.toMatchObject({ code: "INVALID_OTP" });
  const fresh = await requestDevOtp(`8${Math.floor(100000000 + Math.random() * 899999999)}`);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expect(verifyDevOtp(fresh.challengeId, "000000", { accepted: true })).rejects.toMatchObject({ code: "INVALID_OTP" });
  }
  await expect(verifyDevOtp(fresh.challengeId, fresh.devCode, { accepted: true })).rejects.toMatchObject({ code: "RATE_LIMIT" });
});

test("a payment return does not credit and a webhook credits once", async () => {
  const user = await prisma.user.create({ data: { displayName: "Pay Fan", role: "CUSTOMER" } });
  const pending = await createDeposit({ userId: user.id, amountPaise: 100_000n, method: "UPI", idempotencyKey: randomUUID(), simulate: "pending" });
  expect(await accountBalance(prisma, user.id, "USER_CASH")).toBe(0n);
  expect(verifyWebhookSignature("{}", "not-a-signature")).toBe(false);
  const wrong = await applyProviderResult({
    paymentId: pending.paymentId,
    status: "SETTLED",
    eventId: `bad:${pending.paymentId}`,
    payload: { amountPaise: "1", currency: "INR" },
  });
  expect(wrong.duplicate).toBe(false);
  expect(await accountBalance(prisma, user.id, "USER_CASH")).toBe(0n);
  const next = await createDeposit({ userId: user.id, amountPaise: 100_000n, method: "UPI", idempotencyKey: randomUUID(), simulate: "pending" });
  const settled = await applyProviderResult({
    paymentId: next.paymentId,
    status: "SETTLED",
    eventId: `ok:${next.paymentId}`,
    payload: { amountPaise: "100000", currency: "INR" },
  });
  expect(settled.duplicate).toBe(false);
  const replay = await applyProviderResult({
    paymentId: next.paymentId,
    status: "SETTLED",
    eventId: `ok:${next.paymentId}`,
    payload: { amountPaise: "100000", currency: "INR" },
  });
  expect(replay.duplicate).toBe(true);
  const later = await applyProviderResult({
    paymentId: next.paymentId,
    status: "SETTLED",
    eventId: `later:${next.paymentId}`,
    payload: { amountPaise: "100000", currency: "INR" },
  });
  expect(later.duplicate).toBe(false);
  expect(await accountBalance(prisma, user.id, "USER_CASH")).toBe(100_000n);
  expect(marketingPayload({ phone: "999", amount: 1 }).phone).toBeUndefined();
});

test("gateway changes require permission and write an audit row", async () => {
  const actor = await prisma.user.create({ data: { displayName: "Gateway Admin", role: "ADMIN" } });
  await expect(saveGateway({
    actorId: actor.id,
    permission: false,
    reason: "turn it on",
    category: "BANKING",
    name: "Example Bank",
    providerKey: `bank-${randomUUID().slice(0, 8)}`,
    enabled: true,
    environment: "sandbox",
    priority: 10,
    supportedMethods: ["UPI"],
    depositEnabled: false,
    withdrawalEnabled: false,
  })).rejects.toMatchObject({ code: "FORBIDDEN" });
  const key = `bank-${randomUUID().slice(0, 8)}`;
  const saved = await saveGateway({
    actorId: actor.id,
    permission: true,
    reason: "enable sandbox",
    category: "BANKING",
    name: "Example Bank",
    providerKey: key,
    enabled: true,
    environment: "sandbox",
    priority: 10,
    supportedMethods: ["UPI"],
    depositEnabled: true,
    withdrawalEnabled: false,
  });
  const audit = await prisma.auditLog.findFirst({ where: { entityId: saved.id, action: "gateway.enable" } });
  expect(audit?.reason).toBe("enable sandbox");
  const off = await saveGateway({
    actorId: actor.id,
    permission: true,
    reason: "disable sandbox",
    id: saved.id,
    category: "BANKING",
    name: "Example Bank",
    providerKey: key,
    enabled: false,
    environment: "sandbox",
    priority: 20,
    supportedMethods: ["UPI"],
    depositEnabled: false,
    withdrawalEnabled: false,
  });
  expect(off.enabled).toBe(false);
  expect(await prisma.auditLog.count({ where: { entityId: saved.id } })).toBe(2);
});
