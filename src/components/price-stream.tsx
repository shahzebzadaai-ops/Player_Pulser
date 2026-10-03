"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  emptyPriceStore,
  nextReconnectAttempt,
  reducePriceFrame,
  streamHealth,
  type ExternalQuote,
  type PlayerQuote,
  type PriceFrame,
  type PriceStore,
  type StreamLabel,
} from "@/domain/live-prices";
import { sseRetryDelayMs } from "@/domain/realtime";

let store: PriceStore = emptyPriceStore();
const listeners = new Set<() => void>();
const serverStore = emptyPriceStore();
let source: EventSource | null = null;
let holders = 0;
let attempt = 0;
let retryTimer = 0;
let stopped = false;
let generation = 0;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function paintMatchStatus(frame: PriceFrame) {
  if (!frame.players || typeof document === "undefined") return;
  for (const element of document.querySelectorAll<HTMLElement>("[data-live-event]")) {
    const player = frame.players.find((item) => item.id === element.dataset.liveEvent);
    if (player?.lastEvent) element.textContent = player.lastEvent;
  }
  for (const element of document.querySelectorAll<HTMLElement>("[data-live-why]")) {
    const player = frame.players.find((item) => item.id === element.dataset.liveWhy);
    if (player?.whyLine) element.textContent = player.whyLine;
  }
  for (const element of document.querySelectorAll<HTMLElement>("[data-live-dot]")) {
    const player = frame.players.find((item) => item.id === element.dataset.liveDot);
    const label = element.querySelector("[data-live-dot-label]");
    if (!player || !label || player.live === undefined) continue;
    label.textContent = player.live ? "LIVE" : "QUOTED";
  }
  window.dispatchEvent(new CustomEvent("pp-prices", { detail: frame }));
}

function connect() {
  if (retryTimer) window.clearTimeout(retryTimer);
  retryTimer = 0;
  const token = ++generation;
  const previous = source;
  const next = new EventSource("/api/prices/stream");
  source = next;
  previous?.close();
  let failed = false;
  next.onopen = () => {
    if (token !== generation) return;
    attempt = nextReconnectAttempt(attempt, true);
    store = { ...store, phase: "open" };
    emit();
  };
  next.onmessage = (event) => {
    if (token !== generation) return;
    let frame: PriceFrame;
    try {
      frame = JSON.parse(event.data) as PriceFrame;
    } catch {
      return;
    }
    store = reducePriceFrame(store, frame, Date.now());
    emit();
    if (frame.type !== "heartbeat") paintMatchStatus(frame);
  };
  next.onerror = () => {
    if (failed || token !== generation || stopped) return;
    failed = true;
    next.close();
    if (source === next) source = null;
    store = { ...store, phase: "reconnecting" };
    emit();
    const delay = sseRetryDelayMs(attempt);
    attempt = nextReconnectAttempt(attempt, false);
    retryTimer = window.setTimeout(() => {
      if (stopped || token !== generation) return;
      connect();
    }, delay);
  };
}

export function retainPriceStream(): () => void {
  holders += 1;
  if (holders === 1) {
    stopped = false;
    store = { ...store, phase: "connecting" };
    connect();
  }
  return () => {
    holders -= 1;
    if (holders > 0) return;
    stopped = true;
    source?.close();
    source = null;
    if (retryTimer) window.clearTimeout(retryTimer);
    retryTimer = 0;
  };
}

export function PriceStreamProvider({ children }: { children: ReactNode }) {
  useEffect(() => retainPriceStream(), []);
  return children;
}

export function usePriceStore(): PriceStore {
  return useSyncExternalStore(subscribe, () => store, () => serverStore);
}

export function useLivePlayer(playerId: string | undefined): PlayerQuote | null {
  const current = usePriceStore();
  if (!playerId) return null;
  return current.players.get(playerId) ?? null;
}

export function useExternalMarkets(): ExternalQuote[] {
  return usePriceStore().markets;
}

export function useStreamLabel(): StreamLabel {
  const current = usePriceStore();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);
  return streamHealth({ phase: current.phase, lastEventAt: current.lastEventAt, now });
}

export function ShowcaseMark() {
  const mode = usePriceStore().marketMode;
  if (mode !== "SHOWCASE") return null;
  return <p className="whitespace-nowrap text-[10px] font-semibold tracking-wide text-muted">SHOWCASE MARKET</p>;
}

export function StreamStatus() {
  const label = useStreamLabel();
  const text = label === "live" ? "LIVE" : label === "delayed" ? "DELAYED" : "RECONNECTING";
  const dot = label === "live" ? "is-live" : label === "delayed" ? "bg-[#e6b325]" : "bg-[#ff4d5e]";
  return (
    <p role="status" aria-live="polite" className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold tracking-wide text-muted">
      <span className={`live-dot ${dot}`} />
      {text}
    </p>
  );
}
