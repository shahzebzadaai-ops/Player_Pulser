import Link from "next/link";
import { formatPaise, formatSignedPaise } from "@/domain/money";
import { assertPagePermission } from "@/server/guard";
import { riskOverview } from "@/server/risk";

export const metadata = { title: "Risk and exposure" };

export default async function RiskPage() {
  await assertPagePermission("risk.view");
  const board = await riskOverview();
  return (
    <main>
      <h2 className="text-2xl font-bold">Risk and exposure</h2>
      <p className="mt-1 text-sm text-muted">Marked at the current mid. These limits do not change the price or the spread. Recent volume is the last 24 hours.</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Total open marked exposure" value={formatPaise(board.totalMarkedPaise)} />
        <Card label="High risk players" value={String(board.highRisk)} />
        <Card label="Warning players" value={String(board.warnings)} />
        <Card label="Largest user exposure" value={board.largestUser ? `${board.largestUser.name} · ${formatPaise(board.largestUser.notionalPaise)}` : "None"} />
      </dl>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              {["Player", "Mid", "Outstanding", "Marked value", "Customer P&L", "Largest holder", "Top 10", "Limit used", "State"].map((heading) => (
                <th key={heading} className="px-2 py-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row) => (
              <tr key={row.playerId} className="border-t border-line">
                <td className="px-2 py-2"><Link className="text-india" href={`/admin/market/risk/${row.playerId}`}>{row.name}</Link></td>
                <td className="px-2 py-2">{formatPaise(row.midPaise)}</td>
                <td className="px-2 py-2">{row.outstanding}</td>
                <td className="px-2 py-2">{formatPaise(row.markedPaise)}</td>
                <td className="px-2 py-2">{formatSignedPaise(row.unrealizedPaise)}</td>
                <td className="px-2 py-2">{row.largestHolderName}</td>
                <td className="px-2 py-2">{row.top10SharePct.toFixed(1)}%</td>
                <td className="px-2 py-2">{row.limitUsedPct.toFixed(1)}%</td>
                <td className="px-2 py-2">{row.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}
