import { SeoForm } from "@/components/ops-forms";
import { assertPagePermission } from "@/server/guard";
import { getSeo } from "@/server/seo";

export const metadata = { title: "Brand settings" };

export default async function BrandSettingsPage() {
  await assertPagePermission("content.manage");
  const seo = await getSeo();
  return (
    <main>
      <h2 className="text-2xl font-bold">Brand</h2>
      <p className="mt-1 text-sm text-muted">Public site title and description. Signed-in pages stay out of search indexes.</p>
      <SeoForm seo={seo} />
    </main>
  );
}
