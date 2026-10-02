import Link from "next/link";
import { SettingEditor } from "@/components/admin-controls";
import { prisma } from "@/server/prisma";
import { assertPagePermission } from "@/server/guard";
import { SETTING_DEFAULT_ROWS } from "@/server/settings";

const MATCHERS = {
  trading: (key: string) =>
    key.startsWith("spread.") || key.startsWith("quote.") || key.startsWith("feed.") || key.startsWith("pricing.") || key.startsWith("trade.") || key.startsWith("risk."),
  wallet: (key: string) => key.startsWith("withdrawal.") || key.startsWith("bonus.") || key.startsWith("crm."),
  all: (key: string) => !key.startsWith("feature.") && key !== "seo" && key !== "marketing.utmTaxonomy",
};

export async function SettingsList({
  group,
  title,
  note,
}: {
  group: keyof typeof MATCHERS;
  title: string;
  note: string;
}) {
  await assertPagePermission("settings.view");
  const settings = await prisma.appSetting.findMany({ orderBy: { key: "asc" } });
  const saved = new Map(settings.map((setting) => [setting.key, setting.value]));
  for (const fallback of SETTING_DEFAULT_ROWS) {
    if (!saved.has(fallback.key) && MATCHERS[group](fallback.key)) saved.set(fallback.key, fallback.value);
  }
  const rows = [...saved.entries()]
    .filter(([key]) => MATCHERS[group](key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({ key, value }));
  return (
    <main>
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{note}</p>
      <ul className="mt-4 space-y-3">
        {rows.length === 0 ? <li className="text-sm text-muted">No saved values yet. Defaults still apply.</li> : null}
        {rows.map((setting) => (
          <li key={setting.key} className="rounded-xl bg-card p-3">
            <SettingEditor settingKey={setting.key} value={typeof setting.value === "string" ? setting.value : JSON.stringify(setting.value)} />
          </li>
        ))}
      </ul>
      {group === "all" ? (
        <p className="mt-6 text-sm">
          <Link className="text-india" href="/admin/operations/audit">Open the read-only audit log</Link>
        </p>
      ) : null}
    </main>
  );
}
