import { redirect } from "next/navigation";
import { directLoginTarget } from "@/domain/auth-surface";
import { getCurrentUser } from "@/server/current-user";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ link?: string; error?: string }> }) {
  const user = await getCurrentUser();
  const query = await searchParams;
  redirect(directLoginTarget(query, Boolean(user)));
}