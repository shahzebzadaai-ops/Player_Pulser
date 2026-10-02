import Link from "next/link";
import { changeLabel, resolveRange } from "@/domain/attribution";
import { formatPaise } from "@/domain/money";
import { REPORTING_FORMULA, ratesAreComparable, trackingStamp, trackingWarning } from "@/domain/reporting";
import { MetricDefinitions } from "@/components/metric-definitions";
import { RangeNav } from "@/components/range-nav";
import { getAttentionItems } from "@/server/attention";
import { firstTrackedAt, overviewBundle } from "@/server/marketing-report";

export const metadata = { title: "Admin overview" };

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const range = resolveRange(params);
  const [data, attention, firstVisitor] = await Promise.all([
    overviewBundle(range),
    getAttentionItems(),
    firstTrackedAt(),
  ]);
  const { current, previous } = data;
  const warning = trackingWarning(range.start, firstVisitor);
  const comparable = ratesAreComparable(range.start, firstVisitor);
  return (
    <main>
      <h2 className="text-2xl font-bold">Overview</h2>
      <p className="mt-1 text-sm text-muted">{range.label}. Comparisons use the previous window of the same length. Times use Asia/Kolkata. {trackingStamp(firstVisitor)}.</p>
      {warning ? <p className="mt-2 text-sm text-muted">{warning}</p> : null}
      <section className="mt-4 rounded-2xl border border-line bg-card px-3 py-3">
        <h3 className="text-sm font-semibold">Attention needed</h3>
        {attention.length === 0 ? <p className="mt-2 text-sm text-muted">No urgent operational issues.</p> : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {attention.map((item) => (
              <li key={item.label}>
                <Link className="inline-flex min-h-10 items-center rounded-full bg-pitch px-3 text-sm text-india" href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <RangeNav base="/admin" range={params.range ?? "7d"} />
      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Visitors" value={String(data.visitors)} hint={changeLabel(data.visitors, data.previousVisitors)} />
        <Stat label="Signups" value={String(current.signups)} hint={changeLabel(current.signups, previous.signups)} />
        <Stat label="First depositors" value={String(current.firstDepositors)} hint={changeLabel(current.firstDepositors, previous.firstDepositors)} />
        <Stat label="Active traders" value={String(current.activeTraders)} hint={changeLabel(current.activeTraders, previous.activeTraders)} />
        <Stat label="Deposits" value={formatPaise(current.deposits)} hint={moneyChange(current.deposits, previous.deposits)} />
        <Stat label="Operational NGR" value={formatPaise(current.ngr)} hint={moneyChange(current.ngr, previous.ngr)} />
      </section>
      <section className="mt-6">
        <h3 className="font-semibold">{comparable ? "Acquisition funnel" : "Account activity"}</h3>
        <ol className={`mt-3 grid gap-2 ${comparable ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
          {comparable ? <Step label="Visitors" value={data.visitors} /> : null}
          <Step label="Registered" value={current.signups} />
          <Step label="First deposits" value={current.firstDepositors} />
          <Step label="First trade" value={current.firstTrades} />
        </ol>
        {comparable ? null : <p className="mt-2 text-xs text-muted">Tracked visitors stay in the visitors card above. They are not lined up against older signups or deposits.</p>}
      </section>
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <List title="Top traffic sources" rows={data.sources.map((row) => `${row.label} · ${row.visitors} visitors · ${row.signups} signups`)} empty="No attributed visits in this window." />
        <List title="Top campaigns" rows={data.campaigns.map((row) => `${row.campaign} · ${row.visitors} visitors · ${row.signups} signups`)} empty="No campaign tags in this window." />
      </section>
      <section className="mt-6">
        <h3 className="font-semibold">Business pulse</h3>
        <p className="mt-1 max-w-3xl text-xs text-muted">{REPORTING_FORMULA.ggr} {REPORTING_FORMULA.operationalNgr} {REPORTING_FORMULA.realizedBonusCost} {REPORTING_FORMULA.paymentCosts} Open positions are current.</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Deposits" value={formatPaise(current.deposits)} />
          <Stat label="Withdrawals" value={formatPaise(current.withdrawals)} />
          <Stat label="Trading volume" value={formatPaise(current.tradingVolume)} />
          <Stat label="GGR" value={formatPaise(current.ggr)} />
          <Stat label="Operational NGR" value={formatPaise(current.ngr)} />
          <Stat label="Bonus issued" value={formatPaise(current.bonusIssued)} />
          <Stat label="Bonus used" value={formatPaise(current.bonusUsed)} />
          <Stat label="Bonus expired" value={formatPaise(current.bonusExpired)} />
          <Stat label="Bonus converted" value={formatPaise(current.bonusConverted)} />
          <Stat label="Realized bonus cost" value={formatPaise(current.realizedBonusCost)} />
          <Stat label="Payment processing" value={formatPaise(current.paymentProcessingCost)} hint="Not configured" />
          <Stat label="Chargebacks / refunds" value={formatPaise(current.chargebackCost)} hint="Not configured" />
          <Stat label="Active users" value={String(current.activeUsers)} />
          <Stat label="Open positions" value={String(current.openPositions)} />
        </dl>
      </section>
      <MetricDefinitions />
    </main>
  );
}

function moneyChange(current: bigint, previous: bigint): string | null {
  if (previous === 0n && current === 0n) return null;
  if (previous === 0n) return "New";
  const pct = Number(((current - previous) * 100n) / previous);
  return `${pct >= 0 ? "+" : ""}${pct}% vs previous`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-1 text-xl font-semibold">{value}</dd>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function Step({ label, value }: { label: string; value: number }) {
  return (
    <li className="rounded-2xl border border-line bg-card px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="num text-lg font-semibold">{value}</p>
    </li>
  );
}

function List({ title, rows, empty }: { title: string; rows: string[]; empty: string }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.length === 0 ? <li className="text-muted">{empty}</li> : null}
        {rows.map((row) => (
          <li key={row} className="rounded-xl border border-line bg-card px-3 py-2">{row}</li>
        ))}
      </ul>
    </div>
  );
}
