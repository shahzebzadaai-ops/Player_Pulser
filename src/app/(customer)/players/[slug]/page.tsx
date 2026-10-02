import Link from "next/link";
import { notFound } from "next/navigation";
import { HowPricesWork } from "@/components/how-prices-work";
import { PriceChart } from "@/components/price-chart";
import { PulsePanel } from "@/components/pulse-star";
import { TradeSheet } from "@/components/trade-sheet";
import { TradeTicket } from "@/components/trade-ticket";
import { WatchButton } from "@/components/watch-button";
import { LiveDot, Logo, Portrait, PriceText, roleLabel } from "@/components/visuals";
import { formatPaise, formatPercent, formatSignedPaise } from "@/domain/money";
import { getCurrentUser } from "@/server/current-user";
import { getFeatures } from "@/server/features";
import { prisma } from "@/server/prisma";
import { eventsForPlayer, getPlayer, portfolio, priceHistory, walletSummary } from "@/server/queries";

export const metadata = { title: "Player" };

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ side?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const user = await getCurrentUser();
  if (!user) return null;
  const player = await getPlayer(slug);
  if (!player) notFound();
  const [wallet, book, events, history, features, watch] = await Promise.all([
    walletSummary(user.id),
    portfolio(user.id),
    eventsForPlayer(player.id),
    priceHistory(player.id, "24H"),
    getFeatures(),
    prisma.playerWatch.findUnique({ where: { userId_playerId: { userId: user.id, playerId: player.id } }, select: { id: true } }),
  ]);
  const holding = book.positions.find((position) => position.playerId === player.id);
  const up = Number(player.changePaise) >= 0;
  const spreadPaise = BigInt(player.buyPaise) - BigInt(player.sellPaise);

  return (
    <main className="px-4 pt-4">
      <header className="flex items-center justify-between">
        <Link href="/market" className="flex h-11 w-11 items-center justify-center rounded-full bg-card" aria-label="Back to market">
          ←
        </Link>
        <Logo wordmark={false} />
        <LiveDot live={player.live} playerId={player.id} />
      </header>
      <section className="mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#12386f] to-card p-4">
        <div className="flex gap-3">
          <Portrait name={player.name} seed={player.slug} className="h-40 w-32" />
          <div className="min-w-0 flex-1 rounded-2xl bg-pitch/70 p-3">
            <p className="text-xs text-muted">Player price</p>
            <p className="num text-3xl font-bold">
              <PriceText playerId={player.id} field="mid" paise={player.midPaise} />
            </p>
            <p className={`text-sm ${up ? "text-gain" : "text-loss"}`}>
              <PriceText playerId={player.id} field="change" changePaise={player.changePaise} changePercent={player.changePercent} />
            </p>
            <p className="text-xs text-muted">{up ? "Higher across the recent window" : "Lower across the recent window"} · Simulated inputs</p>
          </div>
        </div>
        <h1 className="mt-3 text-3xl font-bold uppercase leading-none">{player.name}</h1>
        <p className="mt-1 text-xs text-muted">
          INDIA · {roleLabel(player.role).toUpperCase()}
          {player.jerseyNumber ? ` · #${player.jerseyNumber}` : ""}
        </p>
        <div className="mt-3">
          <WatchButton playerId={player.id} initial={Boolean(watch)} />
        </div>
      </section>
      <dl className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px]">
        <Stat label="Window high" value={formatPaise(player.highPaise)} />
        <Stat label="Window low" value={formatPaise(player.lowPaise)} />
        <Stat label="24h change" value={formatPercent(player.changePercent)} />
        <Stat label="Total traded" value={player.totalTradedLabel} />
      </dl>
      <div className="mt-4">
        <PriceChart playerId={player.id} initial={history.points} />
        {history.note ? <p className="mt-2 text-xs text-muted">{history.note}</p> : null}
        <p className="mt-2 text-xs text-muted">The chart shows the quoted price.</p>
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
        <Stat label="Buy price" value={formatPaise(player.buyPaise)} />
        <Stat label="Sell price" value={formatPaise(player.sellPaise)} />
        <Stat label="Current spread" value={formatPaise(spreadPaise)} />
        <Stat label="Your cash" value={formatPaise(wallet.cashPaise)} />
        <Stat label="Your bonus" value={formatPaise(wallet.bonusPaise)} />
        <Stat label="You hold" value={`${holding?.quantity ?? 0} Pulsers`} />
      </dl>
      <div className="mt-4">
        {features.liveTradingEnabled ? (
        <TradeSheet buyPaise={player.buyPaise} sellPaise={player.sellPaise}>
        <TradeTicket
          playerId={player.id}
          initialBuy={player.buyPaise}
          initialSell={player.sellPaise}
          initialMid={player.midPaise}
          cashPaise={wallet.cashPaise}
          bonusPaise={wallet.bonusPaise}
          holdings={holding?.quantity ?? 0}
          stale={player.stale}
          initialSide={query.side === "sell" ? "SELL" : "BUY"}
        />
        </TradeSheet>
        ) : (
          <p className="rounded-2xl bg-card p-4 text-sm">Trading is temporarily unavailable.</p>
        )}
      </div>
      <section className="mt-4 rounded-3xl bg-card p-4">
        <h2 className="font-semibold">Recent events</h2>
        <p className="text-xs text-muted">Latest feed event, when a live match is publishing one.</p>
        <p className="mt-2 text-sm" data-live-event={player.id}>{events[0]?.summary ?? ""}</p>
        {events.length === 0 ? <p className="mt-3 text-sm text-muted">No simulated events yet.</p> : null}
        <ul className="mt-3 space-y-3 text-sm">
          {events.map((event) => (
            <li key={event.id} className="flex gap-3">
              <span className="w-10 shrink-0 text-xs text-muted">{event.overLabel}</span>
              <span className="w-8 shrink-0 font-bold text-india">{event.kind}</span>
              <span>{event.summary}</span>
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
        Buy {formatPaise(player.buyPaise)} · Sell {formatPaise(player.sellPaise)}. Spread is included in those quotes. {formatSignedPaise(player.changePaise)} is the move across the recent window.
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-2">
      <dt className="text-muted">{label}</dt>
      <dd className="num mt-1 font-semibold">{value}</dd>
    </div>
  );
}
