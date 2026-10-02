import { redirect } from "next/navigation";
import { AdminFrame } from "@/components/admin-frame";
import { loadStaffAccess } from "@/server/access";
import { getCurrentUser } from "@/server/current-user";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "ADMIN") redirect("/home");
  const access = await loadStaffAccess(user.id);
  if (!access.active) redirect("/home");
  return (
    <AdminFrame permissions={access.permissions} role={access.staffRole.replaceAll("_", " ")}>
      {children}
    </AdminFrame>
  );
}
