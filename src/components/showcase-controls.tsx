"use client";

import { useState } from "react";

export function ShowcaseHistoryControls() {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<"generate" | "reset" | null>(null);

  async function run(action: "generate" | "reset") {
    setPending(action);
    setMessage("");
    try {
      const response = await fetch("/api/admin/showcase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const body = (await response.json()) as { error?: { message?: string }; ticks?: number; players?: number; removed?: number };
      if (!response.ok) {
        setMessage(body.error?.message ?? "The showcase action did not complete.");
        return;
      }
      setMessage(action === "generate" ? `Wrote ${body.ticks ?? 0} ticks for ${body.players ?? 0} players.` : `Removed ${body.removed ?? 0} showcase ticks.`);
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="mt-6 rounded-xl bg-card p-4">
      <h3 className="font-semibold">Showcase history</h3>
      <p className="mt-1 text-sm text-muted">Writes price history only. It does not create users, wallets, deposits, trades, or bonuses.</p>
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason"
        className="mt-3 block min-h-11 w-full max-w-md rounded-xl border border-line bg-pitch px-3"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={pending !== null || reason.trim().length < 3} onClick={() => void run("generate")} className="min-h-11 rounded-full bg-india px-4 text-sm font-semibold disabled:opacity-50">
          {pending === "generate" ? "Generating…" : "Generate 24h showcase history"}
        </button>
        <button type="button" disabled={pending !== null || reason.trim().length < 3} onClick={() => void run("reset")} className="min-h-11 rounded-full bg-card-2 px-4 text-sm font-semibold disabled:opacity-50">
          {pending === "reset" ? "Resetting…" : "Reset showcase price history"}
        </button>
      </div>
      {message ? <p className="mt-2 text-sm text-muted">{message}</p> : null}
    </section>
  );
}
