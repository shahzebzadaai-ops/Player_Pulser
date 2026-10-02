import { notFound } from "next/navigation";
import { BannerEditor } from "@/components/banner-editor";
import { effectiveBannerStatus } from "@/domain/banners";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

function inputDate(value: Date | null): string {
  if (!value) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export default async function BannerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await assertPagePermission("banner.view");
  const { id } = await params;
  const banner = await prisma.banner.findUnique({ where: { id } });
  if (!banner) notFound();
  const revisions = await prisma.bannerRevision.findMany({ where: { bannerId: id }, orderBy: { createdAt: "desc" }, take: 20 });
  const actors = await prisma.user.findMany({ where: { id: { in: revisions.map((revision) => revision.actorId).filter((actorId): actorId is string => Boolean(actorId)) } } });
  const names = new Map(actors.map((actor) => [actor.id, actor.displayName]));
  return (
    <main>
      <h2 className="text-2xl font-bold">{banner.name}</h2>
      <p className="mt-1 text-sm text-muted">Showing as {effectiveBannerStatus(banner, new Date())}.</p>
      <div className="mt-4">
        <BannerEditor
          initial={{
            id: banner.id,
            name: banner.name,
            placement: banner.placement,
            headline: banner.headline,
            subtitle: banner.subtitle,
            imageId: banner.imageId,
            mobileImageId: banner.mobileImageId,
            ctaLabel: banner.ctaLabel,
            ctaDestination: banner.ctaDestination,
            altText: banner.altText,
            startAt: inputDate(banner.startAt),
            endAt: inputDate(banner.endAt),
            sortOrder: banner.sortOrder,
            status: banner.status,
            publishedAt: banner.publishedAt?.toISOString() ?? null,
          }}
        />
      </div>
      <h3 className="mt-8 font-semibold">Revision history</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {revisions.length === 0 ? <li className="text-muted">No earlier revisions yet.</li> : null}
        {revisions.map((revision) => (
          <li key={revision.id} className="rounded-xl border border-line bg-card px-3 py-2">
            <p>
              {names.get(revision.actorId ?? "") ?? "Staff"} · {revision.createdAt.toISOString()}
            </p>
            <pre className="mt-1 overflow-x-auto text-xs text-muted">{JSON.stringify(revision.snapshot, null, 2)}</pre>
          </li>
        ))}
      </ul>
    </main>
  );
}
