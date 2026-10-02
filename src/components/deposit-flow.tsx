"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CUSTOMER_MIN_DEPOSIT_PAISE, DEPOSIT_CHOICES_PAISE } from "@/domain/growth";
import { formatPaise } from "@/domain/money";
import { pushMarketing } from "./marketing-layer";

type Stage = "amount" | "method" | "verifying" | "success" | "failed";

export function DepositFlow({ cashPaise, bonusPaise }: { cashPaise: string; bonusPaise: string }) {
  const [choice, setChoice] = useState<string>("");
  const [custom, setCustom] = useState("");
  const [category, setCategory] = useState<"BANKING" | "CRYPTO" | null>(null);
  const [stage, setStage] = useState<Stage>("amount");
  const [message, setMessage] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/analytics/funnel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventName: "DEPOSIT_PAGE_VIEWED", dedupeKey: `deposit-view:${new Date().toISOString().slice(0, 10)}` }),
    });
    pushMarketing("DEPOSIT_PAGE_VIEWED", {});
  }, []);

  const selected = choice === "custom" ? custom : choice;

  async function pay() {
    const rupees = Number(selected);
    const paise = BigInt(Math.round(rupees * 100));
    if (!Number.isFinite(rupees) || paise < CUSTOMER_MIN_DEPOSIT_PAISE) {
      setMessage("The minimum deposit is ₹500.");
      return;
    }
    setMessage(null);
    setStage("verifying");
    const method = category === "CRYPTO" ? "CRYPTO" : "UPI";
    const response = await fetch("/api/wallet/deposit", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ amountPaise: paise.toString(), method }),
    });
    const body = (await response.json()) as { error?: { message: string }; paymentId?: string; status?: string; amountPaise?: string };
    if (!response.ok || !body.paymentId) {
      setStage("failed");
      setMessage(body.error?.message ?? "The payment was not started.");
      return;
    }
    setPaymentId(body.paymentId);
    setAdded(body.amountPaise ?? paise.toString());
    await confirm(body.paymentId);
  }

  async function confirm(id: string) {
    const response = await fetch(`/api/payments/${id}`);
    const body = (await response.json()) as { display?: string; status?: string; amountPaise?: string; creditedByReturn?: boolean };
    if (body.creditedByReturn) {
      setStage("verifying");
      return;
    }
    if (body.display === "SUCCESS" && body.status === "SETTLED") {
      setAdded(body.amountPaise ?? added);
      setStage("success");
      return;
    }
    if (body.status === "FAILED" || body.status === "CANCELLED" || body.status === "EXPIRED") {
      setStage("failed");
      setMessage(body.status);
      return;
    }
    setStage("verifying");
  }

  if (stage === "success") {
    return (
      <section className="mt-4 rounded-3xl border border-line bg-card p-4">
        <h2 className="text-2xl font-bold">Deposit successful</h2>
        <p className="mt-2 text-sm">{formatPaise(added ?? "0")} added to your Cash Wallet</p>
        <div className="mt-4 grid gap-2">
          <Link href="/market" className="flex min-h-12 items-center justify-center rounded-full bg-india font-semibold">TRADE NOW</Link>
          <Link href="/wallet" className="flex min-h-12 items-center justify-center rounded-full border border-line">VIEW WALLET</Link>
        </div>
      </section>
    );
  }

  if (stage === "verifying") {
    return (
      <section className="mt-4 rounded-3xl border border-line bg-card p-4">
        <h2 className="text-xl font-bold">Payment received. We&apos;re confirming it.</h2>
        <p className="mt-2 text-sm text-muted">Status: VERIFYING</p>
        <p className="mt-2 text-sm text-muted">You can leave this page. Confirmation continues on the server.</p>
        {paymentId ? (
          <button type="button" className="mt-4 min-h-12 w-full rounded-full border border-line" onClick={() => confirm(paymentId)}>
            Check again
          </button>
        ) : null}
      </section>
    );
  }

  if (stage === "failed") {
    return (
      <section className="mt-4 rounded-3xl border border-line bg-card p-4">
        <h2 className="text-xl font-bold">{message ?? "FAILED"}</h2>
        <button type="button" className="mt-4 min-h-12 w-full rounded-full bg-india font-semibold" onClick={() => { setStage("amount"); setPaymentId(null); }}>
          TRY AGAIN
        </button>
      </section>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <section className="grid grid-cols-2 gap-3">
        <p className="rounded-2xl border border-line bg-card p-3 text-sm">Cash Wallet<span className="mt-1 block text-lg font-bold">{formatPaise(cashPaise)}</span></p>
        <p className="rounded-2xl border border-gold/40 bg-card p-3 text-sm">Bonus Wallet<span className="mt-1 block text-lg font-bold text-gold">{formatPaise(bonusPaise)}</span></p>
      </section>
      <p className="text-sm">₹200 Welcome Bonus is already yours.</p>
      <p className="text-sm text-muted">No separate deposit bonus.</p>
      <p className="text-xs text-muted">Minimum deposit {formatPaise(CUSTOMER_MIN_DEPOSIT_PAISE)}</p>
      {stage === "amount" ? (
        <section className="grid grid-cols-2 gap-2">
          {DEPOSIT_CHOICES_PAISE.map((paise) => {
            const rupees = (Number(paise) / 100).toString();
            return (
              <button key={rupees} type="button" className={`min-h-12 rounded-2xl border ${choice === rupees ? "border-india bg-india/20" : "border-line bg-card"}`} onClick={() => setChoice(rupees)}>
                {formatPaise(paise)}
              </button>
            );
          })}
          <button type="button" className={`min-h-12 rounded-2xl border ${choice === "custom" ? "border-india bg-india/20" : "border-line bg-card"}`} onClick={() => setChoice("custom")}>
            Custom Amount
          </button>
          {choice === "custom" ? (
            <label className="col-span-2 text-sm">
              Amount in rupees
              <input className="mt-1 min-h-12 w-full rounded-2xl border border-line bg-pitch px-3" inputMode="decimal" value={custom} onChange={(event) => setCustom(event.target.value)} />
            </label>
          ) : null}
          <button type="button" className="col-span-2 min-h-12 rounded-full bg-india font-semibold" disabled={!selected} onClick={() => setStage("method")}>
            CONTINUE TO PAYMENT
          </button>
        </section>
      ) : (
        <section className="space-y-2">
          <button type="button" className={`min-h-12 w-full rounded-2xl border ${category === "BANKING" ? "border-india" : "border-line"}`} onClick={() => { setCategory("BANKING"); void fetch("/api/analytics/funnel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventName: "PAYMENT_METHOD_SELECTED", dedupeKey: `method:banking:${new Date().toISOString().slice(0, 10)}` }) }); pushMarketing("PAYMENT_METHOD_SELECTED", { category: "BANKING" }); }}>
            BANKING
          </button>
          <button type="button" className={`min-h-12 w-full rounded-2xl border ${category === "CRYPTO" ? "border-india" : "border-line"}`} onClick={() => { setCategory("CRYPTO"); void fetch("/api/analytics/funnel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventName: "PAYMENT_METHOD_SELECTED", dedupeKey: `method:crypto:${new Date().toISOString().slice(0, 10)}` }) }); pushMarketing("PAYMENT_METHOD_SELECTED", { category: "CRYPTO" }); }}>
            CRYPTO
          </button>
          <p className="text-xs text-muted">We use security controls to protect your account and personal information.</p>
          <button type="button" className="min-h-12 w-full rounded-full bg-india font-semibold" disabled={!category} onClick={pay}>
            Pay {selected ? `₹${selected}` : ""}
          </button>
        </section>
      )}
      {message ? <p role="alert" className="text-sm text-loss">{message}</p> : null}
    </div>
  );
}
