import { type ExternalQuote } from "@/domain/live-prices";

type QuotePatch = Omit<ExternalQuote, "label"> & { label?: string };

type MarketGlobals = typeof globalThis & {
  ppExternalQuotes?: Map<string, ExternalQuote>;
  ppExternalStarted?: boolean;
  ppExternalTimers?: boolean;
};
const marketGlobals = globalThis as MarketGlobals;
const quotes = marketGlobals.ppExternalQuotes ?? new Map<string, ExternalQuote>();
marketGlobals.ppExternalQuotes = quotes;
if (quotes.get("BTC/USD")?.price == null || quotes.get("ETH/USD")?.price == null) marketGlobals.ppExternalTimers = false;
let krakenSocket: WebSocket | null = null;
let krakenRetryMs = 1_000;
let krakenTimer: ReturnType<typeof setTimeout> | undefined;
let snapshotTimer: ReturnType<typeof setInterval> | undefined;
let cryptoTimer: ReturnType<typeof setInterval> | undefined;

function remember(patch: QuotePatch): void {
  quotes.set(patch.symbol, {
    symbol: patch.symbol,
    label: patch.label ?? patch.symbol,
    price: patch.price,
    changePercent: patch.changePercent,
    currency: patch.currency,
    source: patch.source,
    cadence: patch.cadence,
    updatedAt: patch.updatedAt,
  });
}

function readNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function externalMarketSnapshot(): ExternalQuote[] {
  const symbols: { symbol: string; label: string; currency: "USD" | "INR"; cadence: "live" | "snapshot"; source: string }[] = [
    { symbol: "USD/INR", label: "USD/INR", currency: "INR", cadence: "snapshot", source: "ECB via Frankfurter · daily snapshot" },
    { symbol: "BTC/USD", label: "BTC/USD", currency: "USD", cadence: "live", source: "Kraken ticker" },
    { symbol: "ETH/USD", label: "ETH/USD", currency: "USD", cadence: "live", source: "Kraken ticker" },
    { symbol: "GOLD", label: "GOLD", currency: "USD", cadence: "snapshot", source: "Gold spot snapshot" },
  ];
  return symbols.map((item) => quotes.get(item.symbol) ?? {
    ...item,
    price: null,
    changePercent: null,
    updatedAt: null,
  });
}

async function refreshUsdInr(): Promise<void> {
  const response = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR");
  if (!response.ok) return;
  const body = (await response.json()) as { rates?: { INR?: number }; date?: string };
  const price = readNumber(body.rates?.INR);
  if (price === null) return;
  const previous = quotes.get("USD/INR")?.price;
  remember({
    symbol: "USD/INR",
    price,
    changePercent: previous && previous !== price ? ((price - previous) / previous) * 100 : null,
    currency: "INR",
    source: body.date ? `ECB via Frankfurter · daily snapshot ${body.date}` : "ECB via Frankfurter · daily snapshot",
    cadence: "snapshot",
    updatedAt: new Date().toISOString(),
  });
}

async function refreshGold(): Promise<void> {
  const response = await fetch("https://api.gold-api.com/price/XAU");
  if (!response.ok) return;
  const body = (await response.json()) as { price?: number };
  const price = readNumber(body.price);
  if (price === null) return;
  const previous = quotes.get("GOLD")?.price;
  remember({
    symbol: "GOLD",
    label: "GOLD",
    price,
    changePercent: previous && previous !== price ? ((price - previous) / previous) * 100 : null,
    currency: "USD",
    source: "gold-api.com · spot snapshot",
    cadence: "snapshot",
    updatedAt: new Date().toISOString(),
  });
}

function applyKrakenRow(row: { symbol?: string; last?: number; change_pct?: number }): void {
  if (row.symbol !== "BTC/USD" && row.symbol !== "ETH/USD") return;
  const price = readNumber(row.last);
  if (price === null) return;
  const change = readNumber(row.change_pct);
  remember({
    symbol: row.symbol,
    price,
    changePercent: change,
    currency: "USD",
    source: "Kraken ticker",
    cadence: "live",
    updatedAt: new Date().toISOString(),
  });
}

function scheduleKraken(delay = krakenRetryMs): void {
  if (krakenTimer) clearTimeout(krakenTimer);
  krakenTimer = setTimeout(connectKraken, delay);
  krakenRetryMs = Math.min(krakenRetryMs * 2, 15_000);
}

async function refreshKrakenRest(): Promise<boolean> {
  const response = await fetch("https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD");
  if (!response.ok) return false;
  const body = (await response.json()) as { result?: Record<string, { c?: string[]; o?: string }> };
  let wrote = false;
  for (const [key, row] of Object.entries(body.result ?? {})) {
    const symbol = key.includes("XBT") || key.includes("BTC") ? "BTC/USD" : key.includes("ETH") ? "ETH/USD" : null;
    if (!symbol) continue;
    const price = readNumber(row.c?.[0]);
    const open = readNumber(row.o);
    if (price === null) continue;
    remember({
      symbol,
      price,
      changePercent: open && open !== 0 ? ((price - open) / open) * 100 : null,
      currency: "USD",
      source: "Kraken public ticker",
      cadence: "live",
      updatedAt: new Date().toISOString(),
    });
    wrote = true;
  }
  return wrote;
}

async function refreshCoinGecko(): Promise<void> {
  const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true");
  if (!response.ok) return;
  const body = (await response.json()) as { bitcoin?: { usd?: number; usd_24h_change?: number }; ethereum?: { usd?: number; usd_24h_change?: number } };
  const rows = [
    { symbol: "BTC/USD", row: body.bitcoin },
    { symbol: "ETH/USD", row: body.ethereum },
  ];
  for (const item of rows) {
    const price = readNumber(item.row?.usd);
    if (price === null) continue;
    remember({
      symbol: item.symbol,
      price,
      changePercent: readNumber(item.row?.usd_24h_change),
      currency: "USD",
      source: "CoinGecko spot · polled snapshot",
      cadence: "snapshot",
      updatedAt: new Date().toISOString(),
    });
  }
}

async function refreshCrypto(): Promise<void> {
  const kraken = await refreshKrakenRest().catch((error) => {
    logMarketFailure(error);
    return false;
  });
  if (kraken && quotes.get("BTC/USD")?.price != null && quotes.get("ETH/USD")?.price != null) return;
  await refreshCoinGecko();
}

function connectKraken(): void {
  if (typeof WebSocket === "undefined") return;
  try {
    const socket = new WebSocket("wss://ws.kraken.com/v2");
    krakenSocket = socket;
    socket.addEventListener("open", () => {
      krakenRetryMs = 1_000;
      socket.send(JSON.stringify({ method: "subscribe", params: { channel: "ticker", symbol: ["BTC/USD", "ETH/USD"] } }));
    });
    socket.addEventListener("message", (event) => {
      try {
        const body = JSON.parse(String(event.data)) as { channel?: string; data?: { symbol?: string; last?: number; change_pct?: number }[] };
        if (body.channel !== "ticker" || !Array.isArray(body.data)) return;
        for (const row of body.data) applyKrakenRow(row);
      } catch {
        /* ignore a malformed ticker frame */
      }
    });
    socket.addEventListener("close", () => {
      if (krakenSocket === socket) krakenSocket = null;
      scheduleKraken();
    });
    socket.addEventListener("error", () => socket.close());
  } catch {
    scheduleKraken();
  }
}

function logMarketFailure(error: unknown): void {
  console.error(JSON.stringify({
    level: "error",
    message: error instanceof Error ? error.message : "external market refresh failed",
    at: new Date().toISOString(),
  }));
}

export function startExternalMarkets(): void {
  if (marketGlobals.ppExternalTimers) return;
  marketGlobals.ppExternalTimers = true;
  connectKraken();
  void refreshCrypto().catch(logMarketFailure);
  void refreshUsdInr().catch(logMarketFailure);
  void refreshGold().catch(logMarketFailure);
  cryptoTimer = setInterval(() => {
    void refreshCrypto().catch(logMarketFailure);
  }, 5_000);
  snapshotTimer = setInterval(() => {
    void refreshUsdInr().catch(logMarketFailure);
    void refreshGold().catch(logMarketFailure);
  }, 60_000);
}

export function stopExternalMarkets(): void {
  marketGlobals.ppExternalTimers = false;
  if (krakenTimer) clearTimeout(krakenTimer);
  if (snapshotTimer) clearInterval(snapshotTimer);
  if (cryptoTimer) clearInterval(cryptoTimer);
  krakenTimer = undefined;
  snapshotTimer = undefined;
  cryptoTimer = undefined;
  krakenSocket?.close();
  krakenSocket = null;
}
