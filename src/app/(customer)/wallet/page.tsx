import { BannerSlot } from "@/components/banner-slot";
import { WalletPanel } from "@/components/wallet-panel";
import { formatPaise, formatSignedPaise } from "@/domain/money";
import { getCurrentUser } from "@/server/current-user";
import { getFeatures } from "@/server/features";
import { walletSummary } from "@/server/queries";

export const metadata = { title: "Wallet" };

export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [wallet, features] = await Promise.all([walletSummary(user.id), getFeatures()]);
  return (
    <main className="px-4 pt-4">
      <h1 className="text-2xl font-bold">Wallet</h1>
      <BannerSlot placement="WALLET" />
      <section className="mt-4 rounded-3xl bg-gradient-to-br from-[#16448f] to-card p-4">
        <p className="text-xs text-muted">Available cash</p>
        <p className="num text-3xl font-bold">{formatPaise(wallet.cashPaise)}</p>
      </section>
      <section className="mt-4 grid grid-cols-2 gap-3">
        <Balance label="Cash" value={formatPaise(wallet.cashPaise)} />
        <Balance label="Bonus" value={formatPaise(wallet.bonusPaise)} />
        <Balance label="Bonus proceeds" value={formatPaise(wallet.proceedsPaise)} />
        <Balance label="Withdrawal hold" value={formatPaise(wallet.holdPaise)} />
      </section>
      <p className="mt-3 text-xs text-muted">Withdrawable cash is the cash balance only. Bonus and bonus proceeds are not added into that figure.</p>
      <div className="mt-4">
        <WalletPanel
        cashPaise={wallet.cashPaise}
        withdrawal={wallet.withdrawal}
        depositsEnabled={features.depositsEnabled}
        withdrawalsEnabled={features.withdrawalsEnabled}
      />
      </div>
      <section className="mt-4">
        <h2 className="font-semibold">Transaction history</h2>
        {wallet.entries.length === 0 ? <p className="mt-2 text-sm text-muted">No ledger entries yet.</p> : null}
        <ul className="mt-2 space-y-2 text-sm">
          {wallet.entries.map((entry) => (
            <li key={entry.id} className="rounded-xl bg-card px-3 py-3">
              <div className="flex justify-between gap-3">
                <span>{entry.description}</span>
                <span className="num">{formatSignedPaise(entry.amountPaise)}</span>
              </div>
              <p className="text-xs text-muted">
                {entry.account} · {new Date(entry.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Balance({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-2xl bg-card p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="num mt-1 font-semibold">{value}</p>
    </section>
  );
}
