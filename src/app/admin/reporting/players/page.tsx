import { formatPaise } from "@/domain/money";
import { MetricDefinitions } from "@/components/metric-definitions";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Player performance" };

export default async function PlayerPerformancePage() {
  await assertPagePermission("report.view");
  const trades = await prisma.trade.groupBy({
    by: ["playerId"],
    _count: true,
    _sum: { cashPaise: true, bonusPaise: true, quantity: true },
  });
  const players = await prisma.player.findMany({ where: { id: { in: trades.map((trade) => trade.playerId) } } });
  const names = new Map(players.map((player) => [player.id, player.name]));
  const rows = [...trades].sort((a, b) => b._count - a._count);
  return (
    <main>
      <h2 className="text-2xl font-bold">Player performance</h2>
      <p className="mt-1 text-sm text-muted">Counts and notionals from stored trades.</p>
      <ul className="mt-4 space-y-2 text-sm">
        {rows.length === 0 ? <li className="text-muted">No trades yet.</li> : null}
        {rows.map((row) => (
          <li key={row.playerId} className="rounded-xl border border-line bg-card px-3 py-2">
            {names.get(row.playerId) ?? "Player"} · {row._count} trades · {row._sum.quantity ?? 0} units · {formatPaise((row._sum.cashPaise ?? 0n) + (row._sum.bonusPaise ?? 0n))}
          </li>
        ))}
      </ul>
      <MetricDefinitions />
    </main>
  );
}
