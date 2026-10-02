import { formatPaise } from "@/domain/money";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Admin trades" };

export default async function AdminTradesPage() {
  await assertPagePermission("report.view");
  const trades = await prisma.trade.findMany({
    include: { user: true, player: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return (
    <main>
      <h2 className="text-2xl font-bold">Trades</h2>
      <ul className="mt-4 space-y-2 text-sm">
        {trades.length === 0 ? <li className="text-muted">No trades yet.</li> : null}
        {trades.map((trade) => (
          <li key={trade.id} className="rounded-xl border border-line bg-card px-3 py-3">
            {trade.side} {trade.quantity} {trade.player.name} by {trade.user.displayName} at {formatPaise(trade.unitPaise)}
            <span className="block text-xs text-muted">{trade.createdAt.toISOString()} · wagering {trade.countsForWagering ? "yes" : "no"}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
