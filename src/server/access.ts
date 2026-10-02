import type { User } from "@prisma/client";
import { AppError } from "@/domain/errors";
import { hasPermission, permissionsFor, type Permission, type StaffRoleName } from "@/domain/permissions";
import { requireAdminUser } from "./http";
import { prisma } from "./prisma";

export type StaffAccess = {
  userId: string;
  staffRole: StaffRoleName;
  active: boolean;
  permissions: Permission[];
};

export async function loadStaffAccess(userId: string): Promise<StaffAccess> {
  let staff = await prisma.staffAccount.findUnique({ where: { userId } });
  if (!staff) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.role === "ADMIN") {
      staff = await prisma.staffAccount.create({
        data: { userId, staffRole: "SUPER_ADMIN", active: true },
      });
    }
  }
  const staffRole = (staff?.staffRole ?? "SUPPORT") as StaffRoleName;
  return {
    userId,
    staffRole,
    active: staff?.active ?? false,
    permissions: staff?.active ? permissionsFor(staffRole) : [],
  };
}

export async function requirePermission(request: Request, permission: Permission): Promise<{ user: User; access: StaffAccess }> {
  const user = await requireAdminUser(request);
  const access = await loadStaffAccess(user.id);
  if (!access.active || !hasPermission(access.staffRole, permission)) {
    throw new AppError("FORBIDDEN", "You do not have permission for this action.", 403);
  }
  return { user, access };
}
