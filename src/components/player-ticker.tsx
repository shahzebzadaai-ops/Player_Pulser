"use client";

import { useEffect, useRef } from "react";
import { LiveDot, PriceText } from "./visuals";

export function PlayerTicker({
  players,
}: {
  players: { id: string; shortName: string; live: boolean; midPaise: string; changePaise: string; changePercent: number }[];
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      node.scrollBy({ left: event.key === "ArrowRight" ? 96 : -96, behavior: "smooth" });
    };
    node.addEventListener("keydown", onKey);
    return () => node.removeEventListener("keydown", onKey);
  }, []);
  if (players.length === 0) return null;
  const row = (copy: string) =>
    players.map((player) => (
      <span key={`${player.id}-${copy}`} className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
        <LiveDot live={player.live} playerId={copy === "a" ? player.id : undefined} />
        <span className="font-medium">{player.shortName}</span>
        <PriceText playerId={player.id} field="mid" paise={player.midPaise} />
        <PriceText playerId={player.id} field="change" changePaise={player.changePaise} changePercent={player.changePercent} />
      </span>
    ));
  return (
    <div
      ref={scroller}
      className="marquee-window mt-3 rounded-2xl border border-line bg-card py-3"
      tabIndex={0}
      role="region"
      aria-label="Player prices. Use arrow keys to scroll."
    >
      <div className="player-marquee text-xs">
        <div className="ticker-group gap-16 pr-16">{row("a")}</div>
        <div className="ticker-group gap-16 pr-16" aria-hidden>
          {row("b")}
        </div>
      </div>
    </div>
  );
}
