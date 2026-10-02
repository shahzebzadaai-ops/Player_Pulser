import { useId } from "react";
import { formatPaise, formatPercent, formatSignedPaise } from "@/domain/money";
import { playerArtworkAlt, playerArtworkSrc } from "@/domain/player-artwork";
import { PlayerArt } from "./player-art";

export function roleLabel(role: string): string {
  if (role === "ALL_ROUNDER") return "All-rounder";
  if (role === "WICKET_KEEPER") return "Wicket-keeper";
  if (role === "BOWLER") return "Bowler";
  return "Batter";
}

export function Logo({ wordmark = true }: { wordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight">
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#2f7bff" />
        <path d="M8.5 7.5h9.2a6.2 6.2 0 0 1 0 12.4H13v4.6H8.5V7.5zm4.5 3.6v5.2h4.4a2.6 2.6 0 0 0 0-5.2H13z" fill="white" />
        <path d="M19 23.5c2.2.8 4.2.4 6.2-1.6" stroke="#7dffb4" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      {wordmark ? (
        <span>
          Player<span className="text-india">Pulser</span>
        </span>
      ) : null}
    </span>
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
  return <PlayerArt src={src} alt={playerArtworkAlt(alt ?? name)} className={`${className} rounded-2xl`} fallback={fallback} />;
}

export function LiveDot({ live, playerId }: { live: boolean; playerId?: string }) {
  return (
    <span data-live-dot={playerId} className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-electric">
      <span className={`live-dot ${live ? "is-live" : "bg-muted"}`} />
      <span data-live-dot-label>{live ? "LIVE" : "QUOTED"}</span>
    </span>
  );
}

export function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) return <div className="h-9" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = 120;
  const height = 36;
  const span = max - min || 1;
  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 6) - 3;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-full" aria-hidden>
      <path d={path} fill="none" stroke={positive ? "#1ed760" : "#ff4d5e"} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function PriceText({
  playerId,
  field,
  paise,
  changePaise,
  changePercent,
}: {
  playerId: string;
  field: "mid" | "change" | "buy" | "sell";
  paise?: string;
  changePaise?: string;
  changePercent?: number;
}) {
  const up = Number(changePaise ?? "0") >= 0;
  const text =
    field === "change"
      ? `${formatSignedPaise(changePaise ?? "0")} (${formatPercent(changePercent ?? 0)})`
      : formatPaise(paise ?? "0");
  return (
    <span
      data-price-for={playerId}
      data-field={field}
      className={`num ${field === "change" ? (up ? "text-gain" : "text-loss") : ""}`}
    >
      {text}
    </span>
  );
}
