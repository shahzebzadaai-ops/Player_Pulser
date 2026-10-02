import Link from "next/link";
import { BannerSlot } from "@/components/banner-slot";
import { LiveCard, MoverCard, Notice, SectionHead } from "@/components/cards";
import { MarketPulse } from "@/components/price-display";
import { PlayerTicker } from "@/components/player-ticker";
import { LogoutButton, WelcomeBanner } from "@/components/chrome";
import { Logo, Portrait } from "@/components/visuals";
import { customerCta, lifecycleStage } from "@/domain/growth";
import { formatPaise, formatPercent, formatSignedPaise } from "@/domain/money";
import { getCurrentUser } from "@/server/current-user";
import { getFeatures } from "@/server/features";
import { listPlayers, portfolio, walletSummary } from "@/server/queries";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [market, wallet, book, features, announcements, bonus, pendingDeposits, settledDeposits, trades] = await Promise.all([
    listPlayers(),
    walletSummary(user.id),
    portfolio(user.id),
    getFeatures(),
    prisma.announcement.findMany({ where: { status: "LIVE" }, orderBy: { updatedAt: "desc" }, take: 2 }),
    prisma.bonusGrant.findUnique({ where: { userId_source: { userId: user.id, source: "WELCOME" } } }),
    prisma.payment.count({ where: { userId: user.id, kind: "DEPOSIT", status: "PENDING" } }),
    prisma.payment.count({ where: { userId: user.id, kind: "DEPOSIT", status: "SETTLED" } }),
    prisma.trade.count({ where: { userId: user.id } }),
  ]);
  const stage = lifecycleStage({
    registered: true,
    bonusReceived: bonus?.status === "ACTIVE",
    depositPending: pendingDeposits > 0,
    deposited: settledDeposits > 0,
    traded: trades > 0,
    cooling: false,
    churnRisk: false,
  });
  const cta = customerCta(stage);
  const live = market.players.filter((player) => player.live);
  const movers = [...market.players].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, 8);
  const trending = [...market.players].sort((a, b) => b.changePercent - a.changePercent).slice(0, 4);

  return (
    <main className="px-4 pt-4">
      <header className="flex items-center justify-between">
        <Logo />
        <div className="flex gap-2">
          <Link href="/market" className="flex h-11 w-11 items-center justify-center rounded-full bg-card" aria-label="Search market">
            ⌕
          </Link>
          <Link href="/notifications" className="flex h-11 w-11 items-center justify-center rounded-full bg-card" aria-label="Notifications">
            ⌁
          </Link>
          <LogoutButton />
        </div>
      </header>
      <div className="mt-4 flex items-center gap-3">
        <Portrait name={user.displayName} seed={user.id} className="h-12 w-12 rounded-full" />
        <div>
          <h1 className="text-xl font-bold">Hi, {user.displayName}!</h1>
          <p className="text-sm text-muted">Trade players. Track live prices. Be ahead.</p>
        </div>
      </div>
      {user.role === "ADMIN" ? (
        <Link href="/admin" className="mt-3 inline-flex min-h-11 items-center text-sm text-india">
          Open admin
        </Link>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <section className="rounded-2xl border border-line bg-card p-3">
          <p className="text-xs text-muted">Cash balance</p>
          <p className="num mt-1 text-lg font-bold">{formatPaise(wallet.cashPaise)}</p>
          <Link href="/wallet/deposit" className="mt-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-india text-lg" aria-label="Deposit">
            +
          </Link>
        </section>
        <section className="rounded-2xl border border-gold/40 bg-card p-3">
          <p className="text-xs text-gold">Bonus balance</p>
          <p className="num mt-1 text-lg font-bold text-gold">{formatPaise(wallet.bonusPaise)}</p>
        </section>
      </div>
      <BannerSlot placement="HOME_MAIN" />
      {announcements.map((announcement) => (
        <p key={announcement.id} className="mt-3 rounded-2xl border border-line bg-card p-3 text-sm">
          <span className="font-semibold">{announcement.title}. </span>
          {announcement.body}
        </p>
      ))}
      {cta === "deposit" ? (
        <Link href="/wallet/deposit" className="mt-4 block rounded-2xl border border-india/40 bg-card p-4">
          <p className="font-semibold">Deposit funds to start full trading</p>
          <p className="mt-1 text-sm text-muted">Deposit Now. There is no separate deposit bonus.</p>
        </Link>
      ) : null}
      {cta === "trade" ? (
        <Link href="/market" className="mt-4 block rounded-2xl border border-india/40 bg-card p-4">
          <p className="font-semibold">Choose your first player</p>
        </Link>
      ) : null}
      {cta === "portfolio" ? (
        <Link href="/portfolio" className="mt-4 block rounded-2xl border border-line bg-card p-4 text-sm">
          Open your portfolio
        </Link>
      ) : null}
      {features.bonusSystemEnabled && features.welcomeBonusEnabled ? (
        <div className="mt-3">
          <WelcomeBanner />
        </div>
      ) : null}
      <MarketPulse />
      <PlayerTicker players={market.players} />
      <div className="mt-3">
        <Notice />
      </div>
      <section className="mt-5">
        <SectionHead title="Live now" href="/market?live=1" />
        {live.length === 0 ? <p className="text-sm text-muted">No players are marked live.</p> : null}
        <div className="snap-row">
          {live.map((player) => (
            <LiveCard key={player.id} player={player} />
          ))}
        </div>
      </section>
      <section className="mt-5">
        <SectionHead title="Top movers" href="/market?sort=movers" />
        <div className="snap-row">
          {movers.map((player) => (
            <MoverCard key={player.id} player={player} />
          ))}
        </div>
      </section>
      <section className="mt-5">
        <SectionHead title="Trending Indian players" href="/market" />
        <div className="snap-row">
          {trending.map((player) => (
            <LiveCard key={player.id} player={player} />
          ))}
        </div>
      </section>
      <section className="mt-5">
        <SectionHead title="My positions" href="/portfolio" />
        {book.positions.length === 0 ? (
          <p className="rounded-2xl bg-card p-4 text-sm text-muted">
            No Pulsers yet. <Link className="text-india" href="/market">Browse the market</Link>
          </p>
        ) : (
          <ul className="space-y-2">
            {book.positions.slice(0, 3).map((position) => (
              <li key={position.playerId}>
                <Link href={`/players/${position.slug}`} className="flex items-center gap-3 rounded-2xl bg-card p-3">
                  <Portrait name={position.name} seed={position.slug} className="h-14 w-12" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{position.name}</p>
                    <p className="text-xs text-muted">{position.quantity} units</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="text-muted">Current value</p>
                    <p className="num font-semibold">{formatPaise(position.currentPaise)}</p>
                    <p className={Number(position.pnlPaise) >= 0 ? "text-gain" : "text-loss"}>
                      {formatSignedPaise(position.pnlPaise)} ({formatPercent(position.pnlPercent)})
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
