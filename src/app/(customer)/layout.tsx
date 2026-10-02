import { redirect } from "next/navigation";
import { AppFrame } from "@/components/chrome";
import { getCurrentUser } from "@/server/current-user";

export const dynamic = "force-dynamic";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <AppFrame>{children}</AppFrame>;
}
