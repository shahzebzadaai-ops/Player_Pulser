"use client";

import { useState } from "react";

const OUTCOMES = ["SUCCESS", "PENDING", "FAILED", "CANCELLED"] as const;

export function DevPaymentPanel() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(outcome: (typeof OUTCOMES)[number]) {
    setPending(true);
    const response = await fetch("/api/dev/payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    const body = (await response.json()) as { error?: { message: string }; paymentId?: string; status?: string };
    setPending(false);
    setMessage(response.ok ? `${outcome}: ${body.status} (${body.paymentId})` : body.error?.message ?? "The simulator did not run.");
  }

  return (
    <div className="mt-4 grid gap-2">
      {OUTCOMES.map((outcome) => (
        <button key={outcome} type="button" disabled={pending} className="min-h-12 rounded-full border border-line" onClick={() => run(outcome)}>
          {outcome}
        </button>
      ))}
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
