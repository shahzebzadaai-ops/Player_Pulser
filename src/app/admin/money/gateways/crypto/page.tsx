import { GatewayEditor } from "@/components/gateway-editor";
import { GatewayHealthList } from "@/components/gateway-health";
import { presentGateway } from "@/server/gateway-view";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Crypto gateways", robots: { index: false, follow: false } };

export default async function CryptoGatewaysPage() {
  await assertPagePermission("settings.manage");
  const rows = await prisma.paymentGateway.findMany({ where: { category: "CRYPTO" }, orderBy: { priority: "asc" } });
  const presented = rows.map((row) => presentGateway(row));
  return (
    <main>
      <h2 className="text-2xl font-bold">Crypto Gateways</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Network and asset settings only. Private wallet keys are not stored in these records.
      </p>
      <GatewayHealthList rows={presented} />
      <GatewayEditor category="CRYPTO" rows={presented} />
    </main>
  );
}
