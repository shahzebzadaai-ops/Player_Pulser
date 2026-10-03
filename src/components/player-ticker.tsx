"use client";

import { useState } from "react";
import { LiveDot, PriceText } from "./visuals";

export function PlayerTicker({
  players,
}: {
  players: { id: string; shortName: string; live: boolean; midPaise: string; changePaise: string; changePercent: number }[];
}) {
  const [paused, setPaused] = useState(false);
  if (players.length === 0) return null;
  const row = (copy: string) =>
    players.map((player) => (
      <span key={`${player.id}-${copy}`} className="inline-flex items-center gap-2">
        <LiveDot live={player.live} playerId={copy === "a" ? player.id : undefined} />
        <span className="font-medium">{player.shortName}</span>
        <PriceText playerId={player.id} field="mid" paise={player.midPaise} />
        <PriceText playerId={player.id} field="change" changePaise={player.changePaise} changePercent={player.changePercent} />
      </span>
    ));
  return (
    <div
      className="marquee-window mt-3 overflow-hidden rounded-2xl border border-line bg-card py-3"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
      onPointerCancel={() => setPaused(false)}
    >
      <div className="player-marquee text-xs" style={{ animationPlayState: paused ? "paused" : "running" }}>
        <div className="flex items-center gap-16 pr-16">{row("a")}</div>
        <div className="flex items-center gap-16 pr-16" aria-hidden>
          {row("b")}
        </div>
      </div>
    </div>
  );
}
