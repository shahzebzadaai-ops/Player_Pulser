"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SIGNUP_PROMPT_DELAY_MS, signupPromptVisible } from "@/domain/growth";
import { pushMarketing } from "./marketing-layer";

const DISMISS_KEY = "pp_signup_prompt_dismissed";

export function SignupPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setTimeout(() => {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      const dismissedAtMs = raw ? Number(raw) : null;
      if (!signupPromptVisible({ dismissedAtMs: Number.isFinite(dismissedAtMs) ? dismissedAtMs : null, nowMs: Date.now(), elapsedMs: Date.now() - started + SIGNUP_PROMPT_DELAY_MS })) return;
      setOpen(true);
      const day = new Date().toISOString().slice(0, 10);
      void fetch("/api/analytics/funnel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventName: "SIGNUP_PROMPT_SHOWN", dedupeKey: `prompt:${day}` }),
      });
      pushMarketing("SIGNUP_PROMPT_SHOWN", {});
    }, SIGNUP_PROMPT_DELAY_MS);
    void fetch("/api/analytics/funnel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventName: "LANDING_VIEW", dedupeKey: `landing:${new Date().toISOString().slice(0, 10)}` }),
    });
    pushMarketing("LANDING_VIEW", {});
    return () => window.clearTimeout(timer);
  }, []);

  if (!open) return null;

  function later() {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setOpen(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <section className="rounded-3xl border border-line bg-card p-4 shadow-lg">
        <h2 className="text-lg font-bold">Start Trading Players</h2>
        <p className="mt-1 text-sm text-muted">Sign up and get ₹200 Welcome Bonus</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href="/signup" className="btn-primary w-full">
            SIGN UP
          </Link>
          <button type="button" className="btn-secondary w-full" onClick={later}>
            MAYBE LATER
          </button>
        </div>
      </section>
    </div>
  );
}
