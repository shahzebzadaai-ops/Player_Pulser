import { AssistantHint } from "@/components/banner-editor";
import { CampaignForm } from "@/components/ops-forms";
import { assertPagePermission } from "@/server/guard";
import { getFeatures } from "@/server/features";
import { prisma } from "@/server/prisma";

export const metadata = { title: "WhatsApp" };

export default async function WhatsAppPage() {
  await assertPagePermission("content.manage");
  const [features, campaigns] = await Promise.all([
    getFeatures(),
    prisma.campaign.findMany({ where: { channel: "WHATSAPP" }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <main>
      <h2 className="text-2xl font-bold">WhatsApp</h2>
      <p className="mt-1 text-sm text-muted">
        Drafts only. WhatsApp is {features.whatsappEnabled ? "enabled for drafts" : "paused"}. No message is sent from this app.
      </p>
      <AssistantHint />
      {features.whatsappEnabled ? <CampaignForm channel="WHATSAPP" /> : <p className="mt-4 text-sm">New WhatsApp campaigns are temporarily unavailable. Existing drafts stay listed.</p>}
      <ul className="mt-4 space-y-2 text-sm">
        {campaigns.map((campaign) => (
          <li key={campaign.id} className="rounded-xl border border-line bg-card px-3 py-2">{campaign.name} · {campaign.status}</li>
        ))}
      </ul>
    </main>
  );
}
