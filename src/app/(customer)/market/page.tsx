import Link from "next/link";
import { BannerSlot } from "@/components/banner-slot";
import { LiveCard, MoverCard, Notice, SectionHead } from "@/components/cards";
import { roleLabel } from "@/components/visuals";
import { listPlayers } from "@/server/queries";

export const metadata = { title: "Market" };

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; live?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const market = await listPlayers();
  const query = (params.q ?? "").trim().toLowerCase();
  let players = market.players.filter((player) => {
    const matchesQuery = !query || `${player.name} ${player.shortName}`.toLowerCase().includes(query);
    const matchesRole = !params.role || player.role === params.role;
    const matchesLive = params.live !== "1" || player.live;
    return matchesQuery && matchesRole && matchesLive;
  });
  if (params.sort === "movers") players = [...players].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  if (params.sort === "price") players = [...players].sort((a, b) => Number(b.midPaise) - Number(a.midPaise));
  if (params.sort === "gainers") players = [...players].sort((a, b) => b.changePercent - a.changePercent);
  if (params.sort === "losers") players = [...players].sort((a, b) => a.changePercent - b.changePercent);

  const roles = ["BATTER", "BOWLER", "ALL_ROUNDER", "WICKET_KEEPER"];

  return (
    <main className="px-4 pt-4">
      <h1 className="text-2xl font-bold">Market</h1>
      <BannerSlot placement="MARKET" />
      <form className="mt-3 space-y-3" action="/market">
        <label className="block text-sm">
          Search players
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Kohli, Bumrah, Gill"
            className="mt-1 min-h-12 w-full rounded-2xl border border-line bg-card px-3"
          />
        </label>
        <div className="flex gap-2 overflow-x-auto text-sm">
          <Link href="/market" className={`min-h-11 shrink-0 rounded-full px-3 py-2 ${!params.role && params.live !== "1" ? "bg-india" : "bg-card"}`}>
            All
          </Link>
          <Link href="/market?live=1" className={`min-h-11 shrink-0 rounded-full px-3 py-2 ${params.live === "1" ? "bg-india" : "bg-card"}`}>
            Live
          </Link>
          {roles.map((role) => (
            <Link key={role} href={`/market?role=${role}`} className={`min-h-11 shrink-0 rounded-full px-3 py-2 ${params.role === role ? "bg-india" : "bg-card"}`}>
              {roleLabel(role)}
            </Link>
          ))}
        </div>
        <label className="block text-sm">
          Sort
          <select name="sort" defaultValue={params.sort ?? ""} className="mt-1 min-h-12 w-full rounded-2xl border border-line bg-card px-3">
            <option value="">Name</option>
            <option value="movers">Top movers</option>
            <option value="gainers">Gainers</option>
            <option value="losers">Losers</option>
            <option value="price">Price</option>
          </select>
        </label>
        <button className="min-h-11 rounded-full bg-india px-4 text-sm font-semibold" type="submit">
          Apply
        </button>
      </form>
      <div className="mt-4 space-y-5">
        <Notice />
        <section>
          <SectionHead title="Live now" href="/market?live=1" />
          <div className="snap-row">{market.players.filter((player) => player.live).slice(0, 8).map((player) => <LiveCard key={player.id} player={player} />)}</div>
        </section>
        <section>
          <SectionHead title="Top gainers" href="/market?sort=gainers" />
          <div className="snap-row">{[...market.players].sort((a, b) => b.changePercent - a.changePercent).slice(0, 8).map((player) => <MoverCard key={player.id} player={player} />)}</div>
        </section>
        <section>
          <SectionHead title="Top losers" href="/market?sort=losers" />
          <div className="snap-row">{[...market.players].sort((a, b) => a.changePercent - b.changePercent).slice(0, 8).map((player) => <MoverCard key={player.id} player={player} />)}</div>
        </section>
        <section>
          <SectionHead title="Trending" href="/market?sort=movers" />
          <div className="snap-row">{[...market.players].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, 8).map((player) => <MoverCard key={player.id} player={player} />)}</div>
        </section>
        <section>
          <SectionHead title="Upcoming" href="/market" />
          <p className="mb-2 text-xs text-muted">Players not in a live simulated match. This is not a fixture list.</p>
          <div className="snap-row">{market.players.filter((player) => !player.live).slice(0, 8).map((player) => <MoverCard key={player.id} player={player} />)}</div>
        </section>
      </div>
      <h2 className="mt-6 text-lg font-semibold">All players</h2>
      {players.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-card p-4 text-sm text-muted">No players match that search. Try another name or clear the filters.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {players.map((player) => (
            <LiveCard key={player.id} player={player} className="w-full" />
          ))}
        </div>
      )}
    </main>
  );
}
