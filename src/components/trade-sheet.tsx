"use client";

import { useState } from "react";
import { formatPaise } from "@/domain/money";
import { PriceFlash } from "./price-display";
import { useLivePlayer } from "./price-stream";

export function TradeSheet({
  playerId,
  buyPaise,
  sellPaise,
  children,
}: {
  playerId: string;
  buyPaise: string;
  sellPaise: string;
  children: React.ReactNode;
}) {
  const live = useLivePlayer(playerId);
  const buy = live?.buyPaise ?? buyPaise;
  const sell = live?.sellPaise ?? sellPaise;
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 grid grid-cols-2 gap-3">
        <button type="button" className="btn-primary press w-full flex-col" onClick={() => setOpen(true)}>
          Buy
          <span className="block text-xs font-medium">@ <PriceFlash value={Number(buy)}>{formatPaise(buy)}</PriceFlash></span>
        </button>
        <button type="button" className="btn-sell press w-full flex-col" onClick={() => setOpen(true)}>
          Sell
          <span className="block text-xs font-medium">@ <PriceFlash value={Number(sell)}>{formatPaise(sell)}</PriceFlash></span>
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Trade">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close trade sheet" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[min(86dvh,calc(100dvh-env(safe-area-inset-top)))] w-full max-w-[430px] flex-col overflow-hidden rounded-t-3xl border border-line bg-pitch pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-line" />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">{children}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
