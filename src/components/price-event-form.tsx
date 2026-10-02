"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PriceEventForm({ players }: { players: { id: string; name: string }[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [kind, setKind] = useState("match");
  return (
    <form
      className="mt-4 grid gap-2 rounded-2xl border border-line bg-card p-3 text-sm"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const response = await fetch("/api/admin/price-events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            playerId: form.get("playerId"),
            kind,
            eventType: form.get("eventType"),
            context: form.get("context"),
            headline: form.get("headline"),
            severity: Number(form.get("severity") || 3),
            direction: form.get("direction"),
            verified: form.get("verified") === "on",
            idempotencyKey: form.get("idempotencyKey"),
          }),
        });
        const body = (await response.json()) as { error?: { message: string }; applied?: boolean };
        setMessage(response.ok ? (body.applied ? "Recorded and priced." : "Recorded. Pricing follows the active engine mode.") : body.error?.message ?? "Not saved");
        if (response.ok) router.refresh();
      }}
    >
      <p className="font-semibold">Record a structured event</p>
      <div className="flex flex-wrap gap-2">
        <select className="min-h-10 rounded-xl border border-line bg-pitch px-2" name="playerId" required>
          {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
        </select>
        <select className="min-h-10 rounded-xl border border-line bg-pitch px-2" value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="match">Match</option>
          <option value="news">News</option>
        </select>
        <input className="min-h-10 rounded-xl border border-line bg-pitch px-2" name="eventType" placeholder={kind === "match" ? "SIX" : "NOT_SELECTED"} required />
        {kind === "match" ? (
          <select className="min-h-10 rounded-xl border border-line bg-pitch px-2" name="context" defaultValue="NORMAL">
            {["NORMAL", "IMPORTANT", "HIGH_PRESSURE", "MATCH_DEFINING"].map((context) => <option key={context}>{context}</option>)}
          </select>
        ) : (
          <>
            <select className="min-h-10 rounded-xl border border-line bg-pitch px-2" name="direction" defaultValue="NEGATIVE">
              <option>NEGATIVE</option>
              <option>POSITIVE</option>
            </select>
            <input className="min-h-10 w-16 rounded-xl border border-line bg-pitch px-2" name="severity" type="number" min={1} max={5} defaultValue={3} />
            <label className="flex items-center gap-1"><input name="verified" type="checkbox" /> Verified</label>
          </>
        )}
      </div>
      <input className="min-h-10 rounded-xl border border-line bg-pitch px-2" name="headline" placeholder="Headline or summary" required />
      <input className="min-h-10 rounded-xl border border-line bg-pitch px-2" name="idempotencyKey" placeholder="Stable event id" required minLength={8} />
      <button className="min-h-10 w-fit rounded-full bg-india px-3" type="submit">Save event</button>
      {message ? <p className="text-xs text-muted">{message}</p> : null}
    </form>
  );
}
