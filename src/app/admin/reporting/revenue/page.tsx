import { formatPaise } from "@/domain/money";
import { REPORTING_FORMULA } from "@/domain/reporting";
import { MetricDefinitions } from "@/components/metric-definitions";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Revenue" };

export default async function RevenuePage() {
  await assertPagePermission("report.view");
  const [deposits, payouts, trades] = await Promise.all([
    prisma.payment.aggregate({ where: { kind: "DEPOSIT", status: "SETTLED" }, _sum: { amountPaise: true }, _count: true }),
    prisma.payment.aggregate({ where: { kind: "PAYOUT", status: "SETTLED" }, _sum: { amountPaise: true }, _count: true }),
    prisma.trade.aggregate({ _sum: { cashPaise: true, bonusPaise: true }, _count: true }),
  ]);
  return (
    <main>
      <h2 className="text-2xl font-bold">Revenue</h2>
      <p className="mt-1 text-sm text-muted">Sums of existing settled payments and trade notionals. {REPORTING_FORMULA.operationalNgr} {REPORTING_FORMULA.paymentCosts}</p>
      <dl className="mt-4 grid gap-3 md:grid-cols-3">
        <Stat label="Settled deposits" value={formatPaise(deposits._sum.amountPaise ?? 0n)} hint={`${deposits._count} payments`} />
        <Stat label="Settled withdrawals" value={formatPaise(payouts._sum.amountPaise ?? 0n)} hint={`${payouts._count} payments`} />
        <Stat label="Trade notional" value={formatPaise((trades._sum.cashPaise ?? 0n) + (trades._sum.bonusPaise ?? 0n))} hint={`${trades._count} trades`} />
      </dl>
      <MetricDefinitions />
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-1 text-2xl font-bold">{value}</dd>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}
