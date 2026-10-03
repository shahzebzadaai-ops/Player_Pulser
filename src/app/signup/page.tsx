import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/current-user";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/continue");
  redirect("/?auth=signup");
}