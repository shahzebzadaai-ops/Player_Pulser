import { redirect } from "next/navigation";
import { AdminFrame } from "@/components/admin-frame";
import { ADMIN_LOGIN_PATH, staffRoleLabel } from "@/domain/admin-access";
import { isInvestorDemoIdentity } from "@/domain/investor-demo";
import { loadStaffAccess } from "@/server/access";
import { getCurrentUser } from "@/server/current-user";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(ADMIN_LOGIN_PATH);
  if (user.role !== "ADMIN" || isInvestorDemoIdentity(user)) redirect("/home");
  const access = await loadStaffAccess(user.id);
  if (!access.active) redirect("/home");
  return (
    <AdminFrame permissions={access.permissions} role={staffRoleLabel(access.staffRole)}>
      {children}
    </AdminFrame>
  );
}
