import { ReferralForm } from "@/components/ops-forms";
import { assertPagePermission } from "@/server/guard";
import { getFeatures } from "@/server/features";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Referrals" };

export default async function ReferralsPage() {
  await assertPagePermission("crm.view");
  const [features, codes, users] = await Promise.all([
    getFeatures(),
    prisma.referralCode.findMany({ include: { user: true }, orderBy: { createdAt: "desc" } }),
    prisma.user.findMany({ where: { role: "CUSTOMER" }, select: { id: true, displayName: true } }),
  ]);
  return (
    <main>
      <h2 className="text-2xl font-bold">Referrals</h2>
      <p className="mt-1 text-sm text-muted">Codes are labels for staff. Creating one does not pay a bonus or change the welcome-bonus rules.</p>
      <ReferralForm users={users} enabled={features.referralsEnabled} />
      <ul className="mt-4 space-y-2 text-sm">
        {codes.length === 0 ? <li className="text-muted">No codes yet.</li> : null}
        {codes.map((code) => (
          <li key={code.id} className="rounded-xl border border-line bg-card px-3 py-2">
            {code.code} · {code.user.displayName} · {code.active ? "active" : "inactive"}
          </li>
        ))}
      </ul>
    </main>
  );
}
