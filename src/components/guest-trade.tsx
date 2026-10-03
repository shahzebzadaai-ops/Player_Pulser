"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { currentIndicativePaise, guestTradeTotalPaise } from "@/domain/indicative-price";
import { formatPaise } from "@/domain/money";
import { PriceFlash } from "./price-display";
import { useLivePlayer } from "./price-stream";

export function GuestTrade({
  playerId,
  slug,
  buyPaise,
  sellPaise,
}: {
  playerId: string;
  slug: string;
  buyPaise: string;
  sellPaise: string;
}) {
  const router = useRouter();
  const live = useLivePlayer(playerId);
  const buy = currentIndicativePaise(live?.buyPaise, buyPaise);
  const sell = currentIndicativePaise(live?.sellPaise, sellPaise);
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const price = side === "BUY" ? buy : sell;
  const total = guestTradeTotalPaise(price, quantity);

  async function continueAuth() {
    if (!price) return;
    setMessage(null);
    const response = await fetch("/api/auth/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "BUY",
        playerId,
        slug,
        quantity,
        side,
        displayedIndicativePrice: price,
      }),
    });
    if (!response.ok) {
      setMessage("We could not save that quantity. Try again.");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("auth", "signup");
    router.push(`${window.location.pathname}?${params.toString()}`);
  }

  return (
    <>
      <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 grid grid-cols-2 gap-3">
        <button type="button" className="btn-primary press w-full flex-col" disabled={!buy} onClick={() => { setSide("BUY"); setOpen(true); }}>
          Buy
          <span className="block whitespace-normal text-xs font-medium leading-tight">{buy ? <>@ <PriceFlash value={Number(buy)}>{formatPaise(buy)}</PriceFlash></> : "Loading current price…"}</span>
        </button>
        <button type="button" className="btn-sell press w-full flex-col" disabled={!sell} onClick={() => { setSide("SELL"); setOpen(true); }}>
          Sell
          <span className="block whitespace-normal text-xs font-medium leading-tight">{sell ? <>@ <PriceFlash value={Number(sell)}>{formatPaise(sell)}</PriceFlash></> : "Loading current price…"}</span>
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-pitch/70" role="dialog" aria-label="Trade preview">
          <div className="w-full max-w-[430px] overflow-x-hidden rounded-t-3xl bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <p className="text-lg font-bold">{side === "BUY" ? "Buy" : "Sell"} preview</p>
            <p className="mt-1 text-sm text-muted">Indicative total. The live price is confirmed after you join.</p>
            <label className="mt-4 block text-sm">
              Quantity
              <input
                className="mt-1 min-h-11 w-full rounded-2xl bg-pitch px-3"
                type="number"
                min={1}
                max={100}
                value={quantity}
                onChange={(event) => setQuantity(Math.min(100, Math.max(1, Number(event.target.value) || 1)))}
              />
            </label>
            <p className="mt-3 text-sm">{total ? `Indicative total ${formatPaise(total)}` : "Loading current price…"}</p>
            <p className="mt-2 min-h-5 text-sm text-loss" aria-live="polite">{message}</p>
            <button type="button" className="btn-primary mt-3 w-full whitespace-nowrap" disabled={!price} onClick={() => void continueAuth()}>Continue</button>
            <button type="button" className="btn-secondary mt-2 w-full" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
