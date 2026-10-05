import { PlayerEditor } from "@/components/admin-controls";
import { formatPaise } from "@/domain/money";
import { engineModeSummary } from "@/domain/pricing-engine";
import { assertPagePermission } from "@/server/guard";
import { pricingBoard } from "@/server/pricing";

export const metadata = { title: "Price control" };

export default async function PriceControlPage() {
  await assertPagePermission("player.edit");
  const board = await pricingBoard();
  return (
    <main>
      <h2 className="text-2xl font-bold">Price control</h2>
      <p className="mt-1 text-sm text-muted">
        Pricing engine mode: {engineModeSummary(board.engineMode)} Target weights performance {board.weights.performance}, demand {board.weights.demand}, news {board.weights.news}. A mid-price override appends a tick, asks for a reason, and leaves earlier ticks in place.
      </p>
      <ul className="mt-4 space-y-3">
        {board.players.map((player) => (
          <li key={player.id} className="rounded-2xl border border-line bg-card p-3 text-sm">
            <p className="font-semibold">{player.name}</p>
            <p className="mt-1 text-muted">
              Mid {formatPaise(player.midPaise)} · Buy {formatPaise(player.buyPaise)} · Sell {formatPaise(player.sellPaise)} · Spread {(player.spreadPpm / 10_000).toFixed(2)}%
            </p>
            <p className="text-muted">
              Base {formatPaise(player.basePaise)} · Match anchor {formatPaise(player.anchorPaise)}
            </p>
            <p className="text-muted">
              Performance {player.performanceBps} bps · Demand {player.demandBps} bps · News {player.newsBps} bps · Match total {player.matchPerformanceBps} bps · {player.capStatus}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {player.events.length === 0 ? <li>No structured events yet.</li> : null}
              {player.events.map((event) => <li key={event}>{event}</li>)}
            </ul>
            <PlayerEditor playerId={player.id} tradable={player.tradable} live={player.live} midPaise={player.midPaise.toString()} />
          </li>
        ))}
      </ul>
    </main>
  );
}
