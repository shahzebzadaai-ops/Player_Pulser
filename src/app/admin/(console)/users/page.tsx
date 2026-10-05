import { RoleEditor } from "@/components/admin-controls";
import { CrmFacts } from "@/components/crm-facts";
import { assertPagePermission } from "@/server/guard";
import { loadCrmUsers } from "@/server/crm-view";

export const metadata = { title: "Admin users" };

export default async function AdminUsersPage() {
  await assertPagePermission("customer.view");
  const rows = await loadCrmUsers();
  return (
    <main>
      <h2 className="text-2xl font-bold">Users</h2>
      <ul className="mt-4 space-y-3">
        {rows.map(({ user, lifecycle, firstTouch, lastTouch }) => (
          <li key={user.id} className="rounded-2xl border border-line bg-card p-3 text-sm">
            <p className="font-semibold">{user.displayName}</p>
            <CrmFacts
              givenName={user.givenName}
              familyName={user.familyName}
              email={user.email}
              phone={user.phone}
              emailVerified={Boolean(user.emailVerifiedAt)}
              phoneVerified={Boolean(user.phoneVerifiedAt)}
              signupMethod={user.signupMethod}
              createdAt={user.createdAt}
              lastLoginAt={user.lastLoginAt}
              accountStatus={user.accountStatus}
              lifecycle={lifecycle}
              firstTouch={firstTouch}
              lastTouch={lastTouch}
              marketingConsent={user.marketingConsent}
              marketingConsentAt={user.marketingConsentAt}
              marketingConsentSource={user.marketingConsentSource}
              marketingConsentVersion={user.marketingConsentVersion}
              doNotEmail={user.doNotEmail}
              doNotSms={user.doNotSms}
              doNotWhatsApp={user.doNotWhatsApp}
              doNotCall={user.doNotCall}
            />
            <div className="mt-2">
              {user.staffAccount?.staffRole === "OWNER" ? (
                <p className="text-sm font-semibold">OWNER · Protected</p>
              ) : (
                <RoleEditor userId={user.id} role={user.role} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
