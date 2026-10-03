import Link from "next/link";
import { BannerSlot } from "@/components/banner-slot";
import { MoverCard, SectionHead } from "@/components/cards";
import { FeaturedPlayerHero } from "@/components/featured-player";
import { MarketPulse } from "@/components/price-display";
import { PlayerTicker } from "@/components/player-ticker";
import { Logo, Portrait } from "@/components/visuals";
import { selectFeaturedPlayers } from "@/domain/featured";
import { formatPaise, formatPercent, formatSignedPaise } from "@/domain/money";
import { requireCustomer } from "@/server/page-access";
import { listPlayers, portfolio, walletSummary } from "@/server/queries";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const user = await requireCustomer({ type: "HOME" });
  const [market, wallet, book, announcements] = await Promise.all([
    listPlayers(),
    walletSummary(user.id),
    portfolio(user.id),
    prisma.announcement.findMany({ where: { status: "LIVE" }, orderBy: { updatedAt: "desc" }, take: 2 }),
  ]);
  const movers = [...market.players].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, 8);
  const featured = selectFeaturedPlayers(market.players).map(({ player, reason }) => ({ ...player, reason }));
  const pulsers = [...book.positions].sort((a, b) => (BigInt(b.currentPaise) > BigInt(a.currentPaise) ? 1 : -1));

  return (
    <main className="px-4 pt-4">
      <header className="flex min-w-0 items-center justify-between gap-2">
        <Logo />
        <div className="ml-auto flex items-center gap-2">
          <Link href="/market" className="flex h-11 w-11 items-center justify-center rounded-full bg-card" aria-label="Search market">⌕</Link>
          <Link href="/notifications" className="flex h-11 w-11 items-center justify-center rounded-full bg-card" aria-label="Notifications">⌁</Link>
          <Link href="/settings" className="flex h-11 w-11 items-center justify-center" aria-label="Settings">
            <Portrait name={user.displayName} seed={user.id} className="h-11 w-11 rounded-full" />
          </Link>
        </div>
      </header>
      <h1 className="mt-4 text-xl font-bold">Hi, {user.displayName}</h1>
      <section className="mt-4 rounded-3xl border border-line bg-card p-4" aria-label="Balance">
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">Cash balance</p>
            <p className="num mt-1 text-lg font-bold">{formatPaise(wallet.cashPaise)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gold">Bonus balance</p>
            <p className="num mt-1 text-lg font-bold text-gold">{formatPaise(wallet.bonusPaise)}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href="/wallet/deposit" className="btn-primary w-full whitespace-nowrap">Deposit</Link>
          <Link href="/wallet" className="btn-secondary w-full whitespace-nowrap">Withdraw</Link>
        </div>
      </section>
      {user.role === "ADMIN" ? <Link href="/admin" className="mt-3 inline-flex min-h-11 items-center text-sm text-india">Open admin</Link> : null}
      <section className="mt-5" aria-label="My Pulsers">
        <SectionHead title="My Pulsers" href="/portfolio" />
        {pulsers.length === 0 ? (
          <p className="text-sm text-muted">No Pulsers yet. <Link className="text-india" href="/market">Explore Market</Link></p>
        ) : (
          <div className="snap-row">
            {pulsers.map((position) => (
              <Link key={position.playerId} href={`/players/${position.slug}`} className="w-[220px] shrink-0 rounded-2xl border border-line bg-card p-3">
                <div className="flex gap-2">
                  <Portrait name={position.name} seed={position.slug} className="h-14 w-12" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{position.name}</p>
                    <p className="text-xs text-muted">{position.quantity} Pulsers</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted">Avg buy {formatPaise(position.averagePaise)}</p>
                <p className="text-xs text-muted">Price {formatPaise(position.midPaise)}</p>
                <p className="text-sm font-semibold">Value {formatPaise(position.currentPaise)}</p>
                <p className={Number(position.pnlPaise) >= 0 ? "text-sm text-gain" : "text-sm text-loss"}>
                  {formatSignedPaise(position.pnlPaise)} ({formatPercent(position.pnlPercent)})
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="mt-5">
        <SectionHead title="Top movers" href="/market?sort=movers" />
        <div className="snap-row">
          {movers.map((player) => (
            <MoverCard key={player.id} player={player} />
          ))}
        </div>
      </section>
      <div className="mt-5">
        <FeaturedPlayerHero players={featured} tradeHref="player" />
      </div>
      <MarketPulse />
      <PlayerTicker players={market.players} />
      <BannerSlot placement="HOME_MAIN" />
      {announcements.map((announcement) => (
        <p key={announcement.id} className="mt-3 rounded-2xl border border-line bg-card p-3 text-sm">
          <span className="font-semibold">{announcement.title}. </span>
          {announcement.body}
        </p>
      ))}
    </main>
  );
}
