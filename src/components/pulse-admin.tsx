"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PulsePreviewSwitch({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function toggle() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/features", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "pulsePreviewEnabled", enabled: !enabled }),
      });
      const payload = (await response.json()) as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Not saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Not saved.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="font-semibold">Simulation preview</p>
      <p className="mt-1 text-sm">Current state: {enabled ? "On" : "Off"}</p>
      <p className="mt-1 text-sm text-muted">Simulation only — no effect on cash settlement.</p>
      <button type="button" className="mt-3 min-h-11 rounded-full bg-india px-4 text-sm font-semibold" disabled={pending} onClick={() => void toggle()}>
        {enabled ? "Stop preview" : "Start preview"}
      </button>
      {message ? <p className="mt-2 text-sm text-loss">{message}</p> : null}
    </div>
  );
}
