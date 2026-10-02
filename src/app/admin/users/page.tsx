import { RoleEditor } from "@/components/admin-controls";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Admin users" };

export default async function AdminUsersPage() {
  await assertPagePermission("customer.view");
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <main>
      <h2 className="text-2xl font-bold">Users</h2>
      <ul className="mt-4 space-y-3">
        {users.map((user) => (
          <li key={user.id} className="rounded-2xl border border-line bg-card p-3 text-sm">
            <p className="font-semibold">{user.displayName}</p>
            <p className="text-muted">{user.phone ?? user.email ?? "No phone or email"}</p>
            <div className="mt-2">
              <RoleEditor userId={user.id} role={user.role} />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
