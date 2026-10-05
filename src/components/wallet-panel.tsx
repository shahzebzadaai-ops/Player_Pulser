"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatPaise } from "@/domain/money";
import { BittuFigure } from "./bittu-figure";

export function WalletPanel({
  cashPaise,
  withdrawal,
  depositsEnabled = true,
  withdrawalsEnabled = true,
}: {
  cashPaise: string;
  withdrawal: { allowed: boolean; message: string; standardPaise?: string; remainderPaise?: string };
  depositsEnabled?: boolean;
  withdrawalsEnabled?: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("500");
  const [method, setMethod] = useState<"UPI" | "BANK">("UPI");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function deposit(event: React.FormEvent) {
    event.preventDefault();
    if (!navigator.onLine) {
      setMessage("Deposits need a working connection.");
      return;
    }
    const paise = BigInt(Math.round(Number(amount) * 100));
    if (!Number.isFinite(Number(amount)) || paise < 50_000n) {
      setMessage("The minimum deposit is ₹500.");
      return;
    }
    setPending(true);
    const response = await fetch("/api/wallet/deposit", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ amountPaise: paise.toString(), method }),
    });
    const body = (await response.json()) as { error?: { message: string }; status?: string };
    setPending(false);
    setMessage(response.ok ? `Deposit ${body.status === "SETTLED" ? "settled" : "recorded"} through the simulator.` : body.error?.message ?? "Deposit failed.");
    if (response.ok) router.refresh();
  }

  async function withdraw() {
    if (!navigator.onLine) {
      setMessage("Withdrawals need a working connection.");
      return;
    }
    setPending(true);
    const response = await fetch("/api/wallet/withdraw", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({}),
    });
    const body = (await response.json()) as { error?: { message: string }; remainderPaise?: string };
    setPending(false);
    setMessage(
      response.ok
        ? `Withdrawal submitted. ${formatPaise(body.remainderPaise ?? "0")} stays in your cash balance.`
        : body.error?.message ?? "Withdrawal was not accepted.",
    );
    if (response.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      {depositsEnabled ? <form onSubmit={deposit} className="rounded-3xl border border-line bg-card p-4">
        <h2 className="font-semibold">Add cash</h2>
        <p className="mt-1 text-xs text-muted">Minimum deposit is ₹500. The ₹200 Welcome Bonus is not paid again on deposit.</p>
        <div className="mt-3 flex gap-2">
          <button type="button" className={`min-h-11 flex-1 rounded-xl ${method === "UPI" ? "bg-india" : "bg-pitch"}`} onClick={() => setMethod("UPI")}>
            UPI
          </button>
          <button type="button" className={`min-h-11 flex-1 rounded-xl ${method === "BANK" ? "bg-india" : "bg-pitch"}`} onClick={() => setMethod("BANK")}>
            Bank
          </button>
        </div>
        <label className="mt-3 block text-sm">
          Amount in rupees
          <input className="mt-1 min-h-12 w-full rounded-2xl border border-line bg-pitch px-3" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <button disabled={pending} className="btn-primary mt-3 w-full">
          Deposit
        </button>
      </form> : (
        <div className="flex items-center gap-3 rounded-3xl border border-line bg-card p-4 text-sm">
          <BittuFigure pose="pause" className="h-14 w-auto shrink-0" />
          <p>Deposits are temporarily unavailable.</p>
        </div>
      )}
      <section className="rounded-3xl border border-line bg-card p-4">
        <h2 className="font-semibold">Withdraw</h2>
        <p className="mt-1 text-sm text-muted">{withdrawal.message}</p>
        {withdrawal.allowed && withdrawal.standardPaise ? (
          <p className="mt-2 text-sm">
            Standard selection: <strong className="num">{formatPaise(withdrawal.standardPaise)}</strong> of {formatPaise(cashPaise)}. The remaining{" "}
            <strong className="num">{formatPaise(withdrawal.remainderPaise ?? "0")}</strong> stays yours in the wallet. It is not a fee.
          </p>
        ) : (
          <p className="mt-2 text-sm">Taking the last of a balance below ₹500 is an open business decision, so this button stays off.</p>
        )}
        {withdrawalsEnabled ? (
          <button type="button" disabled={pending || !withdrawal.allowed} onClick={withdraw} className="btn-secondary mt-3 w-full">
            Withdraw 95%
          </button>
        ) : (
          <div className="mt-3 flex items-center gap-3 text-sm">
            <BittuFigure pose="pause" className="h-14 w-auto shrink-0" />
            <p>Withdrawals are temporarily unavailable.</p>
          </div>
        )}
      </section>
      {message ? (
        <div role="status" className="flex items-start gap-2 text-sm">
          <BittuFigure pose={/^(Deposit (settled|recorded)|Withdrawal submitted)/.test(message) ? "thumbsUp" : "shrug"} className="h-12 w-auto shrink-0" />
          <p>{message}</p>
        </div>
      ) : null}
    </div>
  );
}
