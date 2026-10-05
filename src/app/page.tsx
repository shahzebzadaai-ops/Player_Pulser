import type { Metadata } from "next";
import Link from "next/link";
import { BannerSlot } from "@/components/banner-slot";
import { BittuHero } from "@/components/bittu-hero";
import { LiveMarketList } from "@/components/market-list";
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
  try {
    const market = await listPlayers();
    players = market.players;
    movers = [...market.players].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, 8);
  } catch {
    players = [];
  }

  return (
    <main id="top" className="mx-auto min-h-dvh w-full max-w-[430px] px-4 pb-44 pt-5">
      <header className="site-header">
        <Logo />
        <div className="site-header-actions">
          {user ? <Link href="/home" className="btn-secondary header-action">Your home</Link> : (
            <>
              <Link href="/?auth=signup" className="btn-primary header-action">Sign up</Link>
              <Link href="/?auth=login" className="btn-secondary header-action">Log in</Link>
            </>
          )}
        </div>
      </header>
      <div className="site-header-meta">
        <ShowcaseMark />
        <StreamStatus />
        {investorDemoEnabled() ? <DemoEntry /> : null}
      </div>
      <MarketPulse />
      <PlayerTicker players={players} />
      <BannerSlot placement="LANDING_HERO" />
      <BittuHero signedIn={Boolean(user)} />
      <ul className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
        <li className="rounded-full bg-card px-3 py-1">Live updates</li>
        <li className="rounded-full bg-card px-3 py-1">Real-time pricing</li>
        <li className="rounded-full bg-card px-3 py-1">Mobile-first</li>
      </ul>
      <div className="mt-4">
        {players.length > 0 ? (
          <FeaturedPlayerHero players={selectFeaturedPlayers(players).map(({ player, reason }) => ({ ...player, reason }))} tradeHref="player" signedIn={Boolean(user)} />
        ) : (
          <p className="rounded-2xl bg-card p-4 text-sm text-muted">Prices appear after the local database is seeded.</p>
        )}
      </div>
      <section className="mt-6">
        <h2 className="text-lg font-semibold">Top movers</h2>
        <LiveMarketList players={movers} mode="movers" />
      </section>
      <section className="mt-6">
        <h2 className="text-lg font-semibold">All players</h2>
        <LiveMarketList players={players} mode="all" />
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
