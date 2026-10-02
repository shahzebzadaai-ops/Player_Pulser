import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth-screen";
import { devAuthAllowed } from "@/domain/phone";
import { getCurrentUser } from "@/server/current-user";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/home");
  return <AuthScreen mode="signup" devAuth={devAuthAllowed()} />;
}
