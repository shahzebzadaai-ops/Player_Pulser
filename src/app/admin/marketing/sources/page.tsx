import { resolveRange } from "@/domain/attribution";
import { RangeNav } from "@/components/range-nav";
import { assertPageAny } from "@/server/guard";
import { topSources } from "@/server/marketing-report";

export const metadata = { title: "Traffic sources" };

const ORDER = ["Meta", "Google", "Microsoft", "WhatsApp", "Push", "Referral", "Organic", "Direct", "Affiliate", "Other", "Unattributed"];

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  await assertPageAny(["analytics.view", "marketing.view"]);
  const params = await searchParams;
  const range = resolveRange(params);
  const rows = await topSources(range);
  const byLabel = new Map(rows.map((row) => [row.label, row]));
  const ordered = ORDER.map((label) => byLabel.get(label) ?? { label, visitors: 0, signups: 0, firstDeposits: 0, firstTrades: 0 });
  return (
    <main>
      <h2 className="text-2xl font-bold">Traffic sources</h2>
      <p className="mt-1 text-sm text-muted">Grouped from stored source values. Unknown sources sit in Other.</p>
      <RangeNav base="/admin/marketing/sources" range={params.range ?? "7d"} />
      <ul className="mt-4 space-y-2 text-sm">
        {ordered.map((row) => (
          <li key={row.label} className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-card px-3 py-2 md:grid-cols-5">
            <span className="font-semibold">{row.label}</span>
            <span>{row.visitors} visitors</span>
            <span>{row.signups} registered</span>
            <span>{row.firstDeposits} first deposits</span>
            <span>{row.firstTrades} first trades</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
