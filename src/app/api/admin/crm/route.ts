import { z } from "zod";
import { requirePermission } from "@/server/access";
import { clientIp, writeAudit } from "@/server/audit";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { prisma } from "@/server/prisma";

const schema = z.object({
  userId: z.string(),
  body: z.string().min(2).max(1000),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "crm.manage");
    const body = await readBody(request, schema);
    const note = await prisma.customerNote.create({
      data: { userId: body.userId, authorId: user.id, body: body.body.trim() },
    });
    await writeAudit({
      actorId: user.id,
      action: "crm.note",
      entityType: "CustomerNote",
      entityId: note.id,
      after: { userId: body.userId },
      ip: clientIp(request),
    });
    return json({ id: note.id });
  });
}
