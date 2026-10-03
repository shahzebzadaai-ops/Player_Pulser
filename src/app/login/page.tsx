import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/current-user";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ link?: string; error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/continue");
  const query = await searchParams;
  const params = new URLSearchParams({ auth: "login" });
  if (query.link === "1") params.set("link", "1");
  if (query.error === "google" || query.error === "demo") params.set("error", query.error);
  redirect(`/?${params.toString()}`);
}