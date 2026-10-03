import { AppFrame } from "@/components/chrome";
import { isInvestorDemoIdentity } from "@/domain/investor-demo";
import { getCurrentUser } from "@/server/current-user";

export const dynamic = "force-dynamic";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const settingsAttention = Boolean(user && !user.givenName);
  return <AppFrame demo={Boolean(user && isInvestorDemoIdentity(user))} settingsAttention={settingsAttention}>{children}</AppFrame>;
}
