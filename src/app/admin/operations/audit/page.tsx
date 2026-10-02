import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  await assertPagePermission("audit.view");
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: true },
  });
  return (
    <main>
      <h2 className="text-2xl font-bold">Audit log</h2>
      <p className="mt-1 text-sm text-muted">Read only. Reasons for sensitive actions are stored with the change.</p>
      <ul className="mt-4 space-y-2 text-sm">
        {rows.length === 0 ? <li className="text-muted">No audit events yet.</li> : null}
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-line bg-card px-3 py-3">
            <p>
              {row.action} · {row.entityType} {row.entityId ?? ""}
            </p>
            <p className="text-xs text-muted">
              {row.actor?.displayName ?? "system"} · {row.createdAt.toISOString()}
              {row.ip ? ` · ${row.ip}` : ""}
            </p>
            {row.reason ? <p className="mt-1">Reason: {row.reason}</p> : null}
            {row.before ? <pre className="mt-1 overflow-x-auto text-xs text-muted">Before {JSON.stringify(row.before)}</pre> : null}
            {row.after ? <pre className="mt-1 overflow-x-auto text-xs text-muted">After {JSON.stringify(row.after)}</pre> : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
