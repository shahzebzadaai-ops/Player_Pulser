import { z } from "zod";
import { MEDIA_FOLDERS } from "@/domain/banners";
import { clientIp, writeAudit } from "@/server/audit";
import { requirePermission } from "@/server/access";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { saveMedia } from "@/server/media-store";
import { prisma } from "@/server/prisma";

const actionSchema = z.object({
  action: z.enum(["archive", "alt"]),
  id: z.string(),
  altText: z.string().max(180).optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const { user } = await requirePermission(request, "content.manage");
      const body = await readBody(request, actionSchema);
      const current = await prisma.mediaAsset.findUnique({ where: { id: body.id } });
      if (!current) return json({ error: { code: "NOT_FOUND", message: "That file was not found." } }, 404);
      if (body.action === "archive") {
        const asset = await prisma.mediaAsset.update({ where: { id: body.id }, data: { archivedAt: new Date() } });
        await writeAudit({
          actorId: user.id,
          action: "media.archive",
          entityType: "MediaAsset",
          entityId: asset.id,
          before: { archivedAt: null },
          after: { archivedAt: asset.archivedAt?.toISOString() ?? null },
          ip: clientIp(request),
        });
        return json({ ok: true });
      }
      const asset = await prisma.mediaAsset.update({ where: { id: body.id }, data: { altText: body.altText ?? "" } });
      await writeAudit({
        actorId: user.id,
        action: "media.alt",
        entityType: "MediaAsset",
        entityId: asset.id,
        before: { altText: current.altText },
        after: { altText: asset.altText },
        ip: clientIp(request),
      });
      return json({ ok: true });
    }
    const { user } = await requirePermission(request, "content.manage");
    const form = await request.formData();
    const file = form.get("file");
    const folder = String(form.get("folder") ?? "MISC");
    if (!(file instanceof File)) return json({ error: { code: "INVALID", message: "Choose an image file." } }, 400);
    if (!(MEDIA_FOLDERS as readonly string[]).includes(folder)) {
      return json({ error: { code: "INVALID", message: "Choose a media folder." } }, 400);
    }
    const replaceId = String(form.get("replaceId") ?? "") || null;
    const before = replaceId ? await prisma.mediaAsset.findUnique({ where: { id: replaceId } }) : null;
    const asset = await saveMedia({
      file,
      folder,
      altText: String(form.get("altText") ?? ""),
      createdById: user.id,
      replaceId,
    });
    await writeAudit({
      actorId: user.id,
      action: replaceId ? "media.replace" : "media.upload",
      entityType: "MediaAsset",
      entityId: asset.id,
      before: before ? { storageKey: before.storageKey, bytes: before.bytes, width: before.width, height: before.height } : undefined,
      after: { storageKey: asset.storageKey, bytes: asset.bytes, width: asset.width, height: asset.height, mimeType: asset.mimeType },
      ip: clientIp(request),
    });
    return json({ id: asset.id, width: asset.width, height: asset.height, mimeType: asset.mimeType });
  });
}
