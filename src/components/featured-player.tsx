"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PriceText, Sparkline } from "./price-display";
import { LiveDot, Portrait } from "./visuals";

export type FeaturedPick = {
  id: string;
  slug: string;
  name: string;
  midPaise: string;
  changePaise: string;
  changePercent: number;
  live: boolean;
  stale?: boolean;
  history: number[];
  reason?: string;
};

export function FeaturedPlayerHero({
  players,
  tradeHref,
  signedIn = false,
}: {
  players: FeaturedPick[];
  tradeHref: "account" | "player";
  signedIn?: boolean;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);
  const count = players.length;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (count < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % count), 6_000);
    return () => window.clearInterval(timer);
  }, [count]);

  const player = players[index];
  if (!player) return null;
  const buy = signedIn && tradeHref === "player" ? `/players/${player.slug}?side=buy#trade` : signedIn ? "/home" : "";
  const sell = signedIn && tradeHref === "player" ? `/players/${player.slug}?side=sell#trade` : signedIn ? "/home" : "";
  const profile = `/players/${player.slug}`;

  async function guestTrade(side: "BUY" | "SELL") {
    if (/^\d+$/.test(player.midPaise) && BigInt(player.midPaise) > 0n) {
      await fetch("/api/auth/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "BUY",
          playerId: player.id,
          slug: player.slug,
          quantity: 1,
          side,
          displayedIndicativePrice: player.midPaise,
        }),
      });
    }
    router.push(`/players/${player.slug}?auth=signup`);
  }

  return (
    <article className={`py-1 ${reduced ? "" : "hero-fade"}`} key={player.id} aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted">{player.reason ?? "Trending"}</p>
          <h2 className="wrap-anywhere mt-1 text-xl font-bold leading-tight">
            <Link href={profile}>{player.name}</Link>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <LiveDot live={player.live} stale={player.stale} playerId={player.id} />
          <Portrait name={player.name} seed={player.slug} className="h-14 w-12" />
        </div>
      </div>
      <p className="num mt-3 text-4xl font-bold leading-none">
        <PriceText playerId={player.id} field="mid" paise={player.midPaise} />
      </p>
      <p className="mt-1 text-sm">
        <PriceText playerId={player.id} field="change" changePaise={player.changePaise} changePercent={player.changePercent} />
      </p>
      <Sparkline playerId={player.id} values={player.history} positive={Number(player.changePaise) >= 0} className="mt-3 h-24 w-full" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        {signedIn ? (
          <>
            <Link href={buy} className="btn-primary w-full">BUY</Link>
            <Link href={sell} className="btn-sell w-full">SELL</Link>
          </>
        ) : (
          <>
            <button type="button" className="btn-primary w-full" onClick={() => void guestTrade("BUY")}>BUY</button>
            <button type="button" className="btn-sell w-full" onClick={() => void guestTrade("SELL")}>SELL</button>
          </>
        )}
      </div>
    </article>
  );
}
