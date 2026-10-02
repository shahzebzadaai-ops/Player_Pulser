/**
 * CREX transport. The public match page embeds the ball feed.
 * Parsing and pricing stay in other modules.
 */

export class CrexTransportError extends Error {
  constructor(readonly outcome: "HTTP_ERROR" | "TIMEOUT", message: string) {
    super(message);
    this.name = "CrexTransportError";
  }
}

export type CrexHttp = (input: string, init: RequestInit) => Promise<Response>;

const LIVE_PATH = "/cricket-live-score";
const BALL_FEED_URL = "https://content.crickapi.com/commentary/v2/getBallFeeds";

export function createCrexClient(options?: {
  baseUrl?: string;
  fetchImpl?: CrexHttp;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  cacheMs?: number;
  now?: () => number;
}) {
  const baseUrl = (options?.baseUrl ?? process.env.CREX_BASE_URL ?? "https://crex.com").replace(/\/$/, "");
  const fetchImpl = options?.fetchImpl ?? fetch;
  const sleep = options?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = options?.timeoutMs ?? 8000;
  const cacheMs = options?.cacheMs ?? 12_000;
  const now = options?.now ?? Date.now;
  const cache = new Map<string, { at: number; body: string }>();

  async function getText(path: string): Promise<string> {
    const cached = cache.get(path);
    const clock = now();
    if (cached && clock - cached.at < cacheMs) return cached.body;
    let lastError: Error = new CrexTransportError("HTTP_ERROR", "CREX request failed");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${baseUrl}${path}`, {
          headers: {
            accept: "text/html,application/json",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          },
          signal: controller.signal,
        });
        if (response.status === 429 || response.status >= 500) {
          lastError = new CrexTransportError("HTTP_ERROR", `CREX returned ${response.status}`);
        } else if (!response.ok) {
          throw new CrexTransportError("HTTP_ERROR", `CREX returned ${response.status}`);
        } else {
          const body = await response.text();
          cache.set(path, { at: now(), body });
          return body;
        }
      } catch (error) {
        if (error instanceof CrexTransportError && !/429|\b5\d\d\b/.test(error.message)) throw error;
        lastError = error instanceof Error && error.name === "AbortError"
          ? new CrexTransportError("TIMEOUT", "CREX timed out")
          : lastError;
      } finally {
        clearTimeout(timer);
      }
      if (attempt < 2) await sleep(attempt === 0 ? 400 : 1200);
    }
    throw lastError;
  }

  return {
    ballFeedUrl: BALL_FEED_URL,
    getLivePage: () => getText(LIVE_PATH),
    getMatchPage: (path: string) => getText(path.startsWith("/") ? path : `/${path}`),
  };
}
