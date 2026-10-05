import { GatewayEditor } from "@/components/gateway-editor";
import { GatewayHealthList } from "@/components/gateway-health";
import { presentGateway } from "@/server/gateway-view";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Banking gateways", robots: { index: false, follow: false } };

export default async function BankingGatewaysPage() {
  await assertPagePermission("settings.manage");
  const rows = await prisma.paymentGateway.findMany({ where: { category: "BANKING" }, orderBy: { priority: "asc" } });
  const presented = rows.map((row) => presentGateway(row));
  return (
    <main>
      <h2 className="text-2xl font-bold">Banking Gateways</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Provider records only. Webhook secrets and API keys stay in environment config and are not shown here.
      </p>
      <GatewayHealthList rows={presented} />
      <GatewayEditor category="BANKING" rows={presented} />
    </main>
  );
}
