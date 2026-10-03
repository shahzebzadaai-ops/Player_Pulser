import { redirect } from "next/navigation";
import { AppFrame } from "@/components/chrome";
import { isInvestorDemoIdentity } from "@/domain/investor-demo";
import { getCurrentUser } from "@/server/current-user";

export const dynamic = "force-dynamic";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <AppFrame demo={isInvestorDemoIdentity(user)}>{children}</AppFrame>;
}
