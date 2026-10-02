"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PlayerEditor({
  playerId,
  tradable,
  live,
  midPaise,
}: {
  playerId: string;
  tradable: boolean;
  live: boolean;
  midPaise: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [mid, setMid] = useState((Number(midPaise) / 100).toFixed(2));

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/players", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playerId,
        tradable: form.get("tradable") === "on",
        liveMatch: form.get("live") === "on",
        midRupees: mid,
        reason: String(form.get("reason") ?? ""),
      }),
    });
    const body = (await response.json()) as { error?: { message: string } };
    setMessage(response.ok ? "Saved." : body.error?.message ?? "Not saved.");
    if (response.ok) router.refresh();
  }

  return (
    <form onSubmit={save} className="mt-2 flex flex-wrap items-end gap-3 text-sm">
      <label>
        Tradable
        <input name="tradable" type="checkbox" defaultChecked={tradable} className="ml-2" />
      </label>
      <label>
        Live match
        <input name="live" type="checkbox" defaultChecked={live} className="ml-2" />
      </label>
      <label>
        Mid rupees
        <input className="mt-1 block min-h-11 rounded-xl border border-line bg-pitch px-2" value={mid} onChange={(event) => setMid(event.target.value)} />
      </label>
      <label>
        Reason for a price change
        <input name="reason" className="mt-1 block min-h-11 rounded-xl border border-line bg-pitch px-2" placeholder="Required when the mid price changes" />
      </label>
      <button className="min-h-11 rounded-full bg-india px-4" type="submit">
        Save
      </button>
      {message ? <span>{message}</span> : null}
    </form>
  );
}

export function RoleEditor({ userId, role }: { userId: string; role: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, role: form.get("role"), reason: form.get("reason") }),
    });
    const body = (await response.json()) as { error?: { message: string } };
    setMessage(response.ok ? "Updated." : body.error?.message ?? "Not updated.");
    if (response.ok) router.refresh();
  }
  return (
    <form onSubmit={save} className="flex items-center gap-2">
      <select name="role" defaultValue={role} className="min-h-11 rounded-xl bg-pitch px-2">
        <option value="CUSTOMER">Customer</option>
        <option value="ADMIN">Admin</option>
      </select>
      <input name="reason" required minLength={3} placeholder="Reason" className="min-h-11 rounded-xl border border-line bg-pitch px-2" />
      <button className="min-h-11 rounded-full bg-india px-3" type="submit">
        Save
      </button>
      {message ? <span className="text-xs">{message}</span> : null}
    </form>
  );
}

export function ReconcileButton({ paymentId, payout = false }: { paymentId: string; payout?: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  return (
    <span className="flex flex-wrap items-center gap-2">
      {payout ? (
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason"
          className="min-h-11 rounded-xl border border-line bg-pitch px-2 text-sm"
        />
      ) : null}
      <button
      type="button"
      className="min-h-11 rounded-full bg-card-2 px-3 text-sm"
      onClick={async () => {
        const response = await fetch("/api/admin/payments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ paymentId, reason }),
        });
        const body = (await response.json()) as { status?: string; error?: { message: string } };
        setMessage(response.ok ? body.status ?? "Checked" : body.error?.message ?? "Failed");
        if (response.ok) router.refresh();
      }}
    >
      {message ?? "Reconcile"}
    </button>
    </span>
  );
}

export function SettingEditor({ settingKey, value }: { settingKey: string; value: string }) {
  const router = useRouter();
  const [next, setNext] = useState(value);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const response = await fetch("/api/admin/settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: settingKey, value: next, reason }),
        });
        const body = (await response.json()) as { error?: { message: string } };
        setMessage(response.ok ? "Saved" : body.error?.message ?? "Not saved");
        if (response.ok) router.refresh();
      }}
    >
      <code className="text-xs text-muted">{settingKey}</code>
      <input className="min-h-11 rounded-xl border border-line bg-pitch px-2" value={next} onChange={(event) => setNext(event.target.value)} />
      <input className="min-h-11 rounded-xl border border-line bg-pitch px-2" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for spread, bonus, CRM, risk, or real-source pricing" />
      <button className="min-h-11 rounded-full bg-india px-3" type="submit">
        Save
      </button>
      {message ? <span className="text-xs">{message}</span> : null}
    </form>
  );
}
