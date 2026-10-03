import { CrmFacts } from "@/components/crm-facts";
import { NoteForm } from "@/components/ops-forms";
import { hasPermission } from "@/domain/permissions";
import { assertPagePermission } from "@/server/guard";
import { loadCrmUsers } from "@/server/crm-view";
import { prisma } from "@/server/prisma";

export const metadata = { title: "CRM" };

export default async function CrmPage() {
  const access = await assertPagePermission("crm.view");
  const rows = await loadCrmUsers("CUSTOMER");
  const notes = await prisma.customerNote.findMany({
    where: { userId: { in: rows.map((row) => row.user.id) } },
    orderBy: { createdAt: "desc" },
    include: { author: true },
    take: 300,
  });
  return (
    <main>
      <h2 className="text-2xl font-bold">CRM</h2>
      <p className="mt-1 text-sm text-muted">Customer notes stay on the account. They do not change balances.</p>
      <ul className="mt-4 space-y-3">
        {rows.map(({ user, lifecycle, firstTouch, lastTouch }) => (
          <li key={user.id} className="rounded-2xl border border-line bg-card p-3">
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
            <ul className="mt-2 space-y-1 text-sm">
              {notes.filter((note) => note.userId === user.id).slice(0, 3).map((note) => (
                <li key={note.id}>
                  {note.body} <span className="text-xs text-muted">· {note.author.displayName}</span>
                </li>
              ))}
            </ul>
            {hasPermission(access.staffRole, "crm.manage") ? <NoteForm userId={user.id} /> : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
