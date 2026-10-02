import { headers } from "next/headers";
import { CopyLink, LinkStatusButton } from "@/components/marketing-forms";
import { hasPermission } from "@/domain/permissions";
import { buildCampaignUrl } from "@/domain/attribution";
import { assertPageAny } from "@/server/guard";
import { campaignLinkMetrics } from "@/server/marketing-report";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Campaign links" };

export default async function CampaignLinksPage() {
  const access = await assertPageAny(["utm.view", "marketing.view"]);
  const canManage = hasPermission(access.staffRole, "utm.manage");
  const headerStore = await headers();
  const origin = headerStore.get("origin") ?? `http://${headerStore.get("host") ?? "localhost:3000"}`;
  const links = await prisma.campaignLink.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const stats = await Promise.all(links.map((link) => campaignLinkMetrics(link)));
  return (
    <main>
      <h2 className="text-2xl font-bold">Campaign links</h2>
      <p className="mt-1 text-sm text-muted">Visits, signups, first deposits, and first trades come from first-party touches.</p>
      <ul className="mt-4 space-y-3">
        {links.length === 0 ? <li className="text-sm text-muted">No saved links yet.</li> : null}
        {links.map((link, index) => {
          const built = buildCampaignUrl({
            origin,
            destination: link.destination,
            source: link.utmSource,
            medium: link.utmMedium,
            campaign: link.utmCampaign,
            content: link.utmContent ?? undefined,
            term: link.utmTerm ?? undefined,
          });
          const url = "url" in built ? built.url : link.destination;
          const metric = stats[index];
          return (
            <li key={link.id} className="rounded-2xl border border-line bg-card p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{link.name} · {link.status}</p>
                <div className="flex gap-2">
                  <CopyLink url={url} />
                  {canManage ? <LinkStatusButton id={link.id} status={link.status} /> : null}
                </div>
              </div>
              <p className="mt-2 break-all text-muted">{url}</p>
              <p className="mt-2">{metric?.visits ?? 0} visits · {metric?.signups ?? 0} signups · {metric?.firstDeposits ?? 0} first deposits · {metric?.firstTrades ?? 0} first trades</p>
              {link.notes ? <p className="mt-1 text-muted">{link.notes}</p> : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
