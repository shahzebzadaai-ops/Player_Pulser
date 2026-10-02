export const HEARTBEAT_MS = 15_000;
export const STREAM_STALE_MS = 25_000;
export const SPARKLINE_CAP = 48;

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-store, max-age=0",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

export type StreamPhase = "connecting" | "open" | "reconnecting";
export type StreamLabel = "live" | "reconnecting" | "delayed";
export type FlashDirection = "up" | "down" | "none";

export type PlayerQuote = {
  id: string;
  slug?: string;
  midPaise: string;
  buyPaise?: string;
  sellPaise?: string;
  changePaise?: string;
  changePercent?: number;
  previousMidPricePaise?: string | null;
  createdAt?: string | null;
  source?: string;
  chartTime?: number | null;
  chartValue?: number | null;
  live?: boolean;
  lastEvent?: string | null;
  whyLine?: string | null;
  stale?: boolean;
};

export type ExternalQuote = {
  symbol: string;
  label: string;
  price: number | null;
  changePercent: number | null;
  currency: "USD" | "INR";
  source: string;
  cadence: "live" | "snapshot";
  updatedAt: string | null;
};

export type PriceFrame = {
  type?: string;
  stale?: boolean;
  at?: string;
  mode?: string;
  players?: PlayerQuote[];
  markets?: ExternalQuote[];
};

export type PriceStore = {
  players: Map<string, PlayerQuote>;
  markets: ExternalQuote[];
  phase: StreamPhase;
  lastEventAt: number | null;
  feedStale: boolean;
};

export function emptyPriceStore(): PriceStore {
  return { players: new Map(), markets: [], phase: "connecting", lastEventAt: null, feedStale: false };
}

const PUBLIC_SOURCES = new Set(["simulation", "performance", "demand", "news", "manual"]);

export function publicPriceSource(source: string | null | undefined, mode: string): string {
  if (source === "SIMULATION_ONLY" || source === "seed") return "simulation";
  if (source && PUBLIC_SOURCES.has(source)) return source;
  return mode;
}

export function heartbeatFrame(at: string): string {
  return `: heartbeat\ndata: ${JSON.stringify({ type: "heartbeat", at })}\n\n`;
}

export function priceFlash(previous: number | null, next: number): FlashDirection {
  if (previous === null || !Number.isFinite(previous) || !Number.isFinite(next) || previous === next) return "none";
  return next > previous ? "up" : "down";
}

/** Direction comes only from the two prices. Balances and other customer figures are ignored. */
export function quoteDirection(previous: number | null, next: number, _customerBalancePaise?: string): FlashDirection {
  return priceFlash(previous, next);
}

export function streamHealth(input: { phase: StreamPhase; lastEventAt: number | null; now: number; staleAfterMs?: number }): StreamLabel {
  if (input.phase !== "open") return "reconnecting";
  const staleAfter = input.staleAfterMs ?? STREAM_STALE_MS;
  if (input.lastEventAt === null || input.now - input.lastEventAt > staleAfter) return "delayed";
  return "live";
}

export function nextReconnectAttempt(attempt: number, opened: boolean): number {
  return opened ? 0 : attempt + 1;
}

export function reducePriceFrame(state: PriceStore, frame: PriceFrame, now: number): PriceStore {
  if (frame.type === "heartbeat") {
    return { ...state, phase: "open", lastEventAt: now };
  }
  if (!frame.players) return state;
  const players = new Map(state.players);
  for (const player of frame.players) players.set(player.id, player);
  return {
    players,
    markets: frame.markets ?? state.markets,
    phase: "open",
    lastEventAt: now,
    feedStale: Boolean(frame.stale),
  };
}

export function appendSparkline(values: number[], next: number, cap = SPARKLINE_CAP): number[] {
  if (!Number.isFinite(next)) return values;
  if (values.length > 0 && values[values.length - 1] === next) return values;
  const appended = [...values, next];
  return appended.length > cap ? appended.slice(appended.length - cap) : appended;
}

export function nextChartPoint(lastTime: number | null, tick: { time: number; value: number }): { time: number; value: number } | null {
  if (!Number.isFinite(tick.time) || !Number.isFinite(tick.value)) return null;
  if (lastTime !== null && tick.time < lastTime) return null;
  return { time: tick.time, value: tick.value };
}

export function createSharedConnection<T extends { close(): void }>() {
  let current: T | null = null;
  let holders = 0;
  let opens = 0;
  return {
    acquire(open: () => T): T {
      holders += 1;
      if (!current) {
        opens += 1;
        current = open();
      }
      return current;
    },
    release() {
      holders = Math.max(0, holders - 1);
      if (holders === 0 && current) {
        current.close();
        current = null;
      }
    },
    get holders() {
      return holders;
    },
    get opens() {
      return opens;
    },
    get connected() {
      return current !== null;
    },
  };
}

export function playersUnaffectedByMarkets<T>(players: T, _markets: ExternalQuote[]): T {
  return players;
}

export function formatExternalPrice(quote: { symbol: string; currency: "USD" | "INR"; price: number | null }): string {
  if (quote.price === null || !Number.isFinite(quote.price)) return "Unavailable";
  const digits = quote.symbol === "BTC/USD" ? 0 : 2;
  const body = quote.price.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return quote.currency === "INR" ? `₹${body}` : `$${body}`;
}
