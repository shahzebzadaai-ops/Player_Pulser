import Link from "next/link";
import { LiveDot, Portrait, Sparkline } from "@/components/visuals";
import { formatPaise, formatPercent, formatSignedPaise } from "@/domain/money";
import { getCurrentUser } from "@/server/current-user";
import { portfolio } from "@/server/queries";

export const metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const book = await portfolio(user.id);
  const value = book.positions.reduce((sum, position) => sum + BigInt(position.currentPaise), 0n);
  const pnl = book.positions.reduce((sum, position) => sum + BigInt(position.pnlPaise), 0n);

  return (
    <main className="px-4 pt-4">
      <h1 className="text-2xl font-bold">Pulsers portfolio</h1>
      <section className="mt-4 rounded-3xl bg-card p-4">
        <p className="text-sm text-muted">Current value</p>
        <p className="num text-3xl font-bold">{formatPaise(value)}</p>
        <p className={pnl >= 0n ? "text-gain" : "text-loss"}>Unrealized {formatSignedPaise(pnl)} versus average cost</p>
      </section>
      {book.positions.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-card p-4 text-sm text-muted">
          You do not hold any Pulsers. <Link className="text-india" href="/market">Open the market</Link>
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {book.positions.map((position) => {
            const up = Number(position.pnlPaise) >= 0;
            return (
              <li key={position.playerId} className="rounded-3xl border border-line bg-card p-3">
                <div className="flex gap-3">
                  <Portrait name={position.name} seed={position.slug} className="h-20 w-16" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-semibold">{position.name}</p>
                      <LiveDot live={position.live} />
                    </div>
                    <p className="text-xs text-muted">{position.quantity} Pulsers · avg {formatPaise(position.averagePaise)}</p>
                    <p className="num text-sm">Now {formatPaise(position.midPaise)}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <p><span className="block text-xs text-muted">Total value</span><span className="num font-semibold">{formatPaise(position.currentPaise)}</span></p>
                  <p className={up ? "text-gain" : "text-loss"}><span className="block text-xs text-muted">P&amp;L</span><span className="num font-semibold">{formatSignedPaise(position.pnlPaise)} ({formatPercent(position.pnlPercent)})</span></p>
                </div>
                <Sparkline values={position.history} positive={up} />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Link href={`/players/${position.slug}?side=buy`} className="press flex min-h-11 items-center justify-center rounded-xl bg-gain text-sm font-bold text-pitch">Buy more</Link>
                  <Link href={`/players/${position.slug}?side=sell`} className="press flex min-h-11 items-center justify-center rounded-xl bg-loss text-sm font-bold text-white">Sell</Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <section className="mt-6">
        <h2 className="font-semibold">Individual trades</h2>
        {book.trades.length === 0 ? <p className="mt-2 text-sm text-muted">Trades will show here after you buy or sell.</p> : null}
        <ul className="mt-2 space-y-2 text-sm">
          {book.trades.map((trade) => (
            <li key={trade.id} className="flex justify-between rounded-xl bg-card px-3 py-3">
              <span>
                {trade.side} {trade.quantity} {trade.playerName}
              </span>
              <span className="num">{formatPaise(trade.unitPaise)}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
