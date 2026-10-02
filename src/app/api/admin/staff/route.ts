import { z } from "zod";
import { AppError } from "@/domain/errors";
import { normalizeIndianPhone, passwordIssue } from "@/domain/phone";
import { isStaffRole, STAFF_ROLES } from "@/domain/permissions";
import { requirePermission } from "@/server/access";
import { clientIp, requireReason, writeAudit } from "@/server/audit";
import { hashPassword } from "@/server/auth";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { prisma } from "@/server/prisma";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    displayName: z.string().min(2).max(80),
    phone: z.string(),
    password: z.string(),
    staffRole: z.enum(STAFF_ROLES),
    reason: z.string(),
  }),
  z.object({
    action: z.literal("role"),
    userId: z.string(),
    staffRole: z.enum(STAFF_ROLES),
    active: z.boolean(),
    reason: z.string(),
  }),
]);

async function protectLastSuperAdmin(userId: string, nextRole: string, active: boolean) {
  const current = await prisma.staffAccount.findUnique({ where: { userId } });
  if (current?.staffRole !== "SUPER_ADMIN" || !current.active) return;
  if (nextRole === "SUPER_ADMIN" && active) return;
  const supers = await prisma.staffAccount.count({ where: { staffRole: "SUPER_ADMIN", active: true } });
  if (supers <= 1) throw new AppError("LAST_ADMIN", "The last super admin cannot be removed.", 409);
}

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "staff.manage");
    const body = await readBody(request, schema);
    const reason = requireReason(body.reason);
    const ip = clientIp(request);
    if (body.action === "create") {
      const issue = passwordIssue(body.password);
      if (issue) throw new AppError("INVALID", issue, 400);
      const phone = normalizeIndianPhone(body.phone);
      if (!phone) throw new AppError("INVALID", "Enter an Indian mobile number.", 400);
      const existing = await prisma.user.findUnique({ where: { phone } });
      if (existing) throw new AppError("INVALID", "That phone number already has an account.", 409);
      const passwordHash = await hashPassword(body.password);
      const created = await prisma.user.create({
        data: {
          phone,
          displayName: body.displayName.trim(),
          passwordHash,
          role: "ADMIN",
          staffAccount: { create: { staffRole: body.staffRole, active: true } },
        },
      });
      await writeAudit({
        actorId: user.id,
        action: "staff.create",
        entityType: "StaffAccount",
        entityId: created.id,
        after: { staffRole: body.staffRole, active: true, phone },
        reason,
        ip,
      });
      return json({ id: created.id });
    }
    if (!isStaffRole(body.staffRole)) throw new AppError("INVALID", "Choose a staff role.", 400);
    await protectLastSuperAdmin(body.userId, body.staffRole, body.active);
    const before = await prisma.staffAccount.findUnique({ where: { userId: body.userId } });
    if (!before) throw new AppError("NOT_FOUND", "That staff account was not found.", 404);
    if (!body.active) {
      const admins = await prisma.user.count({ where: { role: "ADMIN" } });
      if (admins <= 1) throw new AppError("LAST_ADMIN", "The last admin cannot be removed.", 409);
    }
    const staff = await prisma.staffAccount.update({
      where: { userId: body.userId },
      data: { staffRole: body.staffRole, active: body.active },
    });
    await writeAudit({
      actorId: user.id,
      action: "staff.permission",
      entityType: "StaffAccount",
      entityId: staff.id,
      before: { staffRole: before.staffRole, active: before.active },
      after: { staffRole: staff.staffRole, active: staff.active },
      reason,
      ip,
    });
    return json({ ok: true });
  });
}
