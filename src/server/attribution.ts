import { Prisma } from "@prisma/client";
import {
  classifyTouch,
  cleanReferrer,
  isTrackablePath,
  isVisitorId,
  landingPage,
  pageDedupeKey,
  parseAttributionSearch,
  playerSlugFromPath,
  type AnalyticsEventName,
} from "@/domain/attribution";
import { prisma } from "./prisma";

const TAXONOMY_KEY = "marketing.utmTaxonomy";

export async function recordEvent(input: {
  eventName: AnalyticsEventName;
  dedupeKey: string;
  visitorId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  touchId?: string | null;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.analyticsEvent.create({
      data: {
        eventName: input.eventName,
        dedupeKey: input.dedupeKey,
        visitorId: input.visitorId ?? null,
        sessionId: input.sessionId ?? null,
        userId: input.userId ?? null,
        touchId: input.touchId ?? null,
        metadata: input.metadata,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    console.error(JSON.stringify({ level: "error", message: "analytics event failed", event: input.eventName }));
  }
}

async function currentTouchId(userId: string): Promise<string | null> {
  const visitor = await prisma.visitor.findFirst({
    where: { userId, internal: false },
    orderBy: { lastSeenAt: "desc" },
  });
  return visitor?.lastTouchId ?? visitor?.firstTouchId ?? null;
}

export async function collectVisit(input: {
  visitorId: string | null;
  sessionId: string | null;
  pathname: string;
  search: string;
  referrer: string | null;
  user: { id: string; role: string } | null;
}): Promise<{ tracked: boolean }> {
  if (!isTrackablePath(input.pathname) || !isVisitorId(input.visitorId) || !isVisitorId(input.sessionId)) return { tracked: false };
  if (input.user?.role === "ADMIN") {
    await prisma.visitor.updateMany({ where: { id: input.visitorId }, data: { internal: true, userId: input.user.id } });
    return { tracked: false };
  }
  const referrer = cleanReferrer(input.referrer);
  const params = classifyTouch(parseAttributionSearch(input.search), referrer);
  const page = landingPage(input.pathname, params);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const visitor = await tx.visitor.upsert({
      where: { id: input.visitorId! },
      create: { id: input.visitorId!, userId: input.user?.id ?? null },
      update: { lastSeenAt: now, userId: input.user?.id ?? undefined },
    });
    if (visitor.internal) return;
    await tx.visitSession.upsert({
      where: { id: input.sessionId! },
      create: { id: input.sessionId!, visitorId: visitor.id, landingPage: page, referrer },
      update: { lastSeenAt: now },
    });
    const existingTouch = await tx.trafficTouch.findUnique({ where: { sessionId: input.sessionId! } });
    let touchId = existingTouch?.id ?? null;
    if (!existingTouch) {
      const created = await tx.trafficTouch.create({
        data: {
          visitorId: visitor.id,
          sessionId: input.sessionId!,
          source: params.source,
          medium: params.medium,
          campaign: params.campaign,
          content: params.content,
          term: params.term,
          fbclid: params.fbclid,
          gclid: params.gclid,
          msclkid: params.msclkid,
          landingPage: page,
          referrer,
          attributed: params.attributed,
        },
      });
      touchId = created.id;
      if (!visitor.firstTouchId) {
        await tx.visitor.updateMany({
          where: { id: visitor.id, firstTouchId: null },
          data: { firstTouchId: created.id, lastTouchId: created.id },
        });
      } else if (params.attributed) {
        await tx.visitor.update({ where: { id: visitor.id }, data: { lastTouchId: created.id } });
      }
    }
    await tx.analyticsEvent.create({
      data: {
        eventName: "PAGE_VIEW",
        dedupeKey: pageDedupeKey(input.sessionId!, input.pathname),
        visitorId: visitor.id,
        sessionId: input.sessionId,
        userId: input.user?.id ?? null,
        touchId,
      },
    }).catch((error: unknown) => {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    });
    const slug = playerSlugFromPath(input.pathname);
    if (slug) {
      await tx.analyticsEvent.create({
        data: {
          eventName: "PLAYER_VIEW",
          dedupeKey: `player:${input.sessionId}:${slug}`,
          visitorId: visitor.id,
          sessionId: input.sessionId,
          userId: input.user?.id ?? null,
          touchId,
          metadata: { slug },
        },
      }).catch((error: unknown) => {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      });
    }
    if (input.pathname === "/signup") {
      await tx.analyticsEvent.create({
        data: {
          eventName: "SIGNUP_STARTED",
          dedupeKey: `signup-start:${input.sessionId}`,
          visitorId: visitor.id,
          sessionId: input.sessionId,
          userId: input.user?.id ?? null,
          touchId,
        },
      }).catch((error: unknown) => {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      });
    }
  });
  return { tracked: true };
}

export async function linkVisitor(userId: string, visitorId: string | null, mode: "signup" | "login"): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    if (user.role === "ADMIN") {
      if (isVisitorId(visitorId)) await prisma.visitor.updateMany({ where: { id: visitorId }, data: { internal: true, userId } });
      return;
    }
    let visitor = isVisitorId(visitorId) ? await prisma.visitor.findUnique({ where: { id: visitorId } }) : null;
    if (visitor?.internal) visitor = null;
    if (visitor && !visitor.userId) {
      await prisma.visitor.update({ where: { id: visitor.id }, data: { userId } });
    }
    if (mode !== "signup") return;
    const touchId = visitor?.lastTouchId ?? visitor?.firstTouchId ?? null;
    try {
      await prisma.userAttribution.create({ data: { userId, signupTouchId: touchId, signupAt: new Date() } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    }
    const saved = await prisma.userAttribution.findUnique({ where: { userId } });
    await recordEvent({
      eventName: "SIGNUP_COMPLETED",
      dedupeKey: `signup:${userId}`,
      visitorId: visitor?.id,
      userId,
      touchId: saved?.signupTouchId ?? touchId,
    });
    const grant = await prisma.bonusGrant.findUnique({ where: { userId_source: { userId, source: "WELCOME" } } });
    if (grant?.status === "ACTIVE" && grant.eligibility === "GRANTED") {
      await recordEvent({
        eventName: "WELCOME_BONUS_GRANTED",
        dedupeKey: `welcome:${userId}`,
        visitorId: visitor?.id,
        userId,
        touchId: saved?.signupTouchId ?? touchId,
        metadata: { grantId: grant.id },
      });
    }
  } catch (error) {
    console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : "link visitor failed" }));
  }
}

export async function noteDepositStarted(userId: string, paymentId: string): Promise<void> {
  await recordEvent({ eventName: "DEPOSIT_STARTED", dedupeKey: `deposit-start:${paymentId}`, userId, touchId: await currentTouchId(userId), metadata: { paymentId } });
}

export async function noteWithdrawalRequested(userId: string, paymentId: string): Promise<void> {
  await recordEvent({
    eventName: "WITHDRAWAL_REQUESTED",
    dedupeKey: `withdraw-req:${paymentId}`,
    userId,
    touchId: await currentTouchId(userId),
    metadata: { paymentId },
  });
}

export async function noteSettlement(userId: string, paymentId: string, kind: "DEPOSIT" | "PAYOUT", amountPaise: bigint): Promise<void> {
  try {
    const touchId = await currentTouchId(userId);
    if (kind === "PAYOUT") {
      await recordEvent({ eventName: "WITHDRAWAL_SUCCESS", dedupeKey: `withdraw:${paymentId}`, userId, touchId, metadata: { paymentId } });
      return;
    }
    await recordEvent({
      eventName: "DEPOSIT_SUCCESS",
      dedupeKey: `deposit:${paymentId}`,
      userId,
      touchId,
      metadata: { paymentId, amountPaise: amountPaise.toString() },
    });
    const settled = await prisma.payment.count({ where: { userId, kind: "DEPOSIT", status: "SETTLED" } });
    if (settled !== 1) return;
    const existing = await prisma.userAttribution.findUnique({ where: { userId } });
    if (!existing) {
      try {
        await prisma.userAttribution.create({ data: { userId, firstDepositTouchId: touchId, firstDepositAt: new Date() } });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      }
    }
    await prisma.userAttribution.updateMany({
      where: { userId, firstDepositAt: null },
      data: { firstDepositTouchId: touchId, firstDepositAt: new Date() },
    });
    const saved = await prisma.userAttribution.findUnique({ where: { userId } });
    await recordEvent({
      eventName: "FIRST_DEPOSIT",
      dedupeKey: `ftd:${userId}`,
      userId,
      touchId: saved?.firstDepositTouchId ?? touchId,
      metadata: { paymentId, amountPaise: amountPaise.toString() },
    });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : "settlement analytics failed" }));
  }
}

export async function noteTrade(userId: string, trade: { tradeId: string; side: "BUY" | "SELL"; replayed?: boolean }): Promise<void> {
  if (trade.replayed) return;
  try {
    const touchId = await currentTouchId(userId);
    await recordEvent({
      eventName: "TRADE_STARTED",
      dedupeKey: `trade-start:${trade.tradeId}`,
      userId,
      touchId,
      metadata: { tradeId: trade.tradeId },
    });
    await recordEvent({
      eventName: trade.side === "BUY" ? "TRADE_BUY" : "TRADE_SELL",
      dedupeKey: `${trade.side === "BUY" ? "buy" : "sell"}:${trade.tradeId}`,
      userId,
      touchId,
      metadata: { tradeId: trade.tradeId },
    });
    const trades = await prisma.trade.count({ where: { userId } });
    if (trades !== 1) return;
    await recordEvent({ eventName: "FIRST_TRADE", dedupeKey: `first-trade:${userId}`, userId, touchId, metadata: { tradeId: trade.tradeId } });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : "trade analytics failed" }));
  }
}

export async function noteReferralCreated(userId: string, codeId: string): Promise<void> {
  await recordEvent({ eventName: "REFERRAL_CREATED", dedupeKey: `referral:${codeId}`, userId, metadata: { codeId } });
}

export async function getUtmTaxonomy(): Promise<{ sources: string[]; mediums: string[] }> {
  const { DEFAULT_UTM_MEDIUMS, DEFAULT_UTM_SOURCES } = await import("@/domain/attribution");
  const row = await prisma.appSetting.findUnique({ where: { key: TAXONOMY_KEY } });
  const value = row?.value as { sources?: unknown; mediums?: unknown } | null;
  const savedSources = Array.isArray(value?.sources) ? value.sources.filter((item): item is string => typeof item === "string") : [];
  const savedMediums = Array.isArray(value?.mediums) ? value.mediums.filter((item): item is string => typeof item === "string") : [];
  const sources = [...new Set([...DEFAULT_UTM_SOURCES, ...savedSources])];
  const mediums = [...new Set([...DEFAULT_UTM_MEDIUMS, ...savedMediums])];
  return { sources, mediums };
}

export async function saveUtmTaxonomy(sources: string[], mediums: string[], actorId: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: TAXONOMY_KEY },
    create: { key: TAXONOMY_KEY, value: { sources, mediums }, updatedBy: actorId },
    update: { value: { sources, mediums }, updatedBy: actorId },
  });
}

export function visitorCookieIds(cookieHeader: string | null): { visitorId: string | null; sessionId: string | null } {
  const read = (name: string) => {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(";")) {
      const [key, ...rest] = part.trim().split("=");
      if (key === name) return decodeURIComponent(rest.join("="));
    }
    return null;
  };
  const visitorId = read("pp_vid");
  const visit = read("pp_vst");
  const sessionId = visit?.split(".")[0] ?? null;
  return {
    visitorId: isVisitorId(visitorId) ? visitorId : null,
    sessionId: isVisitorId(sessionId) ? sessionId : null,
  };
}
