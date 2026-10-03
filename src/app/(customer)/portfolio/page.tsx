import Link from "next/link";
import { LivePortfolioTotals, LivePositionValue } from "@/components/price-display";
import { LiveDot, Portrait, PriceText, Sparkline } from "@/components/visuals";
import { formatPaise } from "@/domain/money";
import { requireCustomer } from "@/server/page-access";
import { portfolio } from "@/server/queries";

export const metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const user = await requireCustomer({ type: "PORTFOLIO" });
  const book = await portfolio(user.id);
  return (
    <main className="px-4 pt-4">
      <h1 className="text-2xl font-bold">Pulsers portfolio</h1>
      <section className="mt-4 rounded-3xl bg-card p-4">
        <p className="text-sm text-muted">Current value</p>
        <LivePortfolioTotals positions={book.positions} />
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
                      <p className="wrap-anywhere font-semibold">{position.name}</p>
                      <LiveDot live={position.live} />
                    </div>
                    <p className="text-xs text-muted">{position.quantity} Pulsers · avg {formatPaise(position.averagePaise)}</p>
                    <p className="num text-sm">Now <PriceText playerId={position.playerId} field="mid" paise={position.midPaise} /></p>
                  </div>
                </div>
                <LivePositionValue playerId={position.playerId} quantity={position.quantity} midPaise={position.midPaise} costPaise={position.costPaise} />
                <Sparkline playerId={position.playerId} values={position.history} positive={up} />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Link href={`/players/${position.slug}?side=buy`} className="btn-primary press w-full text-sm">Buy more</Link>
                  <Link href={`/players/${position.slug}?side=sell`} className="btn-sell press w-full text-sm">Sell</Link>
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
            <li key={trade.id} className="flex min-w-0 items-start justify-between gap-3 rounded-xl bg-card px-3 py-3">
              <span className="wrap-anywhere min-w-0">
                {trade.side} {trade.quantity} {trade.playerName}
              </span>
              <span className="num shrink-0">{formatPaise(trade.unitPaise)}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
