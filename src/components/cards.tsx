import Link from "next/link";
import type { PlayerView } from "@/server/queries";
import { GuestBuyLink } from "./guest-trade";
import { PulseStar } from "./pulse-star";
import { LiveDot, Portrait, PriceText, Sparkline, roleLabel } from "./visuals";

export function LiveCard({ player, className = "w-[220px] shrink-0", guest = false }: { player: PlayerView; className?: string; guest?: boolean }) {
  const up = Number(player.changePaise) >= 0;
  return (
    <article className={`${className} rounded-2xl border border-line bg-card p-3`}>
      <div className="flex items-center gap-2">
        <Portrait name={player.name} seed={player.slug} className="h-16 w-14" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <h3 className="wrap-anywhere text-sm font-semibold">{player.name}</h3>
            <LiveDot live={player.live} />
          </div>
          <p className="num text-lg font-bold">
            <PriceText playerId={player.id} field="mid" paise={player.midPaise} />
          </p>
          <p className="text-xs">
            <PriceText playerId={player.id} field="change" changePaise={player.changePaise} changePercent={player.changePercent} />
          </p>
        </div>
      </div>
      {player.pulse ? (
        <p className="mt-1 flex min-w-0 flex-wrap items-center gap-1 text-[11px] text-muted">
          <PulseStar playerId={player.id} state={player.pulse.state} />
          <span className="sr-only">Market Pulse</span>
          <span className="truncate">{player.pulse.activity}</span>
          <span className="rounded-full bg-pitch px-1.5 py-0.5 text-[10px] font-semibold text-india">Showcase</span>
        </p>
      ) : null}
      <Sparkline playerId={player.id} values={player.history} positive={up} />
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {guest ? (
          <>
            <GuestBuyLink playerId={player.id} slug={player.slug} side="BUY" price={player.buyPaise} className="btn-primary press w-full text-xs">BUY</GuestBuyLink>
            <GuestBuyLink playerId={player.id} slug={player.slug} side="SELL" price={player.sellPaise} className="btn-sell press w-full text-xs">SELL</GuestBuyLink>
          </>
        ) : (
          <>
            <Link href={`/players/${player.slug}?side=buy#trade`} className="btn-primary press w-full text-xs">BUY</Link>
            <Link href={`/players/${player.slug}?side=sell#trade`} className="btn-sell press w-full text-xs">SELL</Link>
          </>
        )}
      </div>
    </article>
  );
}

export function MoverCard({ player }: { player: PlayerView }) {
  const up = Number(player.changePaise) >= 0;
  return (
    <Link href={`/players/${player.slug}`} className="flex w-[196px] shrink-0 items-center gap-2 rounded-2xl border border-line bg-card p-3">
      <Portrait name={player.name} alt={player.name} seed={player.slug} className="h-16 w-14" />
      <span className="min-w-0 flex-1">
        <p className="wrap-anywhere text-sm font-semibold">{player.shortName}</p>
        <p className="num text-sm font-semibold">
          <PriceText playerId={player.id} field="mid" paise={player.midPaise} />
        </p>
        <p className="text-xs">
          <PriceText playerId={player.id} field="change" changePaise={player.changePaise} changePercent={player.changePercent} />
        </p>
        <Sparkline playerId={player.id} values={player.history} positive={up} />
      </span>
    </Link>
  );
}

export function SectionHead({ title, href }: { title: string; href: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-lg font-semibold">{title}</h2>
      <Link href={href} className="text-sm text-india">
        See all
      </Link>
    </div>
  );
}

export function Notice() {
  return (
    <p className="rounded-xl bg-card px-3 py-2 text-xs text-muted">
      Development prices for recognisable Indian players. This is not a verified current squad and not a live exchange.
    </p>
  );
}

export { roleLabel };
