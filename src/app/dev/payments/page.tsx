import { notFound } from "next/navigation";
import { DevPaymentPanel } from "@/components/dev-payment-panel";
import { devAuthAllowed } from "@/domain/phone";
import { getCurrentUser } from "@/server/current-user";

export const metadata = { title: "Development payments", robots: { index: false, follow: false } };

export default async function DevPaymentsPage() {
  if (process.env.NODE_ENV === "production" || !devAuthAllowed()) notFound();
  const user = await getCurrentUser();
  if (!user) notFound();
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[430px] px-4 py-6">
      <h1 className="text-2xl font-bold">Development payment simulator</h1>
      <p className="mt-2 text-sm text-muted">
        Each button creates a ₹500 payment and settles it through the signed webhook path. It does not edit a balance directly.
      </p>
      <DevPaymentPanel />
    </main>
  );
}
