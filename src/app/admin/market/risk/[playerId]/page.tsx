import Link from "next/link";
import { notFound } from "next/navigation";
import { RiskControls } from "@/components/risk-controls";
import { formatPaise, formatSignedPaise } from "@/domain/money";
import { hasPermission } from "@/domain/permissions";
import { assertPagePermission } from "@/server/guard";
import { playerRiskDetail } from "@/server/risk";

export const metadata = { title: "Player risk" };

export default async function PlayerRiskPage({ params }: { params: Promise<{ playerId: string }> }) {
  const access = await assertPagePermission("risk.view");
  const { playerId } = await params;
  const detail = await playerRiskDetail(playerId);
  if (!detail) notFound();
  const { row, history, platformLimitPaise } = detail;
  return (
    <main>
      <p className="text-sm"><Link className="text-india" href="/admin/market/risk">Risk and exposure</Link></p>
      <h2 className="mt-2 text-2xl font-bold">{row.name}</h2>
      <p className="mt-1 text-sm text-muted">State {row.state}. Manual control {row.manualMode}. Mid {formatPaise(row.midPaise)}.</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Outstanding Pulsers" value={String(row.outstanding)} />
        <Stat label="Customer cost basis" value={formatPaise(row.costPaise)} />
        <Stat label="Marked value" value={formatPaise(row.markedPaise)} />
        <Stat label="Customer unrealized P&L" value={formatSignedPaise(row.unrealizedPaise)} />
        <Stat label="Platform limit" value={formatPaise(platformLimitPaise)} />
        <Stat label="Limit used" value={`${row.limitUsedPct.toFixed(1)}%`} />
        <Stat label="Recent buy volume" value={formatPaise(row.recentBuyPaise)} />
        <Stat label="Recent sell volume" value={formatPaise(row.recentSellPaise)} />
      </dl>
      <RiskControls
        playerId={row.playerId}
        manualMode={row.manualMode}
        canManage={hasPermission(access.staffRole, "risk.manage")}
        canPause={hasPermission(access.staffRole, "risk.pause")}
      />
      <h3 className="mt-6 font-semibold">Largest holders</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {row.holders.length === 0 ? <li className="text-muted">No open holdings.</li> : null}
        {row.holders.slice(0, 10).map((holder) => (
          <li key={holder.userId} className="rounded-xl border border-line bg-card px-3 py-2">
            {holder.name} · {holder.quantity} Pulsers · {formatPaise(holder.markedPaise)} · cost {formatPaise(holder.costPaise)}
          </li>
        ))}
      </ul>
      <h3 className="mt-6 font-semibold">Risk history</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {history.length === 0 ? <li className="text-muted">No state changes recorded.</li> : null}
        {history.map((change) => (
          <li key={change.id} className="rounded-xl border border-line bg-card px-3 py-2">
            {change.oldState} → {change.newState}
            <span className="block text-xs text-muted">{change.reason} · {change.createdAt.toISOString()}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
