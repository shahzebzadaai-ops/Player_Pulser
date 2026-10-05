"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { currentIndicativePaise } from "@/domain/indicative-price";
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
  const [message, setMessage] = useState<string | null>(null);

  async function continueAuth(nextSide: "BUY" | "SELL") {
    const quoted = nextSide === "BUY" ? buy : sell;
    if (!quoted) return;
    setMessage(null);
    const response = await fetch("/api/auth/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "BUY",
        playerId,
        slug,
        quantity: 1,
        side: nextSide,
        displayedIndicativePrice: quoted,
      }),
    });
    if (!response.ok) {
      setMessage("We could not save that trade. Try again.");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("auth", "signup");
    router.push(`${window.location.pathname}?${params.toString()}`);
  }

  return (
    <>
      <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 grid grid-cols-2 gap-3">
        <button type="button" className="btn-primary press w-full flex-col" disabled={!buy} onClick={() => void continueAuth("BUY")}>
          Buy
          <span className="block whitespace-normal text-xs font-medium leading-tight">{buy ? <>@ <PriceFlash value={Number(buy)}>{formatPaise(buy)}</PriceFlash></> : "Loading current price…"}</span>
        </button>
        <button type="button" className="btn-sell press w-full flex-col" disabled={!sell} onClick={() => void continueAuth("SELL")}>
          Sell
          <span className="block whitespace-normal text-xs font-medium leading-tight">{sell ? <>@ <PriceFlash value={Number(sell)}>{formatPaise(sell)}</PriceFlash></> : "Loading current price…"}</span>
        </button>
      </div>
      {message ? <p className="mt-2 text-sm text-loss" aria-live="polite">{message}</p> : null}
    </>
  );
}

export function GuestBuyLink({
  playerId,
  slug,
  side,
  price,
  className,
  children,
}: {
  playerId: string;
  slug: string;
  side: "BUY" | "SELL";
  price: string;
  className: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void (async () => {
          if (/^\d+$/.test(price) && BigInt(price) > 0n) {
            await fetch("/api/auth/intent", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                type: "BUY",
                playerId,
                slug,
                quantity: 1,
                side,
                displayedIndicativePrice: price,
              }),
            });
          }
          router.push(`/players/${slug}?auth=signup`);
        })();
      }}
    >
      {children}
    </button>
  );
}
