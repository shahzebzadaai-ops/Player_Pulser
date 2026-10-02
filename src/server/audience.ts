import { isHighValue, isChurnRisk } from "@/domain/crm";
import { isVip } from "@/domain/vip";
import { prisma } from "./prisma";
import { getSettings } from "./settings";

export const AUDIENCE_PRESETS = [
  { id: "all", label: "All customers" },
  { id: "registered_no_deposit", label: "Registered No Deposit" },
  { id: "deposited_no_trade", label: "Deposited No Trade" },
  { id: "churn_risk", label: "Churn Risk" },
  { id: "active_traders", label: "Active Traders" },
  { id: "bonus_expired", label: "Bonus Expired" },
  { id: "vip", label: "VIP" },
  { id: "high_value", label: "High Value" },
  { id: "player_holders", label: "Player Holders" },
] as const;

export type AudiencePreset = (typeof AUDIENCE_PRESETS)[number]["id"];

const DAY = 24 * 60 * 60 * 1000;

export function isAudiencePreset(value: string | undefined): value is AudiencePreset {
  return AUDIENCE_PRESETS.some((preset) => preset.id === value);
}

export async function audienceRows(preset: AudiencePreset) {
  const select = { id: true, displayName: true, phone: true, email: true, createdAt: true } as const;
  const now = Date.now();
  if (preset === "all") return prisma.user.findMany({ where: { role: "CUSTOMER" }, select, orderBy: { createdAt: "asc" } });
  if (preset === "registered_no_deposit") {
    return prisma.user.findMany({
      where: { role: "CUSTOMER", payments: { none: { kind: "DEPOSIT", status: "SETTLED" } } },
      select,
      orderBy: { createdAt: "asc" },
    });
  }
  if (preset === "deposited_no_trade") {
    return prisma.user.findMany({
      where: { role: "CUSTOMER", payments: { some: { kind: "DEPOSIT", status: "SETTLED" } }, trades: { none: {} } },
      select,
      orderBy: { createdAt: "asc" },
    });
  }
  if (preset === "churn_risk") {
    const settings = await getSettings();
    const cutoff = new Date(now - settings.churnRiskInactiveDays * DAY);
    const customers = await prisma.user.findMany({
      where: { role: "CUSTOMER", trades: { some: {} } },
      select: { ...select, trades: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
      orderBy: { createdAt: "asc" },
    });
    return customers
      .filter((customer) =>
        isChurnRisk({
          accountCreatedAt: customer.createdAt,
          lastTradeAt: customer.trades[0]?.createdAt ?? null,
          now: new Date(now),
          inactiveDays: settings.churnRiskInactiveDays,
        }) && customer.createdAt < cutoff,
      )
      .map(({ trades: _trades, ...customer }) => customer);
  }
  if (preset === "active_traders") {
    return prisma.user.findMany({
      where: { role: "CUSTOMER", trades: { some: { createdAt: { gte: new Date(now - 7 * DAY) } } } },
      select,
      orderBy: { createdAt: "asc" },
    });
  }
  if (preset === "bonus_expired") {
    return prisma.user.findMany({
      where: { role: "CUSTOMER", bonuses: { some: { status: "EXPIRED" } } },
      select,
      orderBy: { createdAt: "asc" },
    });
  }
  if (preset === "vip") {
    const customers = await prisma.user.findMany({
      where: { role: "CUSTOMER" },
      select: {
        ...select,
        segmentMemberships: { select: { segment: { select: { name: true } } } },
      },
      orderBy: { createdAt: "asc" },
    });
    const tasks = await prisma.staffTask.findMany({
      where: { type: "VIP_CALL", status: { in: ["OPEN", "IN_PROGRESS"] }, customerId: { not: null } },
      select: { customerId: true },
    });
    const openTasks = new Set(tasks.map((task) => task.customerId));
    return customers
      .filter((customer) =>
        isVip({
          segmentNames: customer.segmentMemberships.map((member) => member.segment.name),
          openVipTask: openTasks.has(customer.id),
        }),
      )
      .map(({ segmentMemberships: _segments, ...customer }) => customer);
  }
  if (preset === "player_holders") {
    return prisma.user.findMany({
      where: { role: "CUSTOMER", lots: { some: { quantityRemaining: { gt: 0 } } } },
      select,
      orderBy: { createdAt: "asc" },
    });
  }
  const settings = await getSettings();
  const customers = await prisma.user.findMany({
    where: { role: "CUSTOMER" },
    select: { ...select, payments: { where: { kind: "DEPOSIT", status: "SETTLED" }, select: { amountPaise: true } } },
    orderBy: { createdAt: "asc" },
  });
  return customers
    .filter((customer) => isHighValue(customer.payments.reduce((sum, payment) => sum + payment.amountPaise, 0n), settings.highValueDepositThresholdPaise))
    .map(({ payments: _payments, ...customer }) => customer);
}
