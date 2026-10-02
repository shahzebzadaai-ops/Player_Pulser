import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BannerSlot } from "@/components/banner-slot";
import { SignupPrompt } from "@/components/signup-prompt";
import { LiveCard, MoverCard } from "@/components/cards";
import { Logo, Portrait, PriceText, Sparkline } from "@/components/visuals";
import { getCurrentUser } from "@/server/current-user";
import { formatPaise, formatPercent, formatSignedPaise } from "@/domain/money";
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
  let featured: PlayerView | null = null;
  let movers: PlayerView[] = [];
  let strip: PlayerView[] = [];
  try {
    const market = await listPlayers();
    featured = market.players.find((player) => player.slug === "virat-kohli") ?? market.players[0] ?? null;
    movers = [...market.players].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, 4);
    strip = market.players.filter((player) => player.slug !== featured?.slug).slice(0, 4);
  } catch {
    featured = null;
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[430px] px-4 pb-10 pt-5">
      <header className="flex items-center justify-between">
        <Logo />
        <div className="flex gap-2">
          <Link href="/signup" className="min-h-11 rounded-xl bg-india px-3 py-2 text-sm font-semibold">
            Sign up
          </Link>
          <Link href="/login" className="min-h-11 rounded-xl px-3 py-2 text-sm text-india">
            Log in
          </Link>
        </div>
      </header>
      <BannerSlot placement="LANDING_HERO" />
      <section className="relative mt-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#12386f] to-[#07111f] p-5">
        <p className="max-w-[14rem] text-4xl font-bold leading-tight">
          Trade the <span className="text-india">Pulse</span> of Cricket
        </p>
        <p className="mt-3 max-w-[16rem] text-sm text-muted">Buy top Indian players. Track live prices. Sell at the right moment.</p>
        <p className="mt-4 max-w-[9rem] text-right text-sm font-semibold text-india">Players move. So can you.</p>
        <div className="pointer-events-none absolute bottom-0 right-0 opacity-90">
          <Portrait name="India" seed="india-hero" className="h-36 w-28" />
        </div>
      </section>
      <ul className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
        <li className="rounded-full bg-card px-3 py-1">Live updates</li>
        <li className="rounded-full bg-card px-3 py-1">Real-time pricing</li>
        <li className="rounded-full bg-card px-3 py-1">Mobile-first</li>
      </ul>
      {featured ? (
        <article className="mt-4 rounded-3xl border border-line bg-card p-4">
          <div className="flex gap-3">
            <Portrait name={featured.name} seed={featured.slug} className="h-28 w-24" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold"><Link href={`/p/${featured.slug}`}>{featured.name}</Link></h2>
                  <p className="text-xs text-muted">Player price</p>
                </div>
                {featured.live ? <span className="rounded-full bg-gain/20 px-2 py-1 text-[10px] font-bold text-gain">LIVE</span> : null}
              </div>
              <p className="num text-3xl font-bold">
                <PriceText playerId={featured.id} field="mid" paise={featured.midPaise} />
              </p>
              <p className="text-sm text-gain">
                {formatSignedPaise(featured.changePaise)} ({formatPercent(featured.changePercent)})
              </p>
              <Sparkline values={featured.history} positive={Number(featured.changePaise) >= 0} />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link href="/signup" className="flex min-h-12 items-center justify-center rounded-xl bg-gain font-bold text-pitch">
              BUY
            </Link>
            <Link href="/signup" className="flex min-h-12 items-center justify-center rounded-xl bg-loss font-bold">
              SELL
            </Link>
          </div>
        </article>
      ) : (
        <p className="mt-4 rounded-2xl bg-card p-4 text-sm text-muted">Prices appear after the local database is seeded.</p>
      )}
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
