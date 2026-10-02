import { DepositFlow } from "@/components/deposit-flow";
import { getCurrentUser } from "@/server/current-user";
import { walletSummary } from "@/server/queries";

export const metadata = { title: "Deposit", robots: { index: false, follow: false } };

export default async function DepositPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const wallet = await walletSummary(user.id);
  return (
    <main className="px-4 pb-8 pt-4">
      <h1 className="text-2xl font-bold">Deposit</h1>
      <DepositFlow cashPaise={wallet.cashPaise} bonusPaise={wallet.bonusPaise} />
    </main>
  );
}
