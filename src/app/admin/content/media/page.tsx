import { MediaManager, type MediaRow } from "@/components/media-manager";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Media library" };

export default async function MediaPage() {
  await assertPagePermission("content.manage");
  const assets = await prisma.mediaAsset.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const authors = await prisma.user.findMany({
    where: { id: { in: assets.map((asset) => asset.createdById).filter((id): id is string => Boolean(id)) } },
  });
  const names = new Map(authors.map((author) => [author.id, author.displayName]));
  const rows: MediaRow[] = assets.map((asset) => ({
    id: asset.id,
    folder: asset.folder,
    filename: asset.filename,
    mimeType: asset.mimeType,
    bytes: asset.bytes,
    width: asset.width,
    height: asset.height,
    altText: asset.altText,
    archived: Boolean(asset.archivedAt),
    createdAt: asset.createdAt.toISOString(),
    createdBy: names.get(asset.createdById ?? "") ?? "Staff",
  }));
  return (
    <main>
      <h2 className="text-2xl font-bold">Media library</h2>
      <p className="mt-1 text-sm text-muted">Files stay on this machine under local storage. Archived files are kept.</p>
      <div className="mt-4">
        <MediaManager assets={rows} />
      </div>
    </main>
  );
}
