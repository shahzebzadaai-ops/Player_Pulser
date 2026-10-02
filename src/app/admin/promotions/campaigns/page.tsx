import { CampaignForm } from "@/components/ops-forms";
import { assertPageAny } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  await assertPageAny(["bonus.view", "content.manage"]);
  const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <main>
      <h2 className="text-2xl font-bold">Campaigns</h2>
      <p className="mt-1 text-sm text-muted">Drafts only. Disabling a campaign keeps the copy. It does not delete bonus history.</p>
      <CampaignForm />
      <ul className="mt-4 space-y-2 text-sm">
        {campaigns.map((campaign) => (
          <li key={campaign.id} className="rounded-xl border border-line bg-card px-3 py-3">
            <p className="font-semibold">{campaign.name}</p>
            <p className="text-xs text-muted">{campaign.channel} · {campaign.status}</p>
            <p className="mt-1">{campaign.body}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
