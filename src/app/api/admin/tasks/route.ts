import { z } from "zod";
import { requirePermission } from "@/server/access";
import { clientIp, writeAudit } from "@/server/audit";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { prisma } from "@/server/prisma";

const types = ["VIP_CALL", "WITHDRAWAL_REVIEW", "CUSTOMER_SUPPORT", "CONTENT_UPDATE", "CRM_FOLLOWUP"] as const;
const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const statuses = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"] as const;

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    title: z.string().min(2).max(140),
    type: z.enum(types),
    customerId: z.string().nullable().optional(),
    assignedToId: z.string().nullable().optional(),
    priority: z.enum(priorities),
    dueAt: z.string().nullable().optional(),
    notes: z.string().max(1000).optional().default(""),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string(),
    status: z.enum(statuses),
    notes: z.string().max(1000).optional(),
    assignedToId: z.string().nullable().optional(),
  }),
]);

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "task.manage");
    const body = await readBody(request, schema);
    const ip = clientIp(request);
    if (body.action === "create") {
      const dueAt = body.dueAt ? new Date(body.dueAt) : null;
      if (dueAt && Number.isNaN(dueAt.getTime())) return json({ error: { code: "INVALID", message: "Enter a valid due date." } }, 400);
      const task = await prisma.staffTask.create({
        data: {
          title: body.title.trim(),
          type: body.type,
          customerId: body.customerId || null,
          assignedToId: body.assignedToId || null,
          createdById: user.id,
          priority: body.priority,
          dueAt,
          notes: body.notes,
        },
      });
      await writeAudit({
        actorId: user.id,
        action: "task.create",
        entityType: "StaffTask",
        entityId: task.id,
        after: { title: task.title, type: task.type, status: task.status },
        ip,
      });
      return json({ id: task.id });
    }
    const current = await prisma.staffTask.findUnique({ where: { id: body.id } });
    if (!current) return json({ error: { code: "NOT_FOUND", message: "That task was not found." } }, 404);
    const completedAt = body.status === "DONE" || body.status === "CANCELLED" ? current.completedAt ?? new Date() : null;
    const task = await prisma.staffTask.update({
      where: { id: body.id },
      data: {
        status: body.status,
        notes: body.notes ?? current.notes,
        assignedToId: body.assignedToId === undefined ? current.assignedToId : body.assignedToId || null,
        completedAt,
      },
    });
    await writeAudit({
      actorId: user.id,
      action: "task.update",
      entityType: "StaffTask",
      entityId: task.id,
      before: { status: current.status, assignedToId: current.assignedToId },
      after: { status: task.status, assignedToId: task.assignedToId },
      ip,
    });
    return json({ ok: true });
  });
}
