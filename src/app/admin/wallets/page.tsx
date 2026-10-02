import { WalletAdjust } from "@/components/ops-forms";
import { formatPaise } from "@/domain/money";
import { hasPermission } from "@/domain/permissions";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Admin wallets" };

export default async function AdminWalletsPage() {
  const access = await assertPagePermission("wallet.view");
  const grouped = await prisma.ledgerEntry.groupBy({
    by: ["userId", "account"],
    where: { userId: { not: null } },
    _sum: { amountPaise: true },
  });
  const users = await prisma.user.findMany();
  const names = new Map(users.map((user) => [user.id, user.displayName]));
  const rows = new Map<string, Record<string, bigint>>();
  for (const row of grouped) {
    if (!row.userId) continue;
    const current = rows.get(row.userId) ?? {};
    current[row.account] = row._sum.amountPaise ?? 0n;
    rows.set(row.userId, current);
  }
  return (
    <main>
      <h2 className="text-2xl font-bold">Wallets and ledger</h2>
      <p className="mt-1 text-sm text-muted">Balances are sums of append-only entries. Corrections need a new journal, not an overwrite.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="py-2">User</th>
              <th>Cash</th>
              <th>Bonus</th>
              <th>Bonus proceeds</th>
              <th>Hold</th>
            </tr>
          </thead>
          <tbody>
            {[...rows.entries()].map(([userId, accounts]) => (
              <tr key={userId} className="border-t border-line">
                <td className="py-2">{names.get(userId) ?? userId}</td>
                <td className="num">{formatPaise(accounts.USER_CASH ?? 0n)}</td>
                <td className="num">{formatPaise(accounts.USER_BONUS ?? 0n)}</td>
                <td className="num">{formatPaise(accounts.USER_BONUS_PROCEEDS ?? 0n)}</td>
                <td className="num">{formatPaise(accounts.USER_WITHDRAWAL_HOLD ?? 0n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasPermission(access.staffRole, "wallet.adjust") ? (
        <WalletAdjust users={users.map((user) => ({ id: user.id, displayName: user.displayName }))} />
      ) : null}
    </main>
  );
}
