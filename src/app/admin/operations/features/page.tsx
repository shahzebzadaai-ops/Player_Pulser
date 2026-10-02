import { FeatureToggles } from "@/components/ops-forms";
import { assertPagePermission } from "@/server/guard";
import { getFeatures } from "@/server/features";

export const metadata = { title: "Feature controls" };

export default async function FeaturesPage() {
  await assertPagePermission("feature.manage");
  const flags = await getFeatures();
  return (
    <main>
      <h2 className="text-2xl font-bold">Feature controls</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Switching a feature off stops new use of it. Balances, ledger rows, grants, and payment history stay.
      </p>
      <FeatureToggles flags={flags} />
    </main>
  );
}
