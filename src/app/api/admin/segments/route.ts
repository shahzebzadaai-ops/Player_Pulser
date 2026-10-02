import { z } from "zod";
import { requirePermission } from "@/server/access";
import { clientIp, writeAudit } from "@/server/audit";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { prisma } from "@/server/prisma";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().min(2).max(80), description: z.string().max(240).optional().default("") }),
  z.object({ action: z.literal("add"), segmentId: z.string(), userId: z.string() }),
  z.object({ action: z.literal("remove"), segmentId: z.string(), userId: z.string() }),
]);

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "crm.manage");
    const body = await readBody(request, schema);
    const ip = clientIp(request);
    if (body.action === "create") {
      const segment = await prisma.segment.create({
        data: { name: body.name.trim(), description: body.description, createdById: user.id },
      });
      await writeAudit({ actorId: user.id, action: "segment.create", entityType: "Segment", entityId: segment.id, after: { name: segment.name }, ip });
      return json({ id: segment.id });
    }
    if (body.action === "add") {
      await prisma.segmentMember.upsert({
        where: { segmentId_userId: { segmentId: body.segmentId, userId: body.userId } },
        create: { segmentId: body.segmentId, userId: body.userId },
        update: {},
      });
      await writeAudit({
        actorId: user.id,
        action: "segment.member",
        entityType: "Segment",
        entityId: body.segmentId,
        after: { userId: body.userId, member: true },
        ip,
      });
      return json({ ok: true });
    }
    await prisma.segmentMember.deleteMany({ where: { segmentId: body.segmentId, userId: body.userId } });
    await writeAudit({
      actorId: user.id,
      action: "segment.member",
      entityType: "Segment",
      entityId: body.segmentId,
      after: { userId: body.userId, member: false },
      ip,
    });
    return json({ ok: true });
  });
}
