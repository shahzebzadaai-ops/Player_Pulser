"use client";

import Link from "next/link";
import { memo, useEffect, useState } from "react";
import { rankMovers, shouldRefreshRanking } from "@/domain/live-prices";
import type { PlayerView } from "@/server/queries";
import { PriceText, Sparkline } from "./price-display";
import { readPriceStore, subscribePriceStore } from "./price-stream";
import { Portrait } from "./visuals";

export const MarketRow = memo(function MarketRow({ player }: { player: PlayerView }) {
  const up = Number(player.changePaise) >= 0;
  return (
    <Link href={`/players/${player.slug}`} className="flex min-w-0 items-center gap-3 border-b border-line/70 py-3">
      <Portrait name={player.name} seed={player.slug} className="h-[4.75rem] w-[4.25rem] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{player.name}</p>
        <p className="num text-sm font-semibold">
          <PriceText playerId={player.id} field="mid" paise={player.midPaise} />
        </p>
        <p className="text-xs">
          <PriceText playerId={player.id} field="change" changePaise={player.changePaise} changePercent={player.changePercent} />
        </p>
      </div>
      <Sparkline playerId={player.id} values={player.history} positive={up} className="h-10 w-24 shrink-0" />
    </Link>
  );
});

export function LiveMarketList({
  players,
  mode,
  limit,
}: {
  players: PlayerView[];
  mode: "movers" | "all";
  limit?: number;
}) {
  const [rows, setRows] = useState(players);

  useEffect(() => {
    if (mode !== "movers") return;
    let last = 0;
    const refresh = () => {
      const now = Date.now();
      if (last !== 0 && !shouldRefreshRanking(last, now)) return;
      last = now;
      const current = readPriceStore().players;
      const ranked = rankMovers(
        players.map((player) => {
          const live = current.get(player.id);
          return live?.changePercent === undefined ? player : { ...player, changePercent: live.changePercent, changePaise: live.changePaise ?? player.changePaise };
        }),
      );
      setRows(limit ? ranked.slice(0, limit) : ranked);
    };
    refresh();
    return subscribePriceStore(refresh);
  }, [players, mode, limit]);

  const visible = mode === "all" ? (limit ? players.slice(0, limit) : players) : rows;
  if (visible.length === 0) return <p className="py-3 text-sm text-muted">No players in this list yet.</p>;
  return (
    <div>
      {visible.map((player) => (
        <MarketRow key={player.id} player={player} />
      ))}
    </div>
  );
}
