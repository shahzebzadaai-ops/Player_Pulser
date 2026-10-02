import { ReconcileButton } from "@/components/admin-controls";
import { formatPaise } from "@/domain/money";
import { assertPageAny } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Admin payments" };

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  await assertPageAny(["deposit.view", "withdrawal.view"]);
  const params = await searchParams;
  const kind = params.kind === "DEPOSIT" || params.kind === "PAYOUT" ? params.kind : undefined;
  const payments = await prisma.payment.findMany({
    where: kind ? { kind } : undefined,
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return (
    <main>
      <h2 className="text-2xl font-bold">Payments and reconciliation</h2>
      <p className="mt-1 text-sm text-muted">The simulated provider can be reconciled again. A repeated provider event does not credit cash twice.</p>
      <ul className="mt-4 space-y-2 text-sm">
        {payments.length === 0 ? <li className="text-muted">No payments yet.</li> : null}
        {payments.map((payment) => (
          <li key={payment.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-3">
            <span>
              {payment.kind} {formatPaise(payment.amountPaise)} · {payment.status} · {payment.user.displayName}
              <span className="block text-xs text-muted">{payment.providerRef}</span>
            </span>
            <ReconcileButton paymentId={payment.id} payout={payment.kind === "PAYOUT"} />
          </li>
        ))}
      </ul>
    </main>
  );
}
