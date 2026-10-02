"use client";

import { useState } from "react";
import { formatPaise } from "@/domain/money";

export function TradeSheet({
  buyPaise,
  sellPaise,
  children,
}: {
  buyPaise: string;
  sellPaise: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="sticky bottom-24 z-30 grid grid-cols-2 gap-3">
        <button type="button" className="press min-h-12 rounded-2xl bg-gain font-bold text-pitch" onClick={() => setOpen(true)}>
          Buy
          <span className="block text-xs font-medium">@ {formatPaise(buyPaise)}</span>
        </button>
        <button type="button" className="press min-h-12 rounded-2xl bg-loss font-bold text-white" onClick={() => setOpen(true)}>
          Sell
          <span className="block text-xs font-medium">@ {formatPaise(sellPaise)}</span>
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Trade">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close trade sheet" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[86dvh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl border border-line bg-pitch p-4 pb-8">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line" />
            {children}
          </div>
        </div>
      ) : null}
    </>
  );
}
