import { resolveRange } from "@/domain/attribution";
import { RangeNav } from "@/components/range-nav";
import { assertPageAny } from "@/server/guard";
import { funnelReport } from "@/server/marketing-report";

export const metadata = { title: "Funnel" };

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; source?: string; campaign?: string; content?: string }>;
}) {
  await assertPageAny(["analytics.view", "marketing.view"]);
  const params = await searchParams;
  const range = resolveRange(params);
  const stages = await funnelReport(range, { source: params.source, campaign: params.campaign, content: params.content });
  return (
    <main>
      <h2 className="text-2xl font-bold">Funnel</h2>
      <p className="mt-1 text-sm text-muted">Counts come from first-party events. A stage rate is the share of the previous stage.</p>
      <RangeNav base="/admin/marketing/funnel" range={params.range ?? "7d"} />
      <form className="mt-3 flex flex-wrap items-end gap-2 text-sm" action="/admin/marketing/funnel">
        <input type="hidden" name="range" value={params.range ?? "7d"} />
        <label>Source<input className="mt-1 block min-h-10 rounded-xl border border-line bg-pitch px-2" name="source" defaultValue={params.source ?? ""} /></label>
        <label>Campaign<input className="mt-1 block min-h-10 rounded-xl border border-line bg-pitch px-2" name="campaign" defaultValue={params.campaign ?? ""} /></label>
        <label>Content<input className="mt-1 block min-h-10 rounded-xl border border-line bg-pitch px-2" name="content" defaultValue={params.content ?? ""} /></label>
        <button className="min-h-10 rounded-full bg-india px-3" type="submit">Filter</button>
      </form>
      <ol className="mt-4 space-y-2">
        {stages.map((stage) => (
          <li key={stage.label} className="flex items-center justify-between rounded-xl border border-line bg-card px-3 py-3 text-sm">
            <span className="font-semibold">{stage.label}</span>
            <span>{stage.count} · {stage.rate}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}
