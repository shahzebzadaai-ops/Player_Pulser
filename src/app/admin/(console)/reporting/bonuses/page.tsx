import { formatPaise } from "@/domain/money";
import { REPORTING_FORMULA } from "@/domain/reporting";
import { MetricDefinitions } from "@/components/metric-definitions";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Bonus analytics" };

export default async function BonusAnalyticsPage() {
  await assertPagePermission("report.view");
  const [grouped, active] = await Promise.all([
    prisma.bonusGrant.groupBy({ by: ["status"], _count: true, _sum: { amountPaise: true } }),
    prisma.bonusGrant.aggregate({ where: { status: "ACTIVE" }, _sum: { wageringProgressPaise: true, wageringRequiredPaise: true } }),
  ]);
  return (
    <main>
      <h2 className="text-2xl font-bold">Bonus analytics</h2>
      <p className="mt-1 text-sm text-muted">Existing grants only. Turning the bonus system off does not remove these rows. {REPORTING_FORMULA.realizedBonusCost}</p>
      <ul className="mt-4 space-y-2 text-sm">
        {grouped.map((row) => (
          <li key={row.status} className="rounded-xl border border-line bg-card px-3 py-2">
            {row.status} · {row._count} · {formatPaise(row._sum.amountPaise ?? 0n)}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted">
        Active wagering progress {formatPaise(active._sum.wageringProgressPaise ?? 0n)} of {formatPaise(active._sum.wageringRequiredPaise ?? 0n)}.
      </p>
      <MetricDefinitions />
    </main>
  );
}
