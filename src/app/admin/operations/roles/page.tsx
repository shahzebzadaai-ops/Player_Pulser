import { PERMISSIONS, ROLE_PERMISSIONS, STAFF_ROLES } from "@/domain/permissions";
import { assertPagePermission } from "@/server/guard";

export const metadata = { title: "Roles and permissions" };

export default async function RolesPage() {
  await assertPagePermission("staff.manage");
  return (
    <main>
      <h2 className="text-2xl font-bold">Roles and permissions</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Screens and actions check these permissions. A role name alone is not enough.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[880px] border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr>
              <th className="py-2 pr-3">Permission</th>
              {STAFF_ROLES.map((role) => (
                <th key={role} className="px-1 py-2">{role.replaceAll("_", " ")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((permission) => (
              <tr key={permission} className="border-t border-line">
                <th className="py-1 pr-3 font-medium">{permission}</th>
                {STAFF_ROLES.map((role) => (
                  <td key={role} className="px-1 py-1 text-center">{ROLE_PERMISSIONS[role].includes(permission) ? "Yes" : ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
