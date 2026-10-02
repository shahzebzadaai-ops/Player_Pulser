import { MetricDefinitions } from "@/components/metric-definitions";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Retention" };

export default async function RetentionPage() {
  await assertPagePermission("report.view");
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [customers, recentTraders, recentSignups] = await Promise.all([
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.trade.findMany({ where: { createdAt: { gte: since } }, distinct: ["userId"], select: { userId: true } }),
    prisma.user.count({ where: { role: "CUSTOMER", createdAt: { gte: since } } }),
  ]);
  return (
    <main>
      <h2 className="text-2xl font-bold">Retention</h2>
      <p className="mt-1 text-sm text-muted">Customers with at least one trade in the last 7 days.</p>
      <dl className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-line bg-card p-4"><dt className="text-xs text-muted">Customers</dt><dd className="text-2xl font-bold">{customers}</dd></div>
        <div className="rounded-2xl border border-line bg-card p-4"><dt className="text-xs text-muted">Traded in 7 days</dt><dd className="text-2xl font-bold">{recentTraders.length}</dd></div>
        <div className="rounded-2xl border border-line bg-card p-4"><dt className="text-xs text-muted">New in 7 days</dt><dd className="text-2xl font-bold">{recentSignups}</dd></div>
      </dl>
      <MetricDefinitions />
    </main>
  );
}
