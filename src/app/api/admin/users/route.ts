import { z } from "zod";
import { ownerAccountChangeDenied } from "@/domain/admin-access";
import { AppError } from "@/domain/errors";
import { requirePermission } from "@/server/access";
import { clientIp, requireReason, writeAudit } from "@/server/audit";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { prisma } from "@/server/prisma";

const schema = z.object({
  userId: z.string(),
  role: z.enum(["CUSTOMER", "ADMIN"]),
  reason: z.string(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user: admin } = await requirePermission(request, "staff.manage");
    const body = await readBody(request, schema);
    const reason = requireReason(body.reason);
    const target = await prisma.user.findUnique({ where: { id: body.userId }, include: { staffAccount: true } });
    const ownerDenial = ownerAccountChangeDenied(target?.staffAccount?.staffRole);
    if (ownerDenial) {
      await writeAudit({
        actorId: admin.id,
        action: "staff.owner.blocked",
        entityType: "User",
        entityId: body.userId,
        reason,
        ip: clientIp(request),
      });
      throw new AppError("FORBIDDEN", ownerDenial, 403);
    }
    if (body.role === "CUSTOMER") {
      const admins = await prisma.user.count({ where: { role: "ADMIN" } });
      const target = await prisma.user.findUnique({ where: { id: body.userId } });
      if (target?.role === "ADMIN" && admins <= 1) {
        throw new AppError("LAST_ADMIN", "The last admin cannot be removed.", 409);
      }
    }
    const before = await prisma.user.findUnique({ where: { id: body.userId } });
    await prisma.user.update({ where: { id: body.userId }, data: { role: body.role } });
    if (body.role === "ADMIN") {
      await prisma.staffAccount.upsert({
        where: { userId: body.userId },
        create: { userId: body.userId, staffRole: "SUPPORT", active: true },
        update: { active: true },
      });
    } else {
      await prisma.staffAccount.updateMany({ where: { userId: body.userId }, data: { active: false } });
    }
    await writeAudit({
      actorId: admin.id,
      action: "staff.permission",
      entityType: "User",
      entityId: body.userId,
      before: { role: before?.role ?? null },
      after: { role: body.role },
      reason,
      ip: clientIp(request),
    });
    return json({ ok: true });
  });
}
