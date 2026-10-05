import Link from "next/link";
import { notFound } from "next/navigation";
import { BittuFigure } from "@/components/bittu-figure";
import { ClearIntent } from "@/components/clear-intent";
import { GuestTrade } from "@/components/guest-trade";
import { HowPricesWork } from "@/components/how-prices-work";
import { PriceChart } from "@/components/price-chart";
import { PulsePanel } from "@/components/pulse-star";
import { TradeSheet } from "@/components/trade-sheet";
import { TradeTicket } from "@/components/trade-ticket";
import { WatchButton } from "@/components/watch-button";
import { DayRange, LiveSpread } from "@/components/price-display";
import { LiveDot, Logo, Portrait, PriceText, roleLabel } from "@/components/visuals";
import { priceUpdateNotice } from "@/domain/indicative-price";
import { formatPaise } from "@/domain/money";
import { recordEvent } from "@/server/attribution";
import { getCurrentUser } from "@/server/current-user";
import { getFeatures } from "@/server/features";
import { currentIntent } from "@/server/intent-cookie";
import { prisma } from "@/server/prisma";
import { eventsForPlayer, getPlayer, portfolio, priceHistory, walletSummary } from "@/server/queries";

export const metadata = { title: "Player" };

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ side?: string; resume?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const user = await getCurrentUser();
  const player = await getPlayer(slug);
  if (!player) notFound();
  const [events, history, features] = await Promise.all([
    eventsForPlayer(player.id),
    priceHistory(player.id, "24H"),
    getFeatures(),
  ]);
  const wallet = user ? await walletSummary(user.id) : null;
  const book = user ? await portfolio(user.id) : null;
  const watch = user
    ? await prisma.playerWatch.findUnique({ where: { userId_playerId: { userId: user.id, playerId: player.id } }, select: { id: true } })
    : null;
  const holding = book?.positions.find((position) => position.playerId === player.id);
  const intent = user && query.resume === "1" ? await currentIntent() : null;
  const resume = intent?.type === "BUY" && intent.slug === player.slug ? intent : null;
  const currentPrice = resume?.side === "SELL" ? player.sellPaise : player.buyPaise;
  const priceNotice = resume ? priceUpdateNotice(resume.displayedIndicativePrice, currentPrice) : null;
  if (resume && user) {
    await recordEvent({ eventName: "buy_intent_resumed", dedupeKey: `buy-resume:${user.id}:${player.id}:${resume.displayedIndicativePrice}`, userId: user.id });
  }
  return (
    <main className="px-4 pt-4">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <Link href="/market" className="flex h-11 w-11 items-center justify-center rounded-full bg-card" aria-label="Back to market">
          ←
        </Link>
        <Logo wordmark={false} />
        <LiveDot live={player.live} stale={player.stale} playerId={player.id} />
      </header>
      <section className="mt-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="wrap-anywhere text-2xl font-bold leading-tight">{player.name}</h1>
          <p className="mt-1 text-xs text-muted">
            INDIA · {roleLabel(player.role).toUpperCase()}
            {player.jerseyNumber ? ` · #${player.jerseyNumber}` : ""}
          </p>
          <p className="num mt-3 text-[clamp(1.75rem,8vw,2.5rem)] font-bold leading-none">
            <PriceText playerId={player.id} field="mid" paise={player.midPaise} />
          </p>
          <p className="mt-1 text-sm">
            <PriceText playerId={player.id} field="change" changePaise={player.changePaise} changePercent={player.changePercent} />
            <span className="ml-1 text-muted">Today</span>
          </p>
          {user ? (
            <div className="mt-3">
              <WatchButton playerId={player.id} initial={Boolean(watch)} />
            </div>
          ) : null}
        </div>
        <Portrait name={player.name} seed={player.slug} className="h-44 w-36 shrink-0" />
      </section>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-center text-[11px]">
        <Stat label="24h High" value={formatPaise(player.highPaise)} />
        <Stat label="24h Low" value={formatPaise(player.lowPaise)} />
        <Stat label="24h Change" value={<PriceText playerId={player.id} field="change" changePaise={player.changePaise} changePercent={player.changePercent} />} />
        <Stat label="Total Traded" value={player.totalTradedLabel} />
      </dl>
      <DayRange playerId={player.id} lowPaise={player.lowPaise} highPaise={player.highPaise} midPaise={player.midPaise} />
      <div className="mt-4">
        <PriceChart playerId={player.id} initial={history.points} initialNote={history.note} />
      </div>
      {player.pulse ? (
        <PulsePanel
          playerId={player.id}
          state={player.pulse.state}
          activity={player.pulse.activity}
          feedLabel={player.pulse.feedLabel}
          previewPaise={player.pulse.previewPaise}
        />
      ) : null}
      <HowPricesWork />
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Stat label="Buy price" value={<PriceText playerId={player.id} field="buy" paise={player.buyPaise} />} />
        <Stat label="Sell price" value={<PriceText playerId={player.id} field="sell" paise={player.sellPaise} />} />
        <Stat label="Current spread" value={<LiveSpread playerId={player.id} buyPaise={player.buyPaise} sellPaise={player.sellPaise} />} />
        {wallet ? <Stat label="Your cash" value={formatPaise(wallet.cashPaise)} /> : null}
        {wallet ? <Stat label="Your bonus" value={formatPaise(wallet.bonusPaise)} /> : null}
        {user ? <Stat label="You hold" value={`${holding?.quantity ?? 0} Pulsers`} /> : null}
      </dl>
      <div className="mt-4">
        {features.liveTradingEnabled && user && wallet ? (
          <>
            {resume ? <ClearIntent /> : null}
            <TradeSheet playerId={player.id} buyPaise={player.buyPaise} sellPaise={player.sellPaise} initialOpen={Boolean(resume)}>
        <TradeTicket
          playerId={player.id}
          initialBuy={player.buyPaise}
          initialSell={player.sellPaise}
          initialMid={player.midPaise}
          cashPaise={wallet.cashPaise}
          bonusPaise={wallet.bonusPaise}
          holdings={holding?.quantity ?? 0}
          stale={player.stale}
          initialSide={resume?.side === "SELL" || query.side === "sell" ? "SELL" : "BUY"}
          initialQuantity={resume?.quantity}
          priceNotice={priceNotice}
        />
            </TradeSheet>
          </>
        ) : features.liveTradingEnabled ? (
          <GuestTrade playerId={player.id} slug={player.slug} buyPaise={player.buyPaise} sellPaise={player.sellPaise} />
        ) : (
          <div className="flex items-center gap-3 rounded-2xl bg-card p-4 text-sm">
            <BittuFigure pose="pause" className="h-16 w-auto shrink-0" />
            <p>Trading is temporarily unavailable. Positions and balances stay where they are.</p>
          </div>
        )}
      </div>
      <section className="mt-4 rounded-3xl bg-card p-4">
        <h2 className="font-semibold">Recent events</h2>
        <p className="text-xs text-muted">Latest feed event, when a live match is publishing one.</p>
        <p className="wrap-anywhere mt-2 text-sm" data-live-event={player.id}>{events[0]?.summary ?? ""}</p>
        {events.length === 0 ? <p className="mt-3 text-sm text-muted">No simulated events yet.</p> : null}
        <ul className="mt-3 space-y-3 text-sm">
          {events.map((event) => (
            <li key={event.id} className="flex gap-3">
              <span className="w-10 shrink-0 text-xs text-muted">{event.overLabel}</span>
              <span className="w-8 shrink-0 font-bold text-india">{event.kind}</span>
              <span className="wrap-anywhere min-w-0">{event.summary}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-4 rounded-3xl bg-card p-4">
        <h2 className="font-semibold">Why moving?</h2>
        <ul className="mt-2 space-y-2 text-sm text-muted">
          {player.why.map((line, index) => (
            <li key={line} data-live-why={index === 0 ? player.id : undefined}>{line}</li>
          ))}
        </ul>
      </section>
      <p className="mt-3 text-xs text-muted">
        Buy <PriceText playerId={player.id} field="buy" paise={player.buyPaise} /> · Sell <PriceText playerId={player.id} field="sell" paise={player.sellPaise} />. Spread is included in those quotes. <PriceText playerId={player.id} field="change" changePaise={player.changePaise} changePercent={player.changePercent} /> is the move across the recent window.
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card p-2">
      <dt className="text-muted">{label}</dt>
      <dd className="num wrap-anywhere mt-1 font-semibold">{value}</dd>
    </div>
  );
}
