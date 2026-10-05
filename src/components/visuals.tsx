import Link from "next/link";
import { useId } from "react";
import { CUSTOMER_LOGO_HREF } from "@/domain/auth-flags";
import { playerArtworkAlt, playerArtworkSrc } from "@/domain/player-artwork";
import { PlayerArt } from "./player-art";

export { PriceText, Sparkline } from "./price-display";

export function roleLabel(role: string): string {
  if (role === "ALL_ROUNDER") return "All-rounder";
  if (role === "WICKET_KEEPER") return "Wicket-keeper";
  if (role === "BOWLER") return "Bowler";
  return "Batter";
}

export function Logo({ href = CUSTOMER_LOGO_HREF }: { wordmark?: boolean; href?: string | null }) {
  const mark = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/playerpulser-logo.png"
      alt={href ? "" : "PlayerPulser"}
      width={1024}
      height={512}
      decoding="async"
      className="logo-mark"
    />
  );
  if (!href) return <span className="logo-lockup">{mark}</span>;
  return (
    <Link href={href} aria-label="PlayerPulser home" className="logo-lockup">
      {mark}
    </Link>
  );
}

export function Portrait({
  name,
  seed,
  className = "h-14 w-14",
  alt,
}: {
  name: string;
  seed: string;
  className?: string;
  alt?: string;
}) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const hue = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 36;
  const id = useId();
  const fallback = (
    <svg viewBox="0 0 80 80" className={`${className} shrink-0 rounded-2xl`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${205 + hue} 85% 46%)`} />
          <stop offset="100%" stopColor={`hsl(${222 + hue} 70% 16%)`} />
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="18" fill={`url(#${id})`} />
      <circle cx="40" cy="34" r="13" fill="#f3d3b4" />
      <path d="M20 36c1-16 12-22 20-22s19 6 20 22c-6-6-34-6-40 0z" fill="#10284f" />
      <path d="M16 78c6-18 16-26 24-26s18 8 24 26" fill="#163e8c" />
      <text x="40" y="18" textAnchor="middle" fontSize="9" fill="#d6e6ff" fontFamily="sans-serif">
        {initials}
      </text>
    </svg>
  );
  const src = playerArtworkSrc(seed);
  if (!src) return fallback;
  return <PlayerArt src={src} alt={playerArtworkAlt(alt ?? name)} className={className} fallback={fallback} />;
}

export function LiveDot({ live, stale = false, playerId }: { live: boolean; stale?: boolean; playerId?: string }) {
  const word = stale ? "DELAYED" : live ? "LIVE" : "QUOTED";
  return (
    <span data-live-dot={playerId} className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-electric">
      <span className={`live-dot ${word === "LIVE" ? "is-live" : "bg-muted"}`} />
      <span data-live-dot-label>{word}</span>
    </span>
  );
}

