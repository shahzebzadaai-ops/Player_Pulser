import { resolveRange } from "@/domain/attribution";
import { formatPaise } from "@/domain/money";
import { ratesAreComparable, trackingStamp, trackingWarning } from "@/domain/reporting";
import { MetricDefinitions } from "@/components/metric-definitions";
import { RangeNav } from "@/components/range-nav";
import { assertPageAny } from "@/server/guard";
import { attributionBreakdown, firstTrackedAt } from "@/server/marketing-report";

export const metadata = { title: "Attribution" };

const DIMENSIONS = ["source", "medium", "campaign", "content"] as const;

export default async function AttributionPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; by?: string }>;
}) {
  await assertPageAny(["analytics.view", "marketing.view"]);
  const params = await searchParams;
  const range = resolveRange(params);
  const by = DIMENSIONS.find((item) => item === params.by) ?? "source";
  const [breakdown, firstVisitor] = await Promise.all([
    attributionBreakdown(range, by),
    firstTrackedAt(),
  ]);
  const comparable = ratesAreComparable(range.start, firstVisitor);
  const rows = comparable ? breakdown : breakdown.map((row) => ({ ...row, signupRate: "—", ftdRate: "—" }));
  const warning = trackingWarning(range.start, firstVisitor);
  return (
    <main>
      <h2 className="text-2xl font-bold">Attribution</h2>
      <p className="mt-1 text-sm text-muted">First-party visits only. Staff and admin traffic is excluded. Ad spend is not estimated. {trackingStamp(firstVisitor)}.</p>
      {warning ? <p className="mt-2 text-sm text-muted">{warning} Signup and first-deposit rates are hidden for this window.</p> : null}
      <RangeNav base="/admin/marketing/attribution" range={params.range ?? "7d"} />
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {DIMENSIONS.map((item) => (
          <a key={item} className={`inline-flex min-h-10 items-center rounded-full px-3 ${by === item ? "bg-india" : "bg-card"}`} href={`/admin/marketing/attribution?range=${params.range ?? "7d"}&by=${item}`}>
            {item}
          </a>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              {["Name", "Visitors", "Signups", "Signup rate", "First deposits", "FTD rate", "First trades", "Deposit amount", "Trading volume"].map((heading) => (
                <th key={heading} className="px-2 py-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td className="px-2 py-3 text-muted" colSpan={9}>No visits in this window.</td></tr> : null}
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-line">
                <td className="px-2 py-2">{row.label}</td>
                <td className="px-2 py-2">{row.visitors}</td>
                <td className="px-2 py-2">{row.signups}</td>
                <td className="px-2 py-2">{row.signupRate}</td>
                <td className="px-2 py-2">{row.firstDeposits}</td>
                <td className="px-2 py-2">{row.ftdRate}</td>
                <td className="px-2 py-2">{row.firstTrades}</td>
                <td className="px-2 py-2">{formatPaise(row.depositPaise)}</td>
                <td className="px-2 py-2">{formatPaise(row.tradingVolumePaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MetricDefinitions />
    </main>
  );
}
