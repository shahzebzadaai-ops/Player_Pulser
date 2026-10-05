import { ReconcileButton } from "@/components/admin-controls";
import { WithdrawalIntervention } from "@/components/ops-forms";
import { formatPaise } from "@/domain/money";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Withdrawals" };

export default async function WithdrawalsPage() {
  await assertPagePermission("withdrawal.view");
  const payments = await prisma.payment.findMany({
    where: { kind: "PAYOUT" },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return (
    <main>
      <h2 className="text-2xl font-bold">Withdrawals</h2>
      <p className="mt-1 text-sm text-muted">A review records a reason and opens a task. It does not change the payout.</p>
      <ul className="mt-4 space-y-3 text-sm">
        {payments.length === 0 ? <li className="text-muted">No withdrawals yet.</li> : null}
        {payments.map((payment) => (
          <li key={payment.id} className="rounded-xl border border-line bg-card px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                {formatPaise(payment.amountPaise)} · {payment.status} · {payment.user.displayName}
              </span>
              <ReconcileButton paymentId={payment.id} payout />
            </div>
            <WithdrawalIntervention paymentId={payment.id} />
          </li>
        ))}
      </ul>
    </main>
  );
}
