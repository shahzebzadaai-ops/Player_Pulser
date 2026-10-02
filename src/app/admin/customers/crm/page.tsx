import { NoteForm } from "@/components/ops-forms";
import { hasPermission } from "@/domain/permissions";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "CRM" };

export default async function CrmPage() {
  const access = await assertPagePermission("crm.view");
  const customers = await prisma.user.findMany({
    where: { role: "CUSTOMER" },
    include: { notes: { orderBy: { createdAt: "desc" }, take: 3, include: { author: true } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <main>
      <h2 className="text-2xl font-bold">CRM</h2>
      <p className="mt-1 text-sm text-muted">Customer notes stay on the account. They do not change balances.</p>
      <ul className="mt-4 space-y-3">
        {customers.map((customer) => (
          <li key={customer.id} className="rounded-2xl border border-line bg-card p-3">
            <p className="font-semibold">{customer.displayName}</p>
            <p className="text-xs text-muted">{customer.phone ?? customer.email ?? "No contact"}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {customer.notes.map((note) => (
                <li key={note.id}>
                  {note.body} <span className="text-xs text-muted">· {note.author.displayName}</span>
                </li>
              ))}
            </ul>
            {hasPermission(access.staffRole, "crm.manage") ? <NoteForm userId={customer.id} /> : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
