"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  changedPlayerIds,
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
const playerListeners = new Map<string, Set<() => void>>();
const serverStore = emptyPriceStore();
let source: EventSource | null = null;
let holders = 0;
let attempt = 0;
let retryTimer = 0;
let stopped = false;
let generation = 0;

function feedWord(player: { live?: boolean; stale?: boolean } | undefined) {
  const health = streamHealth({ phase: store.phase, lastEventAt: store.lastEventAt, now: Date.now() });
  if (health === "reconnecting") return "OFFLINE";
  if (health === "delayed" || player?.stale) return "DELAYED";
  return player?.live ? "LIVE" : "QUOTED";
}

function paintFeedLabels() {
  if (typeof document === "undefined") return;
  for (const element of document.querySelectorAll<HTMLElement>("[data-live-dot]")) {
    const label = element.querySelector("[data-live-dot-label]");
    const dot = element.querySelector(".live-dot");
    if (!label) continue;
    const word = feedWord(store.players.get(element.dataset.liveDot ?? ""));
    label.textContent = word;
    dot?.classList.toggle("is-live", word === "LIVE");
  }
}

function emit(changedIds: string[]) {
  for (const listener of listeners) listener();
  for (const id of changedIds) {
    const bucket = playerListeners.get(id);
    if (!bucket) continue;
    for (const listener of bucket) listener();
  }
  paintFeedLabels();
}

export function subscribePriceStore(listener: () => void) {
  return subscribe(listener);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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
    emit([]);
  };
  next.onmessage = (event) => {
    if (token !== generation) return;
    let frame: PriceFrame;
    try {
      frame = JSON.parse(event.data) as PriceFrame;
    } catch {
      return;
    }
    const previous = store;
    store = reducePriceFrame(store, frame, Date.now());
    emit(changedPlayerIds(previous, store));
    if (frame.type !== "heartbeat") paintMatchStatus(frame);
  };
  next.onerror = () => {
    if (failed || token !== generation || stopped) return;
    failed = true;
    next.close();
    if (source === next) source = null;
    store = { ...store, phase: "reconnecting" };
    emit([]);
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

export function readPriceStore(): PriceStore {
  return store;
}

export function useLivePlayer(playerId: string | undefined): PlayerQuote | null {
  return useSyncExternalStore(
    (listener) => {
      if (!playerId) return () => undefined;
      let bucket = playerListeners.get(playerId);
      if (!bucket) {
        bucket = new Set();
        playerListeners.set(playerId, bucket);
      }
      bucket.add(listener);
      return () => {
        bucket?.delete(listener);
        if (bucket && bucket.size === 0) playerListeners.delete(playerId);
      };
    },
    () => (playerId ? store.players.get(playerId) ?? null : null),
    () => null,
  );
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
