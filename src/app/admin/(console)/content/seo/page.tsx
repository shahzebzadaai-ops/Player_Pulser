import { SeoForm } from "@/components/ops-forms";
import { playerPublicSeo } from "@/domain/seo";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";
import { getSeo } from "@/server/seo";

export const metadata = { title: "SEO" };

export default async function SeoPage() {
  await assertPagePermission("content.manage");
  const [seo, player] = await Promise.all([getSeo(), prisma.player.findFirst({ orderBy: { name: "asc" } })]);
  const sample = player ? playerPublicSeo(player, seo) : null;
  return (
    <main>
      <h2 className="text-2xl font-bold">SEO</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        These fields apply to the public landing page and public player pages. Signed-in wallet, trade, and admin pages stay out of search indexes.
      </p>
      {sample ? (
        <p className="mt-3 rounded-xl bg-card p-3 text-sm">
          Example public title: {sample.title}
          <span className="block text-muted">{sample.description}</span>
        </p>
      ) : null}
      <SeoForm seo={seo} />
    </main>
  );
}
