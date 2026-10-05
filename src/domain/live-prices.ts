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
  dayHighPaise?: string;
  dayLowPaise?: string;
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
  marketMode?: "SHOWCASE" | "EVENT_DRIVEN";
  players?: PlayerQuote[];
  markets?: ExternalQuote[];
};

export type PriceStore = {
  players: Map<string, PlayerQuote>;
  markets: ExternalQuote[];
  phase: StreamPhase;
  lastEventAt: number | null;
  feedStale: boolean;
  marketMode: "SHOWCASE" | "EVENT_DRIVEN" | null;
};

export function emptyPriceStore(): PriceStore {
  return { players: new Map(), markets: [], phase: "connecting", lastEventAt: null, feedStale: false, marketMode: null };
}

const PUBLIC_SOURCES = new Set(["simulation", "performance", "demand", "news", "manual"]);

export function publicPriceSource(source: string | null | undefined, mode: string): string {
  if (source === "SIMULATION_ONLY" || source === "seed" || source === "SHOWCASE") return source === "SHOWCASE" ? "showcase" : "simulation";
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

function sameQuote(left: PlayerQuote, right: PlayerQuote): boolean {
  return (
    left.midPaise === right.midPaise &&
    left.buyPaise === right.buyPaise &&
    left.sellPaise === right.sellPaise &&
    left.changePaise === right.changePaise &&
    left.changePercent === right.changePercent &&
    left.chartTime === right.chartTime &&
    left.chartValue === right.chartValue &&
    left.live === right.live &&
    left.stale === right.stale &&
    left.previousMidPricePaise === right.previousMidPricePaise
  );
}

/** Keep the stored quote when a repeat or an older tick arrives. */
export function mergePlayerQuote(previous: PlayerQuote | undefined, next: PlayerQuote): PlayerQuote {
  if (!previous) return next;
  if (previous.createdAt && next.createdAt && next.createdAt < previous.createdAt) return previous;
  if (sameQuote(previous, next)) return previous;
  return next;
}

export function changedPlayerIds(before: PriceStore, after: PriceStore): string[] {
  const ids: string[] = [];
  for (const [id, quote] of after.players) {
    if (before.players.get(id) !== quote) ids.push(id);
  }
  return ids;
}

export function reducePriceFrame(state: PriceStore, frame: PriceFrame, now: number): PriceStore {
  if (frame.type === "heartbeat") {
    return { ...state, phase: "open", lastEventAt: now, marketMode: frame.marketMode ?? state.marketMode };
  }
  if (!frame.players) return state;
  const players = new Map(state.players);
  for (const player of frame.players) {
    players.set(player.id, mergePlayerQuote(state.players.get(player.id), player));
  }
  return {
    players,
    markets: frame.markets ?? state.markets,
    phase: "open",
    lastEventAt: now,
    feedStale: Boolean(frame.stale),
    marketMode: frame.marketMode ?? state.marketMode,
  };
}

export type ChartRange = "1H" | "1D" | "7D" | "30D" | "ALL";

/** 1D is the existing 24-hour window. It does not invent extra observations. */
export function historyWindow(range: string): "1H" | "24H" | "7D" | "30D" | "ALL" {
  if (range === "1D" || range === "24H") return "24H";
  if (range === "1H" || range === "7D" || range === "30D" || range === "ALL") return range;
  return "24H";
}

export function rankMovers<T extends { id: string; changePercent: number }>(players: T[]): T[] {
  return [...players].sort((left, right) => Math.abs(right.changePercent) - Math.abs(left.changePercent) || left.id.localeCompare(right.id));
}

export function shouldRefreshRanking(lastAt: number, now: number, intervalMs = 4_000): boolean {
  return now - lastAt >= intervalMs;
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
