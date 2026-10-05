import { CampaignForm } from "@/components/ops-forms";
import { assertPagePermission } from "@/server/guard";
import { getFeatures } from "@/server/features";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Push" };

export default async function PushPage() {
  await assertPagePermission("content.manage");
  const [features, campaigns] = await Promise.all([
    getFeatures(),
    prisma.campaign.findMany({ where: { channel: "PUSH" }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <main>
      <h2 className="text-2xl font-bold">Push</h2>
      <p className="mt-1 text-sm text-muted">
        Drafts only. Push is {features.pushEnabled ? "enabled for drafts" : "paused"}. No notification is sent from this app.
      </p>
      {features.pushEnabled ? <CampaignForm channel="PUSH" /> : <p className="mt-4 text-sm">New push campaigns are temporarily unavailable. Existing drafts stay listed.</p>}
      <ul className="mt-4 space-y-2 text-sm">
        {campaigns.map((campaign) => (
          <li key={campaign.id} className="rounded-xl border border-line bg-card px-3 py-2">{campaign.name} · {campaign.status}</li>
        ))}
      </ul>
    </main>
  );
}
