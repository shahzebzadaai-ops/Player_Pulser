import { z } from "zod";
import { requirePermission } from "@/server/access";
import { clientIp, writeAudit } from "@/server/audit";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { prisma } from "@/server/prisma";

const schema = z.object({
  id: z.string().optional(),
  title: z.string().min(2).max(140),
  body: z.string().min(1).max(1000),
  status: z.enum(["DRAFT", "LIVE", "DISABLED"]),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "content.manage");
    const body = await readBody(request, schema);
    if (body.id) {
      const current = await prisma.announcement.findUnique({ where: { id: body.id } });
      if (!current) return json({ error: { code: "NOT_FOUND", message: "That announcement was not found." } }, 404);
      const row = await prisma.announcement.update({
        where: { id: body.id },
        data: { title: body.title.trim(), body: body.body, status: body.status, updatedById: user.id },
      });
      await writeAudit({
        actorId: user.id,
        action: "announcement.update",
        entityType: "Announcement",
        entityId: row.id,
        before: { title: current.title, status: current.status, body: current.body },
        after: { title: row.title, status: row.status, body: row.body },
        ip: clientIp(request),
      });
      return json({ id: row.id });
    }
    const row = await prisma.announcement.create({
      data: { title: body.title.trim(), body: body.body, status: body.status, createdById: user.id, updatedById: user.id },
    });
    await writeAudit({
      actorId: user.id,
      action: "announcement.create",
      entityType: "Announcement",
      entityId: row.id,
      after: { title: row.title, status: row.status },
      ip: clientIp(request),
    });
    return json({ id: row.id });
  });
}
