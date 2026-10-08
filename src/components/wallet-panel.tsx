"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPaise } from "@/domain/money";
import { BittuFigure } from "./bittu-figure";

type WithdrawMethod = "UPI" | "BANK" | "WALLET";

function paiseToRupeesInput(paise: string): string {
  const value = /^\d+$/.test(paise) ? BigInt(paise) : 0n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return `${value / 100n}.${fraction}`;
}

function rupeesToPaise(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [rupees, fraction = ""] = trimmed.split(".");
  return BigInt(rupees) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function askBittu() {
  window.dispatchEvent(new Event("pp-ask-bittu"));
}

export function WalletPanel({
  cashPaise,
  withdrawal,
  depositsEnabled = true,
  withdrawalsEnabled = true,
}: {
  cashPaise: string;
  withdrawal: { allowed: boolean; message: string; availablePaise: string };
  depositsEnabled?: boolean;
  withdrawalsEnabled?: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("500");
  const [method, setMethod] = useState<"UPI" | "BANK">("UPI");
  const [withdrawAmount, setWithdrawAmount] = useState(() => paiseToRupeesInput(cashPaise));
  const [withdrawMethod, setWithdrawMethod] = useState<WithdrawMethod>("UPI");
  const [destination, setDestination] = useState("");
  const [note, setNote] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setWithdrawAmount(paiseToRupeesInput(cashPaise));
  }, [cashPaise]);

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

  async function withdraw(event: React.FormEvent) {
    event.preventDefault();
    if (!navigator.onLine) {
      setMessage("Withdrawals need a working connection.");
      return;
    }
    const paise = rupeesToPaise(withdrawAmount);
    const available = BigInt(withdrawal.availablePaise);
    if (paise === null || paise <= 0n) {
      setMessage("Enter an amount greater than zero, with up to two decimal places.");
      return;
    }
    if (paise > available) {
      setMessage("That amount is more than your available balance.");
      return;
    }
    const details = destination.trim();
    if (details.length < 3) {
      setMessage("Enter the account, UPI ID, or wallet details for this withdrawal.");
      return;
    }
    setPending(true);
    const response = await fetch("/api/wallet/withdraw", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({
        amountPaise: paise.toString(),
        method: withdrawMethod,
        destination: details,
        note: note.trim() || undefined,
      }),
    });
    const body = (await response.json()) as { error?: { message: string }; status?: string; reviewStatus?: string };
    setPending(false);
    setMessage(
      response.ok
        ? body.status === "PENDING" || body.reviewStatus === "PENDING_REVIEW"
          ? "Withdrawal request submitted. Status: pending review. Our team will process it."
          : "Withdrawal request submitted."
        : body.error?.message ?? "Withdrawal was not accepted.",
    );
    if (response.ok) {
      setDestination("");
      setNote("");
      setFormOpen(false);
      router.refresh();
    }
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
      <section className="rounded-3xl bg-gradient-to-br from-[#16448f] via-[#12366f] to-card p-4">
        <div className="flex items-start gap-3">
          <BittuFigure pose="present" className="h-16 w-auto shrink-0" />
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Withdraw your 100% funds</h2>
            <p className="mt-1 text-sm">You can request withdrawal of your full available balance anytime.</p>
            <button type="button" className="mt-2 text-left text-xs text-muted" onClick={askBittu}>
              Having a problem with withdrawal? Ask Bittu.
            </button>
          </div>
        </div>
      </section>
      <section className="rounded-3xl border border-line bg-card/80 p-4 backdrop-blur">
        <h2 className="font-semibold">Withdraw Funds</h2>
        <p className="mt-1 text-sm">{withdrawal.message}</p>
        <p className="mt-1 text-sm text-muted">Submit a withdrawal request and our team will process it.</p>
        {withdrawal.allowed ? (
          <p className="mt-2 text-sm">
            Available now: <strong className="num">{formatPaise(withdrawal.availablePaise)}</strong>
          </p>
        ) : (
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-pitch p-3 text-sm">
            <BittuFigure pose="shrug" className="h-14 w-auto shrink-0" />
            <p>Your withdrawable cash balance is empty. Add cash or sell Pulsers, then you can request the full available balance.</p>
          </div>
        )}
        {withdrawalsEnabled && withdrawal.allowed ? (
          formOpen ? (
            <form onSubmit={withdraw} className="mt-3 space-y-3">
              <label className="block text-sm">
                Amount in rupees
                <input
                  className="mt-1 min-h-12 w-full rounded-2xl border border-line bg-pitch px-3"
                  inputMode="decimal"
                  value={withdrawAmount}
                  onChange={(event) => setWithdrawAmount(event.target.value)}
                />
              </label>
              <button type="button" className="btn-secondary min-h-11 w-full text-sm" onClick={() => setWithdrawAmount(paiseToRupeesInput(withdrawal.availablePaise))}>
                Use full balance
              </button>
              <div className="grid grid-cols-3 gap-2">
                {(["UPI", "BANK", "WALLET"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`min-h-11 rounded-xl text-sm ${withdrawMethod === item ? "bg-india" : "bg-pitch"}`}
                    onClick={() => setWithdrawMethod(item)}
                  >
                    {item === "BANK" ? "Bank" : item === "WALLET" ? "Wallet" : "UPI"}
                  </button>
                ))}
              </div>
              <label className="block text-sm">
                {withdrawMethod === "UPI" ? "UPI ID" : withdrawMethod === "BANK" ? "Account number and IFSC" : "Wallet address"}
                <input
                  className="mt-1 min-h-12 w-full rounded-2xl border border-line bg-pitch px-3"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm">
                Note, optional
                <textarea
                  className="mt-1 min-h-24 w-full rounded-2xl border border-line bg-pitch px-3 py-2"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={280}
                />
              </label>
              <button disabled={pending} className="btn-primary min-h-12 w-full">
                Submit request
              </button>
            </form>
          ) : (
            <button type="button" className="btn-primary mt-3 min-h-12 w-full" onClick={() => setFormOpen(true)}>
              Create Withdrawal Request
            </button>
          )
        ) : withdrawalsEnabled ? null : (
          <div className="mt-3 flex items-center gap-3 text-sm">
            <BittuFigure pose="pause" className="h-14 w-auto shrink-0" />
            <p>Withdrawals are temporarily unavailable.</p>
          </div>
        )}
        <button type="button" className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-pitch p-3 text-left" onClick={askBittu}>
          <BittuFigure pose="launcher" className="h-12 w-12 shrink-0" />
          <span className="text-sm">Ask Bittu if you need help with withdrawal</span>
        </button>
      </section>
      {message ? (
        <div role="status" className="flex items-start gap-2 text-sm">
          <BittuFigure pose={/^(Deposit (settled|recorded)|Withdrawal request submitted)/.test(message) ? "thumbsUp" : "shrug"} className="h-12 w-auto shrink-0" />
          <p>{message}</p>
        </div>
      ) : null}
    </div>
  );
}
