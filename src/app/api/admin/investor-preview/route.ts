import { z } from "zod";
import { requirePermission } from "@/server/access";
import { clientIp } from "@/server/audit";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { createPreviewLink, listPreviewLinks, revokePreviewLink } from "@/server/preview-links";

const createSchema = z.object({
  label: z.string().max(80).optional(),
});

const revokeSchema = z.object({
  id: z.string().min(1),
});

export async function GET(request: Request) {
  return handle(async () => {
    await requirePermission(request, "settings.manage");
    return json({ links: await listPreviewLinks() });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "settings.manage");
    const body = await readBody(request, createSchema);
    const origin = new URL(request.url).origin;
    const created = await createPreviewLink({
      adminId: user.id,
      label: body.label,
      ip: clientIp(request),
      origin,
    });
    return json({
      id: created.id,
      url: created.url,
      expiresAt: created.expiresAt.toISOString(),
    });
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "settings.manage");
    const body = await readBody(request, revokeSchema);
    await revokePreviewLink({ id: body.id, adminId: user.id, ip: clientIp(request) });
    return json({ ok: true });
  });
}
