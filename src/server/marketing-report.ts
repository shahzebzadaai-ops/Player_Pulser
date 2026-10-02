import { Prisma } from "@prisma/client";
import { rate, sourceBucket, type DateRange } from "@/domain/attribution";
import { operationalNgr, summarizeBonus } from "@/domain/reporting";
import { prisma } from "./prisma";

type Span = { start: Date; end: Date };

function inSpan(span: Span) {
  return { gte: span.start, lt: span.end };
}

export async function businessPulse(span: Span) {
  const [deposits, withdrawals, trades, bonusLines, positions, ggrRows, activeTraders, firstDepositors, firstTrades, signups, activeUsers] = await Promise.all([
    prisma.payment.aggregate({ where: { kind: "DEPOSIT", status: "SETTLED", settledAt: inSpan(span) }, _sum: { amountPaise: true } }),
    prisma.payment.aggregate({ where: { kind: "PAYOUT", status: "SETTLED", settledAt: inSpan(span) }, _sum: { amountPaise: true } }),
    prisma.trade.aggregate({ where: { createdAt: inSpan(span) }, _sum: { cashPaise: true, bonusPaise: true } }),
    prisma.ledgerEntry.findMany({
      where: {
        createdAt: inSpan(span),
        entryType: { in: ["BONUS_GRANT", "TRADE_BUY", "BONUS_EXPIRE", "BONUS_CONVERT"] },
      },
      select: { entryType: true, account: true, amountPaise: true },
    }),
    prisma.holdingLot.count({ where: { quantityRemaining: { gt: 0 } } }),
    prisma.$queryRaw<[{ ggr: bigint }]>`
      SELECT COALESCE(SUM(ABS(t."unitPaise" - q."midPaise") * t.quantity), 0)::bigint AS ggr
      FROM "Trade" t
      JOIN "Quote" q ON q.id = t."quoteId"
      WHERE t."createdAt" >= ${span.start} AND t."createdAt" < ${span.end}
    `,
    prisma.trade.findMany({ where: { createdAt: inSpan(span) }, distinct: ["userId"], select: { userId: true } }),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT "userId", MIN("settledAt") AS first_at
        FROM "Payment"
        WHERE kind = 'DEPOSIT' AND status = 'SETTLED' AND "settledAt" IS NOT NULL
        GROUP BY "userId"
      ) firsts
      WHERE first_at >= ${span.start} AND first_at < ${span.end}
    `,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT "userId", MIN("createdAt") AS first_at FROM "Trade" GROUP BY "userId"
      ) firsts
      WHERE first_at >= ${span.start} AND first_at < ${span.end}
    `,
    prisma.user.count({ where: { role: "CUSTOMER", createdAt: inSpan(span) } }),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT "userId" FROM "Trade" WHERE "createdAt" >= ${span.start} AND "createdAt" < ${span.end}
        UNION
        SELECT "userId" FROM "Payment" WHERE status = 'SETTLED' AND "settledAt" >= ${span.start} AND "settledAt" < ${span.end}
      ) people
    `,
  ]);
  const ggr = ggrRows[0]?.ggr ?? 0n;
  const bonus = summarizeBonus(bonusLines);
  return {
    deposits: deposits._sum.amountPaise ?? 0n,
    withdrawals: withdrawals._sum.amountPaise ?? 0n,
    tradingVolume: (trades._sum.cashPaise ?? 0n) + (trades._sum.bonusPaise ?? 0n),
    ggr,
    ngr: operationalNgr({ ggrPaise: ggr, realizedBonusCostPaise: bonus.realizedCostPaise }),
    bonusIssued: bonus.issuedPaise,
    bonusUsed: bonus.usedPaise,
    bonusExpired: bonus.expiredPaise,
    bonusConverted: bonus.convertedPaise,
    realizedBonusCost: bonus.realizedCostPaise,
    paymentProcessingCost: 0n,
    chargebackCost: 0n,
    openPositions: positions,
    activeTraders: activeTraders.length,
    activeUsers: Number(activeUsers[0]?.count ?? 0n),
    firstDepositors: Number(firstDepositors[0]?.count ?? 0n),
    firstTrades: Number(firstTrades[0]?.count ?? 0n),
    signups,
  };
}

export async function firstTrackedAt(): Promise<Date | null> {
  const publicVisit = await prisma.visitor.findFirst({
    where: { internal: false },
    orderBy: { firstSeenAt: "asc" },
    select: { firstSeenAt: true },
  });
  if (publicVisit) return publicVisit.firstSeenAt;
  const anyVisit = await prisma.visitor.findFirst({ orderBy: { firstSeenAt: "asc" }, select: { firstSeenAt: true } });
  return anyVisit?.firstSeenAt ?? null;
}

export async function visitorCount(span: Span): Promise<number> {
  const rows = await prisma.visitSession.findMany({
    where: { startedAt: inSpan(span), visitor: { internal: false } },
    distinct: ["visitorId"],
    select: { visitorId: true },
  });
  return rows.length;
}

export type SourceRow = { label: string; visitors: number; signups: number; firstDeposits: number; firstTrades: number };

export async function topSources(span: Span): Promise<SourceRow[]> {
  const touches = await prisma.trafficTouch.findMany({
    where: { touchedAt: inSpan(span), visitor: { internal: false } },
    select: { visitorId: true, source: true, id: true },
  });
  const visitors = new Map<string, Set<string>>();
  const touchSource = new Map<string, string>();
  for (const touch of touches) {
    const label = sourceBucket(touch.source);
    const set = visitors.get(label) ?? new Set<string>();
    set.add(touch.visitorId);
    visitors.set(label, set);
    touchSource.set(touch.id, label);
  }
  const [signups, deposits, trades] = await Promise.all([
    prisma.userAttribution.findMany({ where: { signupAt: inSpan(span) }, select: { signupTouchId: true, userId: true } }),
    prisma.userAttribution.findMany({ where: { firstDepositAt: inSpan(span) }, select: { firstDepositTouchId: true, userId: true } }),
    prisma.analyticsEvent.findMany({
      where: { eventName: "FIRST_TRADE", occurredAt: inSpan(span) },
      select: { touchId: true, userId: true },
    }),
  ]);
  const bump = (rows: { touchId: string | null }[], key: "signups" | "firstDeposits" | "firstTrades", table: Map<string, SourceRow>) => {
    for (const row of rows) {
      const label = row.touchId ? (touchSource.get(row.touchId) ?? "Other") : "Unattributed";
      const current = table.get(label) ?? { label, visitors: visitors.get(label)?.size ?? 0, signups: 0, firstDeposits: 0, firstTrades: 0 };
      current[key] += 1;
      table.set(label, current);
    }
  };
  const table = new Map<string, SourceRow>();
  for (const [label, ids] of visitors) table.set(label, { label, visitors: ids.size, signups: 0, firstDeposits: 0, firstTrades: 0 });
  bump(signups.map((row) => ({ touchId: row.signupTouchId })), "signups", table);
  bump(deposits.map((row) => ({ touchId: row.firstDepositTouchId })), "firstDeposits", table);
  bump(trades.map((row) => ({ touchId: row.touchId })), "firstTrades", table);
  return [...table.values()].sort((a, b) => b.visitors - a.visitors).slice(0, 8);
}

export async function topCampaigns(span: Span): Promise<{ campaign: string; visitors: number; signups: number }[]> {
  const touches = await prisma.trafficTouch.findMany({
    where: { touchedAt: inSpan(span), campaign: { not: null }, visitor: { internal: false } },
    select: { id: true, visitorId: true, campaign: true },
  });
  const visitors = new Map<string, Set<string>>();
  const touchCampaign = new Map<string, string>();
  for (const touch of touches) {
    const campaign = touch.campaign ?? "";
    const set = visitors.get(campaign) ?? new Set<string>();
    set.add(touch.visitorId);
    visitors.set(campaign, set);
    touchCampaign.set(touch.id, campaign);
  }
  const signups = await prisma.userAttribution.findMany({ where: { signupAt: inSpan(span), signupTouchId: { not: null } }, select: { signupTouchId: true } });
  const counts = new Map<string, number>();
  for (const signup of signups) {
    const campaign = signup.signupTouchId ? touchCampaign.get(signup.signupTouchId) : null;
    if (!campaign) continue;
    counts.set(campaign, (counts.get(campaign) ?? 0) + 1);
  }
  return [...visitors.entries()]
    .map(([campaign, ids]) => ({ campaign, visitors: ids.size, signups: counts.get(campaign) ?? 0 }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 8);
}

export type AttributionRow = {
  label: string;
  visitors: number;
  signups: number;
  signupRate: string;
  firstDeposits: number;
  ftdRate: string;
  firstTrades: number;
  depositPaise: bigint;
  tradingVolumePaise: bigint;
};

export async function attributionBreakdown(span: Span, dimension: "source" | "medium" | "campaign" | "content"): Promise<AttributionRow[]> {
  const touches = await prisma.trafficTouch.findMany({
    where: { visitor: { internal: false } },
    select: { id: true, visitorId: true, source: true, medium: true, campaign: true, content: true, touchedAt: true },
  });
  const labelOf = (touch: (typeof touches)[number]) => touch[dimension] || "none";
  const touchLabel = new Map(touches.map((touch) => [touch.id, labelOf(touch)]));
  const visitorLabels = new Map<string, Set<string>>();
  for (const touch of touches) {
    if (touch.touchedAt < span.start || touch.touchedAt >= span.end) continue;
    const label = labelOf(touch);
    const set = visitorLabels.get(label) ?? new Set<string>();
    set.add(touch.visitorId);
    visitorLabels.set(label, set);
  }
  const [signups, deposits, trades, payments, volume] = await Promise.all([
    prisma.userAttribution.findMany({ where: { signupAt: inSpan(span) }, select: { userId: true, signupTouchId: true } }),
    prisma.userAttribution.findMany({ where: { firstDepositAt: inSpan(span) }, select: { userId: true, firstDepositTouchId: true } }),
    prisma.analyticsEvent.findMany({ where: { eventName: "FIRST_TRADE", occurredAt: inSpan(span) }, select: { userId: true, touchId: true } }),
    prisma.payment.findMany({ where: { kind: "DEPOSIT", status: "SETTLED", settledAt: inSpan(span) }, select: { userId: true, amountPaise: true } }),
    prisma.trade.findMany({ where: { createdAt: inSpan(span) }, select: { userId: true, cashPaise: true, bonusPaise: true } }),
  ]);
  const userLabel = new Map<string, string>();
  for (const signup of signups) if (signup.signupTouchId && touchLabel.has(signup.signupTouchId)) userLabel.set(signup.userId, touchLabel.get(signup.signupTouchId)!);
  for (const deposit of deposits) {
    if (!userLabel.has(deposit.userId) && deposit.firstDepositTouchId && touchLabel.has(deposit.firstDepositTouchId)) {
      userLabel.set(deposit.userId, touchLabel.get(deposit.firstDepositTouchId)!);
    }
  }
  const rows = new Map<string, AttributionRow>();
  const row = (label: string) => {
    const current = rows.get(label) ?? {
      label,
      visitors: visitorLabels.get(label)?.size ?? 0,
      signups: 0,
      signupRate: "0%",
      firstDeposits: 0,
      ftdRate: "0%",
      firstTrades: 0,
      depositPaise: 0n,
      tradingVolumePaise: 0n,
    };
    rows.set(label, current);
    return current;
  };
  for (const label of visitorLabels.keys()) row(label);
  for (const signup of signups) row(signup.signupTouchId ? (touchLabel.get(signup.signupTouchId) ?? "unattributed") : "unattributed").signups += 1;
  for (const deposit of deposits) row(deposit.firstDepositTouchId ? (touchLabel.get(deposit.firstDepositTouchId) ?? "unattributed") : "unattributed").firstDeposits += 1;
  for (const trade of trades) row(trade.touchId ? (touchLabel.get(trade.touchId) ?? "unattributed") : "unattributed").firstTrades += 1;
  for (const payment of payments) row(userLabel.get(payment.userId) ?? "unattributed").depositPaise += payment.amountPaise;
  for (const trade of volume) row(userLabel.get(trade.userId) ?? "unattributed").tradingVolumePaise += trade.cashPaise + trade.bonusPaise;
  return [...rows.values()]
    .map((item) => ({ ...item, signupRate: rate(item.signups, item.visitors), ftdRate: rate(item.firstDeposits, item.signups) }))
    .sort((a, b) => b.visitors - a.visitors);
}

export async function funnelReport(span: Span, filter: { source?: string; campaign?: string; content?: string }) {
  const touchWhere: Prisma.TrafficTouchWhereInput = { visitor: { internal: false } };
  if (filter.source) touchWhere.source = filter.source;
  if (filter.campaign) touchWhere.campaign = filter.campaign;
  if (filter.content) touchWhere.content = filter.content;
  const filtered = Boolean(filter.source || filter.campaign || filter.content);
  const touches = filtered ? await prisma.trafficTouch.findMany({ where: touchWhere, select: { id: true, visitorId: true } }) : [];
  const touchIds = touches.map((touch) => touch.id);
  const visitorIds = [...new Set(touches.map((touch) => touch.visitorId))];
  const eventWhere = (eventName: string): Prisma.AnalyticsEventWhereInput => ({
    eventName,
    occurredAt: inSpan(span),
    OR: [{ visitorId: null }, { visitor: { internal: false } }],
    ...(filtered ? { touchId: { in: touchIds.length ? touchIds : ["__none__"] } } : {}),
  });
  const countName = (eventName: string) => prisma.analyticsEvent.count({ where: eventWhere(eventName) });
  const [visitors, prompted, started, verified, registered, depositViewed, depositStarted, deposited, traded] = await Promise.all([
    filtered
      ? visitorIds.length
      : prisma.visitSession.findMany({ where: { startedAt: inSpan(span), visitor: { internal: false } }, distinct: ["visitorId"], select: { visitorId: true } }).then((rows) => rows.length),
    countName("SIGNUP_PROMPT_SHOWN"),
    countName("SIGNUP_STARTED"),
    countName("OTP_VERIFIED"),
    countName("SIGNUP_COMPLETED"),
    countName("DEPOSIT_PAGE_VIEWED"),
    countName("DEPOSIT_STARTED"),
    countName("FIRST_DEPOSIT"),
    countName("FIRST_TRADE"),
  ]);
  const stages = [
    { label: "Landing visitors", count: typeof visitors === "number" ? visitors : 0 },
    { label: "Signup prompt shown", count: prompted },
    { label: "Signup started", count: started },
    { label: "OTP verified", count: verified },
    { label: "Registered", count: registered },
    { label: "Deposit page viewed", count: depositViewed },
    { label: "Deposit started", count: depositStarted },
    { label: "First deposit", count: deposited },
    { label: "First trade", count: traded },
  ];
  return stages.map((stage, index) => ({
    ...stage,
    rate: index === 0 ? "100%" : rate(stage.count, stages[index - 1]?.count ?? 0),
  }));
}

export async function campaignLinkMetrics(link: {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string | null;
  utmTerm: string | null;
}) {
  const touches = await prisma.trafficTouch.findMany({
    where: {
      source: link.utmSource,
      medium: link.utmMedium,
      campaign: link.utmCampaign,
      content: link.utmContent,
      term: link.utmTerm,
      visitor: { internal: false },
    },
    select: { id: true, visitorId: true },
  });
  const touchIds = touches.map((touch) => touch.id);
  if (touchIds.length === 0) return { visits: 0, signups: 0, firstDeposits: 0, firstTrades: 0 };
  const [signups, firstDeposits, firstTrades] = await Promise.all([
    prisma.userAttribution.count({ where: { signupTouchId: { in: touchIds } } }),
    prisma.userAttribution.count({ where: { firstDepositTouchId: { in: touchIds } } }),
    prisma.analyticsEvent.count({ where: { eventName: "FIRST_TRADE", touchId: { in: touchIds } } }),
  ]);
  return { visits: new Set(touches.map((touch) => touch.visitorId)).size, signups, firstDeposits, firstTrades };
}

export async function overviewBundle(range: DateRange) {
  const [current, previous, visitors, previousVisitors, sources, campaigns] = await Promise.all([
    businessPulse(range),
    businessPulse({ start: range.previousStart, end: range.previousEnd }),
    visitorCount(range),
    visitorCount({ start: range.previousStart, end: range.previousEnd }),
    topSources(range),
    topCampaigns(range),
  ]);
  return { current, previous, visitors, previousVisitors, sources, campaigns };
}
