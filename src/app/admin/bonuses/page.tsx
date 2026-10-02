import { formatPaise } from "@/domain/money";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Admin bonuses" };

export default async function AdminBonusesPage() {
  await assertPagePermission("bonus.view");
  const [grants, flags] = await Promise.all([
    prisma.bonusGrant.findMany({ include: { user: true }, orderBy: { createdAt: "desc" } }),
    prisma.abuseFlag.findMany({ include: { user: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return (
    <main>
      <h2 className="text-2xl font-bold">Bonuses</h2>
      <ul className="mt-4 space-y-2 text-sm">
        {grants.map((grant) => (
          <li key={grant.id} className="rounded-xl border border-line bg-card px-3 py-3">
            <p>
              {grant.user.displayName} · {grant.status} · {formatPaise(grant.amountPaise)}
            </p>
            <p className="text-xs text-muted">
              {grant.eligibility}
              {grant.eligibilityReason ? ` · ${grant.eligibilityReason}` : ""} · Wagered {formatPaise(grant.wageringProgressPaise)} of {formatPaise(grant.wageringRequiredPaise)}
            </p>
          </li>
        ))}
      </ul>
      <h3 className="mt-6 font-semibold">Abuse flags</h3>
      <p className="mt-1 text-xs text-muted">Internal review notes. These are not shown to customers.</p>
      <ul className="mt-2 space-y-2 text-sm">
        {flags.map((flag) => (
          <li key={flag.id} className="rounded-xl border border-line bg-card px-3 py-2">
            {flag.user.displayName} · {flag.code} · {flag.detail}
          </li>
        ))}
      </ul>
    </main>
  );
}
