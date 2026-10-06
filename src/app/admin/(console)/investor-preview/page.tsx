import { InvestorPreviewPanel } from "@/components/investor-preview-panel";
import { assertPagePermission } from "@/server/guard";
import { listPreviewLinks } from "@/server/preview-links";

export const dynamic = "force-dynamic";
export const metadata = { title: "Investor preview", robots: { index: false, follow: false } };

export default async function InvestorPreviewPage() {
  await assertPagePermission("settings.manage");
  const links = await listPreviewLinks();
  return (
    <main>
      <h2 className="text-2xl font-bold">Investor Preview</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        A link can be opened once. If it is unused, it expires 15 minutes after it is created. After it is opened, the preview session lasts 15 minutes from that moment. The visitor uses the investor demo account, sees SHOWCASE MARKET, and cannot deposit or withdraw real money.
      </p>
      <InvestorPreviewPanel
        links={links.map((link) => ({
          ...link,
          createdAt: link.createdAt.toISOString(),
          expiresAt: link.expiresAt.toISOString(),
          usedAt: link.usedAt?.toISOString() ?? null,
        }))}
      />
    </main>
  );
}
