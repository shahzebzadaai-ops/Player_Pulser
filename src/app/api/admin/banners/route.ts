import { z } from "zod";
import { createBanner, disableBanner, duplicateBanner, publishBanner, removeBanner, updateBanner } from "@/server/banners";
import { clientIp } from "@/server/audit";
import { requirePermission } from "@/server/access";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";

const fields = {
  name: z.string().min(1).max(120),
  placement: z.string(),
  headline: z.string().min(1).max(160),
  subtitle: z.string().max(240).optional().default(""),
  imageId: z.string().nullable().optional().default(null),
  mobileImageId: z.string().nullable().optional().default(null),
  ctaLabel: z.string().max(40).optional().default(""),
  ctaDestination: z.string().max(200).optional().default(""),
  altText: z.string().max(180).optional().default(""),
  startAt: z.string().nullable().optional().default(null),
  endAt: z.string().nullable().optional().default(null),
  sortOrder: z.number().int().min(0).max(9999).optional().default(0),
};

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...fields }),
  z.object({ action: z.literal("update"), id: z.string(), ...fields }),
  z.object({ action: z.literal("publish"), id: z.string(), previewed: z.literal(true) }),
  z.object({ action: z.literal("disable"), id: z.string() }),
  z.object({ action: z.literal("duplicate"), id: z.string() }),
  z.object({ action: z.literal("delete"), id: z.string() }),
]);

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readBody(request, schema);
    const ip = clientIp(request);
    if (body.action === "create") {
      const { user } = await requirePermission(request, "banner.create");
      const banner = await createBanner(body, user.id, ip);
      return json({ id: banner.id });
    }
    if (body.action === "update") {
      const { user } = await requirePermission(request, "banner.edit");
      const banner = await updateBanner(body.id, body, user.id, ip);
      return json({ id: banner.id });
    }
    if (body.action === "publish") {
      const { user } = await requirePermission(request, "banner.publish");
      const banner = await publishBanner(body.id, user.id, ip);
      return json({ id: banner.id, status: banner.status });
    }
    if (body.action === "disable") {
      const { user } = await requirePermission(request, "banner.publish");
      await disableBanner(body.id, user.id, ip);
      return json({ ok: true });
    }
    if (body.action === "duplicate") {
      const { user } = await requirePermission(request, "banner.create");
      const banner = await duplicateBanner(body.id, user.id, ip);
      return json({ id: banner.id });
    }
    const { user } = await requirePermission(request, "banner.edit");
    const result = await removeBanner(body.id, user.id, ip);
    return json(result);
  });
}
