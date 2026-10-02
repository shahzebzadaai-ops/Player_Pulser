"use client";

import { useState } from "react";

export function WatchButton({ playerId, initial }: { playerId: string; initial: boolean }) {
  const [watching, setWatching] = useState(initial);
  const [pending, setPending] = useState(false);
  async function toggle() {
    setPending(true);
    try {
      const response = await fetch("/api/watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId, watching: !watching }),
      });
      if (response.ok) setWatching(!watching);
    } finally {
      setPending(false);
    }
  }
  return (
    <button type="button" className="min-h-11 rounded-full bg-card px-4 text-sm font-semibold" disabled={pending} onClick={() => void toggle()}>
      {watching ? "On your watchlist" : "Add to watchlist"}
    </button>
  );
}
