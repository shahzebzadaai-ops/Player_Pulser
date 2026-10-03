import { audienceMembership, type AudienceId } from "@/domain/audiences";
import { prisma } from "./prisma";

export async function audienceFacts(userId: string, now = new Date()): Promise<AudienceId[]> {
  const [user, deposits, trades] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } }),
    prisma.payment.findMany({
      where: { userId, kind: "DEPOSIT", status: "SETTLED" },
      select: { amountPaise: true, settledAt: true },
    }),
    prisma.trade.findMany({ where: { userId }, select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 }),
  ]);
  if (!user || user.role !== "CUSTOMER") return [];
  const lastDeposit = deposits.reduce<Date | null>((latest, payment) => {
    if (!payment.settledAt) return latest;
    if (!latest || payment.settledAt > latest) return payment.settledAt;
    return latest;
  }, null);
  const lifetime = deposits.reduce((sum, payment) => sum + payment.amountPaise, 0n);
  return audienceMembership({
    registered: true,
    depositCount: deposits.length,
    tradeCount: await prisma.trade.count({ where: { userId } }),
    lifetimeDepositPaise: lifetime,
    lastTradeAt: trades[0]?.createdAt ?? null,
    lastDepositAt: lastDeposit,
    reactivated: false,
    now,
  });
}
