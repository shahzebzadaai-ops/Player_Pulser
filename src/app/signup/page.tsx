import { redirect } from "next/navigation";
import { directSignupTarget } from "@/domain/auth-surface";
import { getCurrentUser } from "@/server/current-user";

export default async function SignupPage() {
  const user = await getCurrentUser();
  redirect(directSignupTarget(Boolean(user)));
}