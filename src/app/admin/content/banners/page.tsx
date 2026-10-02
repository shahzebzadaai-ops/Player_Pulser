import Link from "next/link";
import { effectiveBannerStatus } from "@/domain/banners";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Banners" };

export default async function BannersPage() {
  await assertPagePermission("banner.view");
  const banners = await prisma.banner.findMany({ orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }] });
  const now = new Date();
  return (
    <main>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Banners</h2>
        <Link href="/admin/content/banners/new" className="min-h-11 rounded-full bg-india px-4 py-2 text-sm font-semibold">
          New banner
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">Drafts can be deleted. A banner that has been published is archived instead.</p>
      <ul className="mt-4 space-y-2">
        {banners.length === 0 ? <li className="text-sm text-muted">No banners yet.</li> : null}
        {banners.map((banner) => (
          <li key={banner.id}>
            <Link href={`/admin/content/banners/${banner.id}`} className="block rounded-xl border border-line bg-card px-3 py-3">
              <span className="font-semibold">{banner.name}</span>
              <span className="block text-xs text-muted">
                {banner.placement} · {effectiveBannerStatus(banner, now)} · order {banner.sortOrder}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
