import { redirect } from "next/navigation";
import { BittuFigure } from "@/components/bittu-figure";
import { AdminLoginForm } from "@/components/admin-login-form";
import { isInvestorDemoIdentity } from "@/domain/investor-demo";
import { getCurrentUser } from "@/server/current-user";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations sign in", robots: { index: false, follow: false } };

export default async function AdminLoginPage() {
  const user = await getCurrentUser();
  if (user?.role === "ADMIN" && !isInvestorDemoIdentity(user)) redirect("/admin");
  if (user) redirect("/home");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col items-center overflow-x-hidden px-4 py-8 md:flex-row md:items-center md:justify-center md:gap-14 md:px-8">
      <BittuFigure pose="welcome" priority className="h-40 w-auto shrink-0 md:h-[28rem]" />
      <section className="mt-6 w-full max-w-md rounded-3xl border border-[#3d8bff] bg-white/10 p-6 shadow-[0_0_48px_rgba(47,123,255,0.35)] backdrop-blur-xl md:mt-0 md:p-8">
        <p className="text-xs font-semibold tracking-[0.18em] text-[#9ec2ff]">PLAYERPULSER OPERATIONS</p>
        <h1 className="mt-3 text-3xl font-bold">Welcome back.</h1>
        <p className="mt-2 text-sm text-[#c5d4e8]">Manage customers, market, money, risk and growth.</p>
        <AdminLoginForm />
      </section>
    </main>
  );
}
