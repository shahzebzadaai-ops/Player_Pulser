import { ExportPresets } from "@/components/marketing-forms";
import { formatPaise } from "@/domain/money";
import { VIP_RULE } from "@/domain/vip";
import { assertPagePermission } from "@/server/guard";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Audience export" };

export default async function MarketingExportPage() {
  await assertPagePermission("audience.export");
  const settings = await getSettings();
  return (
    <main>
      <h2 className="text-2xl font-bold">Audience export</h2>
      <p className="mt-1 text-sm text-muted">Download only. Nothing is sent to an ad platform. Each download is written to the audit log.</p>
      <p className="mt-3 text-sm text-muted">High Value means settled deposits of at least {formatPaise(settings.highValueDepositThresholdPaise)}. Churn Risk means a customer who has traded, but not in the last {settings.churnRiskInactiveDays} days. {VIP_RULE}</p>
      <ExportPresets />
    </main>
  );
}
