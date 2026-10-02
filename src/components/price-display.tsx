"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { appendSparkline, formatExternalPrice, priceFlash, SPARKLINE_CAP, type ExternalQuote } from "@/domain/live-prices";
import { changePercent, formatPaise, formatPercent, formatSignedPaise } from "@/domain/money";
import { useExternalMarkets, useLivePlayer, usePriceStore } from "./price-stream";

export function PriceFlash({ value, children }: { value: number; children: ReactNode }) {
  const previous = useRef<number | null>(null);
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const next = priceFlash(previous.current, value);
    previous.current = value;
    if (next === "none" || reduced) return;
    setDirection(next);
    const timer = window.setTimeout(() => setDirection(null), 550);
    return () => window.clearTimeout(timer);
  }, [value, reduced]);

  const flash = direction === "up" ? "tick-up" : direction === "down" ? "tick-down" : "";
  return <span className={flash}>{children}</span>;
}

export function PriceText({
  playerId,
  field,
  paise,
  changePaise,
  changePercent: initialPercent,
}: {
  playerId: string;
  field: "mid" | "change" | "buy" | "sell";
  paise?: string;
  changePaise?: string;
  changePercent?: number;
}) {
  const live = useLivePlayer(playerId);
  const livePaise = field === "buy" ? live?.buyPaise : field === "sell" ? live?.sellPaise : live?.midPaise;
  const amount = field === "change" ? (live?.changePaise ?? changePaise ?? "0") : (livePaise ?? paise ?? "0");
  const percent = live?.changePercent ?? initialPercent ?? 0;
  const signed = live?.changePaise ?? changePaise ?? "0";
  const up = Number(signed) >= 0;
  const text = field === "change" ? `${formatSignedPaise(signed)} (${formatPercent(percent)})` : formatPaise(amount);
  return (
    <PriceFlash value={Number(amount)}>
      <span data-price-for={playerId} data-field={field} className={`num ${field === "change" ? (up ? "text-gain" : "text-loss") : ""}`}>
        {text}
      </span>
    </PriceFlash>
  );
}

export function Sparkline({ playerId, values, positive }: { playerId?: string; values: number[]; positive: boolean }) {
  const live = useLivePlayer(playerId);
  const [series, setSeries] = useState(values);
  const up = live ? Number(live.changePaise ?? "0") >= 0 : positive;
  useEffect(() => {
    if (!live?.midPaise) return;
    const next = Number(live.midPaise);
    setSeries((current) => appendSparkline(current, next, SPARKLINE_CAP));
  }, [live?.midPaise]);
  if (series.length < 2) return <div className="h-9" />;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const width = 120;
  const height = 36;
  const span = max - min || 1;
  const path = series
    .map((value, index) => {
      const x = (index / (series.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 6) - 3;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-full" aria-hidden>
      <path d={path} fill="none" stroke={up ? "#1ed760" : "#ff4d5e"} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function LiveSpread({ playerId, buyPaise, sellPaise }: { playerId: string; buyPaise: string; sellPaise: string }) {
  const live = useLivePlayer(playerId);
  const buy = BigInt(live?.buyPaise ?? buyPaise);
  const sell = BigInt(live?.sellPaise ?? sellPaise);
  return <PriceFlash value={Number(buy - sell)}>{formatPaise(buy - sell)}</PriceFlash>;
}

export function LivePortfolioTotals({
  positions,
}: {
  positions: { playerId: string; quantity: number; midPaise: string; costPaise: string }[];
}) {
  const quotes = usePriceStore().players;
  let value = 0n;
  let cost = 0n;
  for (const position of positions) {
    const mid = quotes.get(position.playerId)?.midPaise ?? position.midPaise;
    value += BigInt(mid) * BigInt(position.quantity);
    cost += BigInt(position.costPaise);
  }
  const pnl = value - cost;
  return (
    <>
      <p className="num text-3xl font-bold">
        <PriceFlash value={Number(value)}>{formatPaise(value)}</PriceFlash>
      </p>
      <p className={pnl >= 0n ? "text-gain" : "text-loss"}>Unrealized {formatSignedPaise(pnl)} versus average cost</p>
    </>
  );
}

export function LivePositionValue({
  playerId,
  quantity,
  midPaise,
  costPaise,
}: {
  playerId: string;
  quantity: number;
  midPaise: string;
  costPaise: string;
}) {
  const live = useLivePlayer(playerId);
  const mid = BigInt(live?.midPaise ?? midPaise);
  const current = mid * BigInt(quantity);
  const cost = BigInt(costPaise);
  const pnl = current - cost;
  const percent = changePercent(current, cost);
  const up = pnl >= 0n;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
      <p>
        <span className="block text-xs text-muted">Total value</span>
        <span className="num font-semibold">
          <PriceFlash value={Number(current)}>{formatPaise(current)}</PriceFlash>
        </span>
      </p>
      <p className={up ? "text-gain" : "text-loss"}>
        <span className="block text-xs text-muted">P&amp;L</span>
        <span className="num font-semibold">
          {formatSignedPaise(pnl)} ({formatPercent(percent)})
        </span>
      </p>
    </div>
  );
}

function PulseItem({ quote }: { quote: ExternalQuote }) {
  const up = (quote.changePercent ?? 0) >= 0;
  const direction = quote.changePercent === null ? "text-muted" : up ? "text-gain" : "text-loss";
  return (
    <span title={quote.source} className="inline-flex items-center gap-2 text-xs">
      <span className="font-semibold tracking-wide">{quote.label}</span>
      <PriceFlash value={quote.price ?? Number.NaN}>
        <span className="num font-semibold">{formatExternalPrice(quote)}</span>
      </PriceFlash>
      <span className={direction}>
        {quote.changePercent === null ? "—" : `${up ? "▲" : "▼"} ${formatPercent(quote.changePercent)}`}
      </span>
    </span>
  );
}

export function MarketPulse() {
  const markets = useExternalMarkets();
  const quotes = markets.length > 0 ? markets : PLACEHOLDER;
  return (
    <section aria-label="Global market pulse" className="mt-3 rounded-2xl border border-line bg-card px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted">GLOBAL MARKET PULSE</h2>
        <p className="text-[10px] text-muted">External reference</p>
      </div>
      <div className="marquee-window mt-2 overflow-hidden">
        <div className="market-marquee items-center">
          <div className="flex items-center gap-8 pr-8">
            {quotes.map((quote) => (
              <PulseItem key={quote.symbol} quote={quote} />
            ))}
          </div>
          <div className="flex items-center gap-8 pr-8" aria-hidden>
            {quotes.map((quote) => (
              <PulseItem key={`${quote.symbol}-copy`} quote={quote} />
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted">USD, Bitcoin, Ether, and Gold do not set PlayerPulser player prices.</p>
    </section>
  );
}

const PLACEHOLDER: ExternalQuote[] = [
  { symbol: "USD/INR", label: "USD/INR", price: null, changePercent: null, currency: "INR" as const, source: "ECB via Frankfurter · daily snapshot", cadence: "snapshot" as const, updatedAt: null },
  { symbol: "BTC/USD", label: "BTC/USD", price: null, changePercent: null, currency: "USD" as const, source: "Kraken ticker", cadence: "live" as const, updatedAt: null },
  { symbol: "ETH/USD", label: "ETH/USD", price: null, changePercent: null, currency: "USD" as const, source: "Kraken ticker", cadence: "live" as const, updatedAt: null },
  { symbol: "GOLD", label: "GOLD", price: null, changePercent: null, currency: "USD" as const, source: "Gold spot snapshot", cadence: "snapshot" as const, updatedAt: null },
];
