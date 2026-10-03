import { redirect } from "next/navigation";
import type { AuthIntent } from "@/domain/auth-intent";
import { getCurrentUser } from "./current-user";

export async function requireCustomer(intent?: AuthIntent) {
  const user = await getCurrentUser();
  if (!user) {
    if (intent && intent.type !== "BUY") redirect(`/api/auth/gate?type=${intent.type}`);
    redirect("/login");
  }
  return user;
}
