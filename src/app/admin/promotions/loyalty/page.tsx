import Link from "next/link";
import { VIP_RULE } from "@/domain/vip";
import { TaskList } from "@/components/task-list";
import { assertPagePermission } from "@/server/guard";
import { getFeatures } from "@/server/features";

export const metadata = { title: "Loyalty" };

export default async function LoyaltyPage() {
  await assertPagePermission("bonus.view");
  const features = await getFeatures();
  return (
    <div>
      <section className="rounded-3xl border border-gold/40 bg-card p-4">
        <p className="text-xs font-semibold text-gold">LOYALTY</p>
        <h2 className="mt-1 text-2xl font-bold">Loyalty desk</h2>
        <p className="mt-2 text-sm text-muted">
          Programme is {features.loyaltyEnabled ? "on" : "paused"}. Pausing hides new loyalty promotions. Existing bonus balances stay on the bonuses page. {VIP_RULE}
        </p>
        <Link className="mt-3 inline-flex text-sm text-gold" href="/admin/operations/features">Feature controls</Link>
      </section>
      <div className="mt-6">
        <TaskList type="VIP_CALL" title="VIP calls" note="Gold-desk follow-ups. These tasks do not change loyalty balances." />
      </div>
    </div>
  );
}
