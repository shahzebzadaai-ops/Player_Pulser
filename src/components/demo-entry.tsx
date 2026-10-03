"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DemoEntry() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/auth/demo", { method: "POST" });
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!response.ok) {
      setMessage(body?.error?.message ?? "The live demo is unavailable.");
      setPending(false);
      return;
    }
    router.push("/home");
    router.refresh();
  }

  return (
    <span className="inline-flex min-w-0 flex-col items-stretch">
      <button type="button" className="btn-primary px-3 text-sm" disabled={pending} onClick={() => void start()}>
        {pending ? "Opening demo" : "Try Live Demo"}
      </button>
      {message ? (
        <span role="alert" className="mt-1 max-w-40 text-[11px] text-loss">
          {message}
        </span>
      ) : null}
    </span>
  );
}
