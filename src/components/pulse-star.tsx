"use client";

import { useEffect, useState } from "react";
import { formatPaise } from "@/domain/money";
import type { PulseState } from "@/domain/pulse-preview";

type PulseSnapshot = {
  id: string;
  pulseState?: PulseState | null;
  pulseActivity?: string | null;
  pulseFeedLabel?: string | null;
  pulsePreviewPaise?: string | null;
  pulseCycleId?: string | null;
};

function readPulse(playerId: string, event: Event): PulseSnapshot | null {
  const players = (event as CustomEvent<{ players?: PulseSnapshot[] }>).detail?.players;
  return players?.find((player) => player.id === playerId) ?? null;
}

export function PulseStar({ playerId, state }: { playerId: string; state: PulseState }) {
  const [current, setCurrent] = useState(state);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const sync = () => setPaused(document.hidden);
    const onPrices = (event: Event) => {
      const next = readPulse(playerId, event)?.pulseState;
      if (next) setCurrent(next);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pp-prices", onPrices);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pp-prices", onPrices);
    };
  }, [playerId]);
  return (
    <span className={`pulse-star${paused ? " is-paused" : ""}`} data-activity={current} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-4 w-4">
        <path d="M12 2.8l2.1 6.2h6.5l-5.2 3.8 2 6.2L12 15.4 6.6 19l2-6.2L3.4 9h6.5L12 2.8z" fill="currentColor" />
      </svg>
    </span>
  );
}

export function PulsePanel({
  playerId,
  state,
  activity,
  feedLabel,
  previewPaise,
}: {
  playerId: string;
  state: PulseState;
  activity: string;
  feedLabel: string;
  previewPaise: string;
}) {
  const [view, setView] = useState({ state, activity, feedLabel, previewPaise });
  useEffect(() => {
    const onPrices = (event: Event) => {
      const next = readPulse(playerId, event);
      if (!next?.pulseState || !next.pulseActivity || !next.pulseFeedLabel || !next.pulsePreviewPaise) return;
      setView({
        state: next.pulseState,
        activity: next.pulseActivity,
        feedLabel: next.pulseFeedLabel,
        previewPaise: next.pulsePreviewPaise,
      });
    };
    window.addEventListener("pp-prices", onPrices);
    return () => window.removeEventListener("pp-prices", onPrices);
  }, [playerId]);
  return (
    <section className="mt-4 rounded-3xl border border-dashed border-line bg-pitch-2 p-4" aria-label="Simulation">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <PulseStar playerId={playerId} state={view.state} />
          Market Pulse
        </p>
        <span className="rounded-full bg-card px-2 py-1 text-[11px] font-semibold text-india">Simulation</span>
      </div>
      <p className="mt-2 text-sm">{view.activity}</p>
      <p className="wrap-anywhere mt-1 text-xs text-muted">{view.feedLabel}</p>
      <p className="mt-3 text-xs text-muted">Simulation preview</p>
      <p className="num text-2xl font-bold">{formatPaise(view.previewPaise)}</p>
      <p className="mt-2 text-xs text-muted">Moves around the quoted price. This preview does not change your balance or your Pulsers.</p>
      <p className="mt-1 text-xs text-muted">Generated market movement is not a cricket event.</p>
    </section>
  );
}
