"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPaise } from "@/domain/money";
import { resolveBuyFunding } from "@/domain/rules";

type Side = "BUY" | "SELL";

export function TradeTicket({
  playerId,
  initialBuy,
  initialSell,
  initialMid,
  cashPaise,
  bonusPaise,
  holdings,
  stale,
  initialSide,
}: {
  playerId: string;
  initialBuy: string;
  initialSell: string;
  initialMid: string;
  cashPaise: string;
  bonusPaise: string;
  holdings: number;
  stale: boolean;
  initialSide: Side;
}) {
  const router = useRouter();
  const [side, setSide] = useState<Side>(initialSide);
  const [quantity, setQuantity] = useState(1);
  const [useBonus, setUseBonus] = useState(true);
  const [buy, setBuy] = useState(initialBuy);
  const [sell, setSell] = useState(initialSell);
  const [mid, setMid] = useState(initialMid);
  const [seenMid, setSeenMid] = useState(initialMid);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ current: string; seen: string } | null>(null);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    const onPrices = (event: Event) => {
      const detail = (event as CustomEvent<{ players: { id: string; buyPaise: string; sellPaise: string; midPaise: string }[] }>).detail;
      const player = detail?.players?.find((item) => item.id === playerId);
      if (!player) return;
      setBuy(player.buyPaise);
      setSell(player.sellPaise);
      setMid(player.midPaise);
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("pp-prices", onPrices);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("pp-prices", onPrices);
    };
  }, [playerId]);

    const unit = BigInt(side === "BUY" ? buy : sell);
  const notional = unit * BigInt(quantity);
  const funding =
    side === "BUY"
      ? resolveBuyFunding({
          notionalPaise: notional,
          requestedBonusPaise: useBonus ? null : 0n,
          cashAvailablePaise: BigInt(cashPaise),
          bonusAvailablePaise: BigInt(bonusPaise),
          minCashPortionBps: 5000,
        })
      : null;

  async function submit(nextSide: Side, confirmPriceChange: boolean) {
    setSide(nextSide);
    if (offline) {
      setMessage("Trading needs a working connection. Nothing was sent.");
      return;
    }
    setPending(true);
    setMessage(null);
    const key = crypto.randomUUID();
    try {
      const quoteResponse = await fetch("/api/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerId,
          side: nextSide,
          quantity,
          requestedBonusPaise: nextSide === "BUY" && useBonus ? null : "0",
          seenMidPaise: confirmPriceChange ? (confirm?.current ?? mid) : mid,
          confirmPriceChange,
        }),
      });
      const quoteBody = (await quoteResponse.json()) as {
        quoteId?: string;
        error?: { code: string; message: string; details?: { currentMidPaise?: string } | null };
      };
      if (quoteResponse.status === 409 && quoteBody.error?.code === "PRICE_CHANGED") {
        setConfirm({ current: quoteBody.error.details?.currentMidPaise ?? mid, seen: seenMid });
        setPending(false);
        return;
      }
      if (!quoteResponse.ok || !quoteBody.quoteId) {
        setMessage(quoteBody.error?.message ?? "The quote was not accepted.");
        setPending(false);
        return;
      }
      const tradeResponse = await fetch("/api/trades", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify({ quoteId: quoteBody.quoteId }),
      });
      const tradeBody = (await tradeResponse.json()) as { error?: { message: string } };
      if (!tradeResponse.ok) {
        setMessage(tradeBody.error?.message ?? "The trade was not completed. No holding was changed.");
        setPending(false);
        return;
      }
      setSeenMid(mid);
      setConfirm(null);
      setMessage(nextSide === "BUY" ? "Buy completed." : "Sale completed.");
      router.refresh();
    } catch {
      setMessage("The connection failed before a result came back. If you retry, use a fresh confirmation. A repeated key will not duplicate a completed trade.");
    } finally {
      setPending(false);
    }
  }

  const blocked = stale || offline || pending || (side === "SELL" && holdings < 1) || (side === "BUY" && funding !== null && !funding.ok);

  return (
    <section id="trade" className="rounded-3xl border border-line bg-card p-4">
      <div className="mb-3 flex gap-6 border-b border-line text-sm">
        <span className="border-b-2 border-india pb-2 font-semibold">Trade</span>
        <span className="pb-2 text-muted">Market depth is simulated</span>
      </div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Choose position amount</h2>
        <button type="button" className="text-sm text-india" onClick={() => setQuantity(1)}>
          Clear
        </button>
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-pitch px-3 py-2">
        <button type="button" className="h-11 w-11 rounded-xl bg-card-2 text-2xl" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Decrease quantity">
          −
        </button>
        <div className="text-center">
          <p className="num text-3xl font-semibold">{formatPaise(notional)}</p>
          <p className="text-xs text-muted">
            {quantity} Pulser{quantity === 1 ? "" : "s"} at {formatPaise(unit)}
          </p>
        </div>
        <button type="button" className="h-11 w-11 rounded-xl bg-card-2 text-2xl" onClick={() => setQuantity((value) => value + 1)} aria-label="Increase quantity">
          +
        </button>
      </div>
      {side === "BUY" ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <FundingBox label="Cash used" amount={funding?.ok ? funding.value.cashPaise.toString() : "0"} hint={`Balance ${formatPaise(cashPaise)}`} />
          <FundingBox label="Bonus used" amount={funding?.ok ? funding.value.bonusPaise.toString() : "0"} hint={`Balance ${formatPaise(bonusPaise)}`} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">You hold {holdings} Pulsers. A sale can use part of that holding.</p>
      )}
      {side === "BUY" ? (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={useBonus} onChange={(event) => setUseBonus(event.target.checked)} />
          Use bonus, up to half the buy
        </label>
      ) : null}
      <p className="mt-2 text-xs text-muted">Bonus cannot be used alone. At least 50% cash is required. The quote expires in 15 seconds.</p>
      {message ? (
        <p role="alert" className="mt-3 text-sm text-ink">
          {message}
        </p>
      ) : null}
      {confirm ? (
        <div className="relative z-30 mt-3 rounded-2xl bg-pitch p-3 text-sm" role="alert">
          <p>The price moved from {formatPaise(confirm.seen)} to {formatPaise(confirm.current)}.</p>
          <button type="button" className="mt-2 min-h-11 rounded-xl bg-india px-4 font-semibold" onClick={() => submit(side, true)}>
            Confirm new price
          </button>
        </div>
      ) : null}
      <div className="sticky bottom-24 z-30 mt-4 grid grid-cols-2 gap-3">
        <button type="button" disabled={blocked} onClick={() => void submit("BUY", false)} className="min-h-12 rounded-2xl bg-gain font-bold text-pitch disabled:opacity-40">
          BUY
          <span className="block text-xs font-medium">@ {formatPaise(buy)}</span>
        </button>
        <button type="button" disabled={stale || offline || pending || holdings < quantity} onClick={() => void submit("SELL", false)} className="min-h-12 rounded-2xl bg-loss font-bold text-white disabled:opacity-40">
          SELL
          <span className="block text-xs font-medium">@ {formatPaise(sell)}</span>
        </button>
      </div>
    </section>
  );
}

function FundingBox({ label, amount, hint }: { label: string; amount: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-pitch p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="num text-lg font-semibold">{formatPaise(amount)}</p>
      <p className="text-[11px] text-muted">{hint}</p>
    </div>
  );
}
