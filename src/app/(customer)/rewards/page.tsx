import { BannerSlot } from "@/components/banner-slot";
import { formatPaise } from "@/domain/money";
import { getCurrentUser } from "@/server/current-user";
import { getFeatures } from "@/server/features";
import { walletSummary } from "@/server/queries";

export const metadata = { title: "Rewards" };

export default async function RewardsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [wallet, features] = await Promise.all([walletSummary(user.id), getFeatures()]);
  const bonus = wallet.bonus;
  const progress = bonus ? Number(bonus.progressPaise) : 0;
  const required = bonus ? Number(bonus.requiredPaise) : 1;
  const width = Math.min(100, Math.round((progress / required) * 100));
  const depositWidth = Math.min(100, Math.round((Number(wallet.depositsPaise) / Number(wallet.depositRequiredPaise)) * 100));

  return (
    <main className="px-4 pt-4">
      <h1 className="text-2xl font-bold">Rewards</h1>
      <BannerSlot placement="REWARDS" />
      {!features.loyaltyEnabled ? <p className="mt-4 text-sm">Loyalty is temporarily unavailable. Existing bonus records stay on this page.</p> : null}
      {!features.bonusSystemEnabled ? <p className="mt-4 text-sm text-muted">New bonus promotions are paused. Existing bonus balances stay available.</p> : null}
      {!bonus && features.bonusSystemEnabled ? <p className="mt-4 text-sm text-muted">No welcome bonus is attached to this account.</p> : null}
      {bonus ? (
        <section className="mt-4 rounded-3xl border border-gold/40 bg-card p-4">
          <p className="text-xs font-semibold text-gold">{features.loyaltyEnabled ? "LOYALTY · " : ""}WELCOME BONUS · {bonus.status}</p>
          <p className="num wrap-anywhere mt-1 text-[clamp(1.75rem,8vw,2.25rem)] font-bold text-gold">{formatPaise(bonus.amountPaise)}</p>
          <p className="mt-2 text-sm text-muted">Usable now for trading. Bonus-derived value becomes withdrawable only after the conditions below.</p>
          <p className="mt-4 text-sm">Wagering {formatPaise(bonus.progressPaise)} of {formatPaise(bonus.requiredPaise)}</p>
          <div className="mt-1 h-2 rounded-full bg-pitch">
            <div className="h-2 rounded-full bg-gain" style={{ width: `${width}%` }} />
          </div>
          <p className="mt-4 text-sm">Qualifying deposits {formatPaise(wallet.depositsPaise)} of {formatPaise(wallet.depositRequiredPaise)}</p>
          <div className="mt-1 h-2 rounded-full bg-pitch">
            <div className="h-2 rounded-full bg-india" style={{ width: `${depositWidth}%` }} />
          </div>
          <p className="mt-4 text-xs text-muted">Expires {new Date(bonus.expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST. Buys count toward wagering. Sells do not. Opening seed balances are not qualifying deposits.</p>
          {bonus.status === "EXPIRED" ? (
            <p className="mt-3 text-sm">Unused bonus and unconverted bonus proceeds were forfeited. Units you already hold stay in the portfolio. Selling those units after expiry forfeits the bonus-funded portion of the proceeds.</p>
          ) : null}
        </section>
      ) : null}
      <section className="mt-4 rounded-3xl bg-card p-4 text-sm text-muted">
        <h2 className="font-semibold text-ink">Bonus proceeds</h2>
        <p className="mt-2 num text-ink">{formatPaise(wallet.proceedsPaise)}</p>
        <p className="mt-1">This is tracked separately from cash so it is not treated as withdrawable before conversion.</p>
      </section>
    </main>
  );
}
