"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RiskControls({
  playerId,
  manualMode,
  canManage,
  canPause,
}: {
  playerId: string;
  manualMode: string;
  canManage: boolean;
  canPause: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  async function send(action: string) {
    const response = await fetch("/api/admin/risk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId, action, reason }),
    });
    const body = (await response.json()) as { error?: { message: string } };
    setMessage(response.ok ? "Saved" : body.error?.message ?? "Not saved");
    if (response.ok) router.refresh();
  }
  if (!canManage && !canPause) return null;
  return (
    <form className="mt-4 space-y-2" onSubmit={(event) => event.preventDefault()}>
      <input className="min-h-11 w-full rounded-xl border border-line bg-pitch px-2 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for this risk control" />
      <div className="flex flex-wrap gap-2">
        {canManage && manualMode !== "PAUSE_BUYS" && manualMode !== "PAUSE_ALL" ? (
          <button className="min-h-11 rounded-full bg-card-2 px-3 text-sm" type="button" onClick={() => send("pause_buys")}>Pause new buys</button>
        ) : null}
        {canManage && manualMode === "PAUSE_BUYS" ? (
          <button className="min-h-11 rounded-full bg-card-2 px-3 text-sm" type="button" onClick={() => send("resume_buys")}>Resume new buys</button>
        ) : null}
        {canPause && manualMode !== "PAUSE_ALL" ? (
          <button className="min-h-11 rounded-full bg-india px-3 text-sm" type="button" onClick={() => send("pause_all")}>Pause all trading</button>
        ) : null}
        {canPause && manualMode === "PAUSE_ALL" ? (
          <button className="min-h-11 rounded-full bg-india px-3 text-sm" type="button" onClick={() => send("resume_all")}>Resume trading</button>
        ) : null}
      </div>
      {message ? <p className="text-xs text-muted">{message}</p> : null}
    </form>
  );
}
