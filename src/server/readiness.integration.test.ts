import { randomUUID } from "crypto";
import { expect, test } from "vitest";
import { POST as depositPost } from "@/app/api/wallet/deposit/route";
import { POST as gatewayPost } from "@/app/api/admin/gateways/route";
import { POST as adjustPost } from "@/app/api/admin/wallet-adjust/route";
import { needsPolicyReacceptance } from "@/domain/consent";
import { POLICY_VERSIONS } from "@/domain/policy-versions";
import { recordEvent } from "@/server/attribution";
import { issueSession, requestDevOtp, signup, userFromToken, verifyDevOtp } from "@/server/auth";
import { grantWelcomeBonus } from "@/server/bonus";
import { recordPolicyAcceptance } from "@/server/consent";
import { accountBalance } from "@/server/ledger";
import { applyProviderResult, createDeposit, expireStalePayments } from "@/server/payments";
import { prisma } from "@/server/prisma";
import { consumeDurableRate } from "@/server/rate-limit";
import { getSettings } from "@/server/settings";
import { noteTrade } from "@/server/attribution";
import { createQuote, executeTrade } from "@/server/trading";

function phone(): string {
  return `+91${7 + Math.floor(Math.random() * 2)}${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`;
}

function request(path: string, body: unknown, token?: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      host: "localhost",
      ...(token ? { cookie: `pp_session=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("durable rate limits survive a new caller", async () => {
  const subject = `otp-${randomUUID()}`;
  for (let hit = 0; hit < 3; hit += 1) {
    const allowed = await consumeDurableRate({ action: "otp-request", subject, windowMs: 60_000, max: 3 });
    expect(allowed.allowed).toBe(true);
  }
  const blocked = await consumeDurableRate({ action: "otp-request", subject, windowMs: 60_000, max: 3 });
  expect(blocked.allowed).toBe(false);
  expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  const again = await consumeDurableRate({ action: "otp-request", subject, windowMs: 60_000, max: 3 });
  expect(again.allowed).toBe(false);
});

test("a new OTP supersedes the previous challenge", async () => {
  const national = phone().slice(3);
  const first = await requestDevOtp(national);
  await prisma.otpChallenge.update({ where: { id: first.challengeId }, data: { createdAt: new Date(Date.now() - 31_000) } });
  const second = await requestDevOtp(national);
  await expect(verifyDevOtp(first.challengeId, first.devCode, { accepted: true })).rejects.toMatchObject({ code: "INVALID_OTP" });
  const user = await verifyDevOtp(second.challengeId, second.devCode, { accepted: true, acceptedAge: true, displayName: "DEV_TEST otp" });
  await expect(verifyDevOtp(second.challengeId, second.devCode, { accepted: true })).rejects.toMatchObject({ code: "INVALID_OTP" });
  expect(user.displayName).toBe("DEV_TEST otp");
});

test("pending payments expire in storage and settled payments do not", async () => {
  const user = await prisma.user.create({ data: { displayName: "DEV_TEST expiry", role: "CUSTOMER" } });
  const pending = await createDeposit({ userId: user.id, amountPaise: 50_000n, method: "UPI", idempotencyKey: randomUUID(), simulate: "pending" });
  const settled = await createDeposit({ userId: user.id, amountPaise: 50_000n, method: "BANK", idempotencyKey: randomUUID(), simulate: "pending" });
  await applyProviderResult({ paymentId: settled.paymentId, status: "SETTLED", eventId: `ok:${settled.paymentId}`, payload: { amountPaise: "50000", currency: "INR" } });
  await prisma.payment.update({ where: { id: pending.paymentId }, data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) } });
  await prisma.payment.update({ where: { id: settled.paymentId }, data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) } });
  const expired = await expireStalePayments();
  expect(expired).toBeGreaterThanOrEqual(1);
  expect((await prisma.payment.findUniqueOrThrow({ where: { id: pending.paymentId } })).status).toBe("EXPIRED");
  expect((await prisma.payment.findUniqueOrThrow({ where: { id: settled.paymentId } })).status).toBe("SETTLED");
  expect(await accountBalance(prisma, user.id, "USER_CASH")).toBe(50_000n);
});

test("consent history keeps the old version when a new one is accepted", async () => {
  const user = await prisma.user.create({ data: { displayName: "DEV_TEST consent", role: "CUSTOMER" } });
  await prisma.$transaction((tx) => recordPolicyAcceptance(tx, { userId: user.id, ip: "127.0.0.1", userAgent: "vitest" }));
  const first = await prisma.policyAcceptance.findMany({ where: { userId: user.id } });
  expect(needsPolicyReacceptance(first, "TERMS")).toBe(false);
  expect(needsPolicyReacceptance(first, "TERMS", "terms-later")).toBe(true);
  await prisma.policyAcceptance.create({
    data: {
      userId: user.id,
      policyType: "TERMS",
      version: "terms-later",
      termsVersion: "terms-later",
      privacyVersion: POLICY_VERSIONS.privacy,
    },
  });
  const history = await prisma.policyAcceptance.findMany({ where: { userId: user.id } });
  expect(history.length).toBe(3);
  expect(history.some((row) => row.version === POLICY_VERSIONS.terms)).toBe(true);
  expect(needsPolicyReacceptance(history, "TERMS", "terms-later")).toBe(false);
  expect(history.some((row) => row.policyType === "MARKETING")).toBe(false);
});

test("development visitor completes signup, bonus, deposit, and first trade once", async () => {
  const national = phone().slice(3);
  await recordEvent({ eventName: "LANDING_VIEW", dedupeKey: `landing:${national}` });
  await recordEvent({ eventName: "SIGNUP_PROMPT_SHOWN", dedupeKey: `prompt:${national}` });
  await recordEvent({ eventName: "SIGNUP_STARTED", dedupeKey: `start:${national}` });
  const otp = await requestDevOtp(national);
  const user = await verifyDevOtp(otp.challengeId, otp.devCode, { accepted: true, acceptedAge: true, displayName: "DEV_TEST funnel", ip: "127.0.0.1", userAgent: "vitest" });
  expect(await accountBalance(prisma, user.id, "USER_BONUS")).toBe(20_000n);
  const settings = await getSettings();
  const repeat = await prisma.$transaction((tx) => grantWelcomeBonus(tx, user.id, settings));
  expect(await prisma.ledgerEntry.count({ where: { referenceId: repeat?.id, account: "USER_BONUS" } })).toBe(1);
  const pending = await createDeposit({ userId: user.id, amountPaise: 50_000n, method: "UPI", idempotencyKey: randomUUID(), simulate: "pending" });
  expect(await accountBalance(prisma, user.id, "USER_CASH")).toBe(0n);
  expect((await prisma.payment.findUniqueOrThrow({ where: { id: pending.paymentId } })).status).toBe("PENDING");
  await applyProviderResult({
    paymentId: pending.paymentId,
    status: "SETTLED",
    eventId: `funnel:${pending.paymentId}`,
    payload: { amountPaise: "50000", currency: "INR" },
  });
  expect(await accountBalance(prisma, user.id, "USER_CASH")).toBe(50_000n);
  expect(await accountBalance(prisma, user.id, "USER_BONUS")).toBe(20_000n);
  expect(await prisma.analyticsEvent.count({ where: { userId: user.id, eventName: "DEPOSIT_SUCCESS" } })).toBe(1);
  expect(await prisma.analyticsEvent.count({ where: { userId: user.id, eventName: "FIRST_DEPOSIT" } })).toBe(1);
  const player = await prisma.player.create({
    data: {
      slug: `dev-test-${randomUUID()}`,
      name: "DEV_TEST Player",
      shortName: "Dev",
      role: "BATTER",
      referenceMidPaise: 1_000n,
      basePricePaise: 1_000n,
      midPricePaise: 1_000n,
      matchAnchorPaise: 1_000n,
      fictional: true,
      blurb: "Development fixture",
      tradable: true,
    },
  });
  await prisma.priceTick.create({ data: { playerId: player.id, midPaise: 1_000n, source: "test" } });
  const quote = await createQuote({ userId: user.id, playerId: player.id, side: "BUY", quantity: 1, requestedBonusPaise: 0n, seenMidPaise: null, confirmPriceChange: true });
  const trade = await executeTrade({ userId: user.id, quoteId: quote.quoteId, idempotencyKey: randomUUID() });
  await noteTrade(user.id, trade);
  expect(await accountBalance(prisma, user.id, "USER_CASH")).toBe(50_000n - BigInt(quote.cashPaise));
  expect(await accountBalance(prisma, user.id, "USER_BONUS")).toBe(20_000n);
  expect(await prisma.analyticsEvent.count({ where: { userId: user.id, eventName: "FIRST_TRADE" } })).toBe(1);
});

test("simultaneous bonus grants and webhooks credit once", async () => {
  const settings = await getSettings();
  const user = await prisma.user.create({ data: { phone: phone(), displayName: "DEV_TEST race", role: "CUSTOMER" } });
  await Promise.allSettled([
    prisma.$transaction((tx) => grantWelcomeBonus(tx, user.id, settings)),
    prisma.$transaction((tx) => grantWelcomeBonus(tx, user.id, settings)),
  ]);
  const grant = await prisma.bonusGrant.findUniqueOrThrow({ where: { userId_source: { userId: user.id, source: "WELCOME" } } });
  expect(await prisma.ledgerEntry.count({ where: { referenceId: grant.id, account: "USER_BONUS" } })).toBe(1);
  const payment = await createDeposit({ userId: user.id, amountPaise: 50_000n, method: "UPI", idempotencyKey: randomUUID(), simulate: "pending" });
  const eventId = `race:${payment.paymentId}`;
  await Promise.all([
    applyProviderResult({ paymentId: payment.paymentId, status: "SETTLED", eventId, payload: { amountPaise: "50000", currency: "INR" } }),
    applyProviderResult({ paymentId: payment.paymentId, status: "SETTLED", eventId, payload: { amountPaise: "50000", currency: "INR" } }),
  ]);
  await applyProviderResult({ paymentId: payment.paymentId, status: "SETTLED", eventId: `other:${payment.paymentId}`, payload: { amountPaise: "50000", currency: "INR" } });
  expect(await accountBalance(prisma, user.id, "USER_CASH")).toBe(50_000n);
});

test("customer payment and admin calls fail safely", async () => {
  const loggedOut = await depositPost(request("/api/wallet/deposit", { amountPaise: "50000", method: "UPI" }));
  expect(loggedOut.status).toBe(401);
  const customer = await prisma.user.create({ data: { displayName: "DEV_TEST customer", role: "CUSTOMER" } });
  const session = await issueSession(customer.id);
  await prisma.session.update({ where: { tokenHash: (await prisma.session.findFirstOrThrow({ where: { userId: customer.id } })).tokenHash }, data: { expiresAt: new Date(Date.now() - 1000) } });
  expect(await userFromToken(session.token)).toBeNull();
  const fresh = await issueSession(customer.id);
  const negative = await depositPost(request("/api/wallet/deposit", { amountPaise: "-50000", method: "UPI" }, fresh.token));
  const huge = await depositPost(request("/api/wallet/deposit", { amountPaise: "99999999999999999999", method: "UPI" }, fresh.token));
  const small = await depositPost(request("/api/wallet/deposit", { amountPaise: "100", method: "UPI" }, fresh.token));
  expect(negative.status).toBe(400);
  expect(huge.status).toBe(400);
  expect(small.status).toBe(400);
  const gateway = await gatewayPost(request("/api/admin/gateways", { reason: "customer attempt" }, fresh.token));
  const adjust = await adjustPost(request("/api/admin/wallet-adjust", { userId: customer.id, direction: "credit", rupees: "10.00", reason: "customer attempt" }, fresh.token));
  expect(gateway.status).toBe(403);
  expect(adjust.status).toBe(403);
  const national = phone().slice(3);
  const results = await Promise.allSettled([
    signup({ method: "phone", phone: national, password: "secret1", acceptedTerms: true, displayName: "DEV_TEST signup" }),
    signup({ method: "phone", phone: national, password: "secret1", acceptedTerms: true, displayName: "DEV_TEST signup" }),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const created = await prisma.user.findUniqueOrThrow({ where: { phone: `+91${national}` } });
  expect(await prisma.bonusGrant.count({ where: { userId: created.id, source: "WELCOME" } })).toBe(1);
});
