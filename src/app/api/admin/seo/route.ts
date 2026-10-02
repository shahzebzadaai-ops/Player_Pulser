import { z } from "zod";
import { requirePermission } from "@/server/access";
import { clientIp, writeAudit } from "@/server/audit";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { prisma } from "@/server/prisma";
import { getSeo, invalidateSeoCache } from "@/server/seo";

const schema = z.object({
  siteTitle: z.string().min(1).max(80),
  siteDescription: z.string().min(1).max(240),
  canonicalDomain: z.string().max(120),
  defaultOgImageId: z.string().max(80),
  robotsIndex: z.boolean(),
  robotsFollow: z.boolean(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "content.manage");
    const body = await readBody(request, schema);
    if (body.canonicalDomain && !/^https:\/\/[a-z0-9.-]+$/i.test(body.canonicalDomain)) {
      return json({ error: { code: "INVALID", message: "Canonical domain should look like https://playerpulser.com." } }, 400);
    }
    const before = await getSeo();
    await prisma.appSetting.upsert({
      where: { key: "seo" },
      create: { key: "seo", value: body, updatedBy: user.id },
      update: { value: body, updatedBy: user.id },
    });
    invalidateSeoCache();
    await writeAudit({
      actorId: user.id,
      action: "seo.update",
      entityType: "AppSetting",
      entityId: "seo",
      before,
      after: body,
      ip: clientIp(request),
    });
    return json({ ok: true });
  });
}
