import { randomUUID } from "crypto";
import { expect, test } from "vitest";
import { collectVisit, linkVisitor, noteSettlement, recordEvent } from "@/server/attribution";
import { campaignLinkMetrics } from "@/server/marketing-report";
import { prisma } from "@/server/prisma";

test("attribution keeps first touch, updates last touch, and links signup and first deposit", async () => {
  const visitorId = randomUUID();
  const user = await prisma.user.create({ data: { phone: `+91${9}${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`, displayName: "Attr Fan", role: "CUSTOMER" } });
  const firstSession = randomUUID();
  await collectVisit({
    visitorId,
    sessionId: firstSession,
    pathname: "/",
    search: "utm_source=Facebook&utm_medium=paid_social&utm_campaign=Open",
    referrer: null,
    user: null,
  });
  await collectVisit({
    visitorId,
    sessionId: firstSession,
    pathname: "/",
    search: "utm_source=Facebook&utm_medium=paid_social&utm_campaign=Open",
    referrer: null,
    user: null,
  });
  expect(await prisma.analyticsEvent.count({ where: { dedupeKey: `page:${firstSession}:/` } })).toBe(1);
  const opened = await prisma.visitor.findUniqueOrThrow({ where: { id: visitorId } });
  const firstTouch = opened.firstTouchId;
  expect(firstTouch).toBeTruthy();

  await collectVisit({ visitorId, sessionId: randomUUID(), pathname: "/market", search: "", referrer: null, user: null });
  const afterDirect = await prisma.visitor.findUniqueOrThrow({ where: { id: visitorId } });
  expect(afterDirect.firstTouchId).toBe(firstTouch);
  expect(afterDirect.lastTouchId).toBe(firstTouch);

  const googleSession = randomUUID();
  await collectVisit({
    visitorId,
    sessionId: googleSession,
    pathname: "/signup",
    search: "utm_source=google&utm_medium=cpc&utm_campaign=Search",
    referrer: null,
    user: null,
  });
  const afterGoogle = await prisma.visitor.findUniqueOrThrow({ where: { id: visitorId } });
  expect(afterGoogle.firstTouchId).toBe(firstTouch);
  expect(afterGoogle.lastTouchId).not.toBe(firstTouch);

  await linkVisitor(user.id, visitorId, "signup");
  const linked = await prisma.visitor.findUniqueOrThrow({ where: { id: visitorId } });
  expect(linked.userId).toBe(user.id);
  const attribution = await prisma.userAttribution.findUniqueOrThrow({ where: { userId: user.id } });
  expect(attribution.signupTouchId).toBe(afterGoogle.lastTouchId);

  const whatsappSession = randomUUID();
  await collectVisit({
    visitorId,
    sessionId: whatsappSession,
    pathname: "/wallet",
    search: "utm_source=whatsapp&utm_medium=crm&utm_campaign=Recall",
    referrer: null,
    user: { id: user.id, role: "CUSTOMER" },
  });
  const afterWhatsapp = await prisma.visitor.findUniqueOrThrow({ where: { id: visitorId } });
  const signupStill = await prisma.userAttribution.findUniqueOrThrow({ where: { userId: user.id } });
  expect(signupStill.signupTouchId).toBe(attribution.signupTouchId);
  expect(afterWhatsapp.lastTouchId).not.toBe(signupStill.signupTouchId);

  await prisma.payment.create({
    data: {
      userId: user.id,
      provider: "simulated",
      kind: "DEPOSIT",
      status: "SETTLED",
      amountPaise: 50_000n,
      idempotencyKey: randomUUID(),
      settledAt: new Date(),
    },
  });
  await noteSettlement(user.id, "payment-1", "DEPOSIT", 50_000n);
  await noteSettlement(user.id, "payment-1", "DEPOSIT", 50_000n);
  const deposited = await prisma.userAttribution.findUniqueOrThrow({ where: { userId: user.id } });
  expect(deposited.firstDepositTouchId).toBe(afterWhatsapp.lastTouchId);
  expect(deposited.signupTouchId).toBe(attribution.signupTouchId);
  expect(await prisma.analyticsEvent.count({ where: { dedupeKey: `ftd:${user.id}` } })).toBe(1);

  const metrics = await campaignLinkMetrics({
    utmSource: "meta",
    utmMedium: "paid_social",
    utmCampaign: "open",
    utmContent: null,
    utmTerm: null,
  });
  expect(metrics.visits).toBe(1);
  expect(metrics.signups).toBe(0);

  await recordEvent({
    eventName: "FIRST_TRADE",
    dedupeKey: `first-trade:${user.id}`,
    userId: user.id,
    touchId: afterGoogle.lastTouchId,
  });
  const googleMetrics = await campaignLinkMetrics({
    utmSource: "google",
    utmMedium: "paid_search",
    utmCampaign: "search",
    utmContent: null,
    utmTerm: null,
  });
  expect(googleMetrics.signups).toBe(1);
  expect(googleMetrics.firstTrades).toBe(1);
});

test("admin traffic is not stored as a customer page view", async () => {
  const visitorId = randomUUID();
  const sessionId = randomUUID();
  const admin = await prisma.user.create({ data: { displayName: "Attr Admin", role: "ADMIN" } });
  const result = await collectVisit({
    visitorId,
    sessionId,
    pathname: "/home",
    search: "utm_source=meta&utm_medium=paid_social&utm_campaign=staff",
    referrer: null,
    user: { id: admin.id, role: "ADMIN" },
  });
  expect(result.tracked).toBe(false);
  expect(await prisma.analyticsEvent.count({ where: { sessionId } })).toBe(0);
  const ignored = await collectVisit({
    visitorId: randomUUID(),
    sessionId: randomUUID(),
    pathname: "/admin/marketing/attribution",
    search: "utm_source=meta&utm_campaign=nope",
    referrer: null,
    user: null,
  });
  expect(ignored.tracked).toBe(false);
});
