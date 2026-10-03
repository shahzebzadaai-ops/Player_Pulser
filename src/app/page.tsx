import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BannerSlot } from "@/components/banner-slot";
import { SignupPrompt } from "@/components/signup-prompt";
import { LiveCard, MoverCard } from "@/components/cards";
import { FeaturedPlayerHero } from "@/components/featured-player";
import { MarketPulse } from "@/components/price-display";
import { PlayerTicker } from "@/components/player-ticker";
import { ShowcaseMark, StreamStatus } from "@/components/price-stream";
import { Logo } from "@/components/visuals";
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
  if (user) redirect("/home");
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
    <main className="mx-auto min-h-dvh w-full max-w-[430px] px-4 pb-10 pt-5">
      <header className="flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <ShowcaseMark />
          <StreamStatus />
          <Link href="/signup" className="min-h-11 rounded-xl bg-india px-3 py-2 text-sm font-semibold">
            Sign up
          </Link>
          <Link href="/login" className="min-h-11 rounded-xl px-3 py-2 text-sm text-india">
            Log in
          </Link>
        </div>
      </header>
      <MarketPulse />
      <PlayerTicker players={players} />
      <BannerSlot placement="LANDING_HERO" />
      <section className="relative mt-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#12386f] to-[#07111f] p-5">
        <p className="max-w-[14rem] text-4xl font-bold leading-tight">
          Trade the <span className="text-india">Pulse</span> of Cricket
        </p>
        <p className="mt-3 max-w-[16rem] text-sm text-muted">Buy top Indian players. Track live prices. Sell at the right moment.</p>
        <p className="mt-4 max-w-[9rem] text-right text-sm font-semibold text-india">Players move. So can you.</p>
      </section>
      <ul className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
        <li className="rounded-full bg-card px-3 py-1">Live updates</li>
        <li className="rounded-full bg-card px-3 py-1">Real-time pricing</li>
        <li className="rounded-full bg-card px-3 py-1">Mobile-first</li>
      </ul>
      <div className="mt-4">
        {players.length > 0 ? (
          <FeaturedPlayerHero players={selectFeaturedPlayers(players).map(({ player, reason }) => ({ ...player, reason }))} tradeHref="account" />
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
            <LiveCard key={player.id} player={player} />
          ))}
        </div>
      </section>
      <section className="mt-6">
        <h2 className="text-lg font-semibold">How it works</h2>
        <ol className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-muted">
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
      <Link href="/signup" className="mt-6 flex min-h-12 items-center justify-center rounded-full bg-india text-base font-semibold">
        Start trading players
      </Link>
      <p className="mt-4 text-center text-xs text-muted">Trusted as a development preview · Made for India · Simulated money</p>
      <p className="sr-only">{formatPaise("0")}</p>
      <SignupPrompt />
    </main>
  );
}
