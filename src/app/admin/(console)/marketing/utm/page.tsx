import { TaxonomyEditor, UtmBuilder } from "@/components/marketing-forms";
import { hasPermission } from "@/domain/permissions";
import { getUtmTaxonomy } from "@/server/attribution";
import { assertPageAny } from "@/server/guard";

export const metadata = { title: "UTM builder" };

export default async function UtmPage() {
  const access = await assertPageAny(["utm.view", "marketing.view"]);
  const taxonomy = await getUtmTaxonomy();
  const canManage = hasPermission(access.staffRole, "utm.manage");
  return (
    <main>
      <h2 className="text-2xl font-bold">UTM builder</h2>
      <p className="mt-1 text-sm text-muted">Values are stored as lowercase slugs. Facebook, fb, and META become meta.</p>
      <UtmBuilder sources={taxonomy.sources} mediums={taxonomy.mediums} canManage={canManage} />
      <section className="mt-8">
        <h3 className="font-semibold">Approved values</h3>
        <p className="mt-1 text-sm text-muted">Sources: {taxonomy.sources.join(", ")}</p>
        <p className="text-sm text-muted">Mediums: {taxonomy.mediums.join(", ")}</p>
        {canManage ? <TaxonomyEditor sources={taxonomy.sources} mediums={taxonomy.mediums} /> : null}
      </section>
    </main>
  );
}
