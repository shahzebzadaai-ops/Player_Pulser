import { redirect } from "next/navigation";
import { ADMIN_LOGIN_PATH } from "@/domain/admin-access";
import { isInvestorDemoIdentity } from "@/domain/investor-demo";
import { hasPermission, type Permission } from "@/domain/permissions";
import { loadStaffAccess, type StaffAccess } from "./access";
import { getCurrentUser } from "./current-user";

async function pageAccess(): Promise<StaffAccess> {
  const user = await getCurrentUser();
  if (!user) redirect(ADMIN_LOGIN_PATH);
  if (user.role !== "ADMIN" || isInvestorDemoIdentity(user)) redirect("/home");
  const access = await loadStaffAccess(user.id);
  if (!access.active) redirect("/home");
  return access;
}

export async function assertPagePermission(permission: Permission): Promise<StaffAccess> {
  const access = await pageAccess();
  if (!hasPermission(access.staffRole, permission)) redirect("/admin");
  return access;
}

export async function assertPageAny(permissions: Permission[]): Promise<StaffAccess> {
  const access = await pageAccess();
  if (!permissions.some((permission) => hasPermission(access.staffRole, permission))) redirect("/admin");
  return access;
}
