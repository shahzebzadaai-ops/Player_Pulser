import { BannerSlot } from "@/components/banner-slot";
import { BittuFigure } from "@/components/bittu-figure";
import { WalletPanel } from "@/components/wallet-panel";
import { isInvestorDemoIdentity } from "@/domain/investor-demo";
import { formatPaise, formatSignedPaise } from "@/domain/money";
import { requireCustomer } from "@/server/page-access";
import { getFeatures } from "@/server/features";
import { walletSummary } from "@/server/queries";

export const metadata = { title: "Wallet" };

export default async function WalletPage() {
  const user = await requireCustomer({ type: "WALLET" });
  const [wallet, features] = await Promise.all([walletSummary(user.id), getFeatures()]);
  return (
    <main className="px-4 pt-4">
      <h1 className="text-2xl font-bold">Wallet</h1>
      {isInvestorDemoIdentity(user) ? (
        <p className="mt-3 rounded-2xl border border-india/40 bg-card p-3 text-sm text-muted">
          This is simulated demo money. Deposits and withdrawals stay off so the demo cannot create a payment.
        </p>
      ) : null}
      <BannerSlot placement="WALLET" />
      <section className="mt-4 rounded-3xl bg-gradient-to-br from-[#16448f] to-card p-4">
        <p className="text-xs text-muted">Available cash</p>
        <p className="num wrap-anywhere text-[clamp(1.6rem,8vw,1.875rem)] font-bold">{formatPaise(wallet.cashPaise)}</p>
      </section>
      <section className="mt-4 grid grid-cols-2 gap-3">
        <Balance label="Cash" value={formatPaise(wallet.cashPaise)} />
        <Balance label="Bonus" value={formatPaise(wallet.bonusPaise)} />
        <Balance label="Bonus proceeds" value={formatPaise(wallet.proceedsPaise)} />
        <Balance label="Withdrawal hold" value={formatPaise(wallet.holdPaise)} />
      </section>
      <div className="mt-3 flex items-center gap-3">
        <BittuFigure pose="balance" className="h-16 w-auto shrink-0" />
        <p className="text-xs text-muted">Cash is the balance that can be withdrawn. Bonus and bonus proceeds stay separate and are not added into withdrawable cash.</p>
      </div>
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
              <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="wrap-anywhere min-w-0">{entry.description}</span>
                <span className="num shrink-0">{formatSignedPaise(entry.amountPaise)}</span>
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
      <p className="num wrap-anywhere mt-1 font-semibold">{value}</p>
    </section>
  );
}
