import { StaffCreate, StaffRoleForm } from "@/components/ops-forms";
import { staffRoleLabel } from "@/domain/admin-access";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  await assertPagePermission("staff.manage");
  const staff = await prisma.staffAccount.findMany({ include: { user: true }, orderBy: { createdAt: "asc" } });
  return (
    <main>
      <h2 className="text-2xl font-bold">Staff</h2>
      <p className="mt-1 text-sm text-muted">Staff sign in with a phone, separate from the customer role they would otherwise have. Permission changes ask for a reason. The owner account is protected.</p>
      <StaffCreate />
      <ul className="mt-4 space-y-3">
        {staff.map((account) => {
          const owner = account.staffRole === "OWNER";
          return (
            <li key={account.id} className="rounded-xl border border-line bg-card p-3">
              <p className="font-semibold">{account.user.displayName}</p>
              <p className="text-xs text-muted">{account.user.username ? `@${account.user.username}` : account.user.phone}</p>
              <p className="mt-2 text-sm font-semibold">{staffRoleLabel(account.staffRole)}{owner ? " · Protected" : ""}</p>
              {owner ? null : (
                <div className="mt-2">
                  <StaffRoleForm userId={account.userId} staffRole={account.staffRole} active={account.active} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
