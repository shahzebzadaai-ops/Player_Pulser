import { DepositFlow } from "@/components/deposit-flow";
import { isInvestorDemoIdentity } from "@/domain/investor-demo";
import { requireCustomer } from "@/server/page-access";
import { walletSummary } from "@/server/queries";

export const metadata = { title: "Deposit", robots: { index: false, follow: false } };

export default async function DepositPage() {
  const user = await requireCustomer({ type: "DEPOSIT" });
  const wallet = await walletSummary(user.id);
  return (
    <main className="px-4 pb-8 pt-4">
      <h1 className="text-2xl font-bold">Deposit</h1>
      {isInvestorDemoIdentity(user) ? (
        <p className="mt-3 rounded-2xl border border-india/40 bg-card p-3 text-sm text-muted">
          Demo mode can open this screen. A deposit is not created, and no payment is sent.
        </p>
      ) : null}
      <DepositFlow cashPaise={wallet.cashPaise} bonusPaise={wallet.bonusPaise} />
    </main>
  );
}
