import Link from "next/link";
import { assertPagePermission } from "@/server/guard";

export const metadata = { title: "Payment settings" };

export default async function PaymentSettingsPage() {
  await assertPagePermission("settings.view");
  return (
    <main>
      <h2 className="text-2xl font-bold">Payment settings</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Simulated deposits and withdrawals keep their current behaviour. This screen does not switch on a real provider.
      </p>
      <p className="mt-4 text-sm">
        <Link className="text-india" href="/admin/payments">Open reconciliation</Link>
      </p>
    </main>
  );
}
