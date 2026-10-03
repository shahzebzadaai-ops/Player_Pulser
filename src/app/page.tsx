import type { Metadata } from "next";
import Link from "next/link";
import { BannerSlot } from "@/components/banner-slot";
import { LiveCard, MoverCard } from "@/components/cards";
import { FeaturedPlayerHero } from "@/components/featured-player";
import { MarketPulse } from "@/components/price-display";
import { PlayerTicker } from "@/components/player-ticker";
import { ShowcaseMark, StreamStatus } from "@/components/price-stream";
import { DemoEntry } from "@/components/demo-entry";
import { Logo } from "@/components/visuals";
import { investorDemoEnabled } from "@/domain/investor-demo";
import { selectFeaturedPlayers } from "@/domain/featured";
import { formatPaise } from "@/domain/money";
import { getCurrentUser } from "@/server/current-user";
import { listPlayers, type PlayerView } from "@/server/queries";
import { getSeo } from "@/server/seo";

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeo();
  return {
    title: { absolute: seo.siteTitle },
    description: seo.siteDescription,
    robots: { index: seo.robotsIndex, follow: seo.robotsFollow },
    alternates: seo.canonicalDomain ? { canonical: seo.canonicalDomain } : undefined,
    openGraph: seo.defaultOgImageId ? { images: [`/api/media/${seo.defaultOgImageId}`] } : undefined,
  };
}

export default async function LandingPage() {
  const user = await getCurrentUser();
  let players: PlayerView[] = [];
  let movers: PlayerView[] = [];
  let strip: PlayerView[] = [];
  try {
    const market = await listPlayers();
    players = market.players;
    movers = [...market.players].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, 4);
    const featured = selectFeaturedPlayers(market.players);
    strip = market.players.filter((player) => player.slug !== featured[0]?.player.slug).slice(0, 4);
  } catch {
    players = [];
  }

  return (
    <main id="top" className="mx-auto min-h-dvh w-full max-w-[430px] px-4 pb-44 pt-5">
      <header className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
        <Logo />
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <ShowcaseMark />
          <StreamStatus />
          {investorDemoEnabled() ? <DemoEntry /> : null}
          {user ? <Link href="/home" className="btn-secondary whitespace-nowrap px-3 text-sm">Your home</Link> : (
            <>
              <Link href="/?auth=signup" className="btn-primary whitespace-nowrap px-3 text-sm">Sign up</Link>
              <Link href="/?auth=login" className="btn-secondary whitespace-nowrap px-3 text-sm">Log in</Link>
            </>
          )}
        </div>
      </header>
      <MarketPulse />
      <PlayerTicker players={players} />
      <BannerSlot placement="LANDING_HERO" />
      <section className="relative mt-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#12386f] to-[#07111f] p-5">
        <p className="min-w-0 text-[clamp(1.65rem,7.4vw,2.15rem)] font-bold leading-[1.08]">
          Trade the <span className="text-india">Pulse</span> of Cricket
        </p>
        <p className="mt-3 text-sm text-muted">Buy top Indian players. Track live prices. Sell at the right moment.</p>
        <div className="mt-4 rounded-2xl bg-black/25 p-3">
          <p className="text-sm font-semibold">₹200 welcome bonus</p>
          <p className="mt-1 text-xs text-muted">Create an account to claim it, then deposit from ₹500 to trade.</p>
          <Link href="/wallet/deposit" className="btn-primary mt-3 text-sm">
            Deposit
          </Link>
        </div>
      </section>
      <ul className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
        <li className="rounded-full bg-card px-3 py-1">Live updates</li>
        <li className="rounded-full bg-card px-3 py-1">Real-time pricing</li>
        <li className="rounded-full bg-card px-3 py-1">Mobile-first</li>
      </ul>
      <div className="mt-4">
        {players.length > 0 ? (
          <FeaturedPlayerHero players={selectFeaturedPlayers(players).map(({ player, reason }) => ({ ...player, reason }))} tradeHref="player" />
        ) : (
          <p className="rounded-2xl bg-card p-4 text-sm text-muted">Prices appear after the local database is seeded.</p>
        )}
      </div>
      {strip.length > 0 ? (
        <div className="snap-row mt-3">
          {strip.map((player) => (
            <MoverCard key={player.id} player={player} />
          ))}
        </div>
      ) : null}
      <section className="mt-6">
        <h2 className="text-lg font-semibold">Top movers</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {movers.map((player) => (
            <LiveCard key={player.id} player={player} className="min-w-0 w-full" />
          ))}
        </div>
      </section>
      <section className="mt-6">
        <h2 className="text-lg font-semibold">How it works</h2>
        <ol className="mt-3 grid gap-2 text-sm text-muted">
          <li className="rounded-2xl bg-card p-3">
            <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-india font-bold text-ink">1</span>
            Sign up. The ₹200 Welcome Bonus is added once.
          </li>
          <li className="rounded-2xl bg-card p-3">
            <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-india font-bold text-ink">2</span>
            Buy players. Track live prices.
          </li>
          <li className="rounded-2xl bg-card p-3">
            <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-india font-bold text-ink">3</span>
            Deposit from ₹500, then trade. Profits are not guaranteed.
          </li>
        </ol>
      </section>
      <Link href="/signup" className="btn-primary mt-6 w-full text-base">
        Start trading players
      </Link>
      <p className="mt-4 text-center text-xs text-muted">Showcase market · Made for India</p>
      <p className="sr-only">{formatPaise("0")}</p>
    </main>
  );
}
