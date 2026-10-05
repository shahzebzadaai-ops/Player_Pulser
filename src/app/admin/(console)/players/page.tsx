import { PlayerEditor } from "@/components/admin-controls";
import { Portrait, roleLabel } from "@/components/visuals";
import { formatPaise } from "@/domain/money";
import { assertPagePermission } from "@/server/guard";
import { listPlayers } from "@/server/queries";

export const metadata = { title: "Admin players" };

export default async function AdminPlayersPage() {
  await assertPagePermission("player.view");
  const market = await listPlayers();
  return (
    <main>
      <h2 className="text-2xl font-bold">Players and pricing</h2>
      <p className="mt-1 text-sm text-muted">Leaving a player out of a simulated live list does not make them untradable. Tradable is a separate switch. Price edits append a tick. They do not erase history.</p>
      <ul className="mt-4 space-y-3">
        {market.players.map((player) => (
          <li key={player.id} className="rounded-2xl border border-line bg-card p-3">
            <div className="flex gap-3">
              <Portrait name={player.name} seed={player.slug} className="h-16 w-14" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {player.name} · {roleLabel(player.role)} · {formatPaise(player.midPaise)}
                </p>
                <PlayerEditor playerId={player.id} tradable={player.tradable} live={player.live} midPaise={player.midPaise} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
