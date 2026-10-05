import { lifecycleStage, type LifecycleStage } from "@/domain/growth";
import { prisma } from "./prisma";

function touchLabel(touch: { source: string | null; medium: string | null; campaign: string | null; content: string | null } | undefined): string {
  if (!touch) return "None recorded";
  const parts = [touch.source, touch.medium, touch.campaign, touch.content].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Direct";
}

export async function loadCrmUsers(role?: "CUSTOMER" | "ADMIN") {
  const users = await prisma.user.findMany({
    where: role ? { role } : undefined,
    include: {
      visitors: { orderBy: { firstSeenAt: "asc" }, take: 1, select: { firstTouchId: true, lastTouchId: true } },
      staffAccount: { select: { staffRole: true } },
      bonuses: { where: { source: "WELCOME" }, select: { id: true }, take: 1 },
      payments: { where: { kind: "DEPOSIT", status: "SETTLED" }, select: { id: true }, take: 1 },
      trades: { select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const touchIds = [...new Set(users.flatMap((user) => [user.visitors[0]?.firstTouchId, user.visitors[0]?.lastTouchId]).filter((id): id is string => Boolean(id)))];
  const touches = touchIds.length
    ? await prisma.trafficTouch.findMany({ where: { id: { in: touchIds } }, select: { id: true, source: true, medium: true, campaign: true, content: true } })
    : [];
  const byId = new Map(touches.map((touch) => [touch.id, touch]));
  return users.map((user) => {
    const visitor = user.visitors[0];
    const lifecycle: LifecycleStage = lifecycleStage({
      registered: true,
      bonusReceived: user.bonuses.length > 0,
      depositPending: false,
      deposited: user.payments.length > 0,
      traded: user.trades.length > 0,
      cooling: false,
      churnRisk: false,
      restricted: user.accountStatus === "RESTRICTED",
      contactVerified: Boolean(user.phoneVerifiedAt || user.emailVerifiedAt),
    });
    return {
      user,
      lifecycle,
      firstTouch: touchLabel(visitor?.firstTouchId ? byId.get(visitor.firstTouchId) : undefined),
      lastTouch: touchLabel(visitor?.lastTouchId ? byId.get(visitor.lastTouchId) : undefined),
    };
  });
}
