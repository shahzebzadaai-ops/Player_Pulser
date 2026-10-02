/**
 * Cricbuzz transport. Parsing and pricing stay in other modules.
 * Only the feed worker should construct the default client.
 */

export class CricbuzzTransportError extends Error {
  constructor(readonly outcome: "HTTP_ERROR" | "TIMEOUT", message: string) {
    super(message);
    this.name = "CricbuzzTransportError";
  }
}

export type CricbuzzHttp = (input: string, init: RequestInit) => Promise<Response>;

export type CricbuzzTransport = {
  getMatchList(): Promise<unknown>;
  getCommentary(externalMatchId: string): Promise<unknown>;
};

const MATCHES_PATH = "/cricket-match/live-scores";
const BACKOFF_MS = [400, 1200];

const HEADERS: Record<string, string> = {
  accept: "application/json,text/plain,*/*",
  "accept-language": "en-IN,en;q=0.9",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
};

function commentaryPath(externalMatchId: string): string {
  return `/api/mcenter/comm/${encodeURIComponent(externalMatchId)}`;
}

export function createCricbuzzClient(options?: {
  baseUrl?: string;
  fetchImpl?: CricbuzzHttp;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  cacheMs?: number;
  now?: () => number;
}): CricbuzzTransport {
  const baseUrl = (options?.baseUrl ?? process.env.CRICBUZZ_BASE_URL ?? "https://www.cricbuzz.com").replace(/\/$/, "");
  const fetchImpl = options?.fetchImpl ?? fetch;
  const sleep = options?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = options?.timeoutMs ?? Number(process.env.CRICBUZZ_TIMEOUT_MS ?? 8000);
  const cacheMs = options?.cacheMs ?? 12_000;
  const now = options?.now ?? Date.now;
  const cache = new Map<string, { at: number; body: unknown }>();

  async function getJson(path: string): Promise<unknown> {
    const cached = cache.get(path);
    const clock = now();
    if (cached && clock - cached.at < cacheMs) return cached.body;
    const body = await fetchWithRetry(`${baseUrl}${path}`);
    cache.set(path, { at: now(), body });
    return body;
  }

  async function fetchWithRetry(url: string): Promise<unknown> {
    let lastError: Error = new CricbuzzTransportError("HTTP_ERROR", "Cricbuzz request failed");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { headers: HEADERS, signal: controller.signal });
        if (response.status === 429 || response.status >= 500) {
          lastError = new CricbuzzTransportError("HTTP_ERROR", `Cricbuzz returned ${response.status}`);
        } else if (!response.ok) {
          throw new CricbuzzTransportError("HTTP_ERROR", `Cricbuzz returned ${response.status}`);
        } else {
          const text = await response.text();
          try {
            return JSON.parse(text) as unknown;
          } catch {
            return text;
          }
        }
      } catch (error) {
        if (error instanceof CricbuzzTransportError && error.message.includes("returned") && !error.message.includes("429") && !/\b5\d\d\b/.test(error.message)) {
          throw error;
        }
        const aborted = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
        lastError = aborted
          ? new CricbuzzTransportError("TIMEOUT", "Cricbuzz request timed out")
          : error instanceof CricbuzzTransportError
            ? error
            : new CricbuzzTransportError("HTTP_ERROR", error instanceof Error ? error.message : "Cricbuzz request failed");
      } finally {
        clearTimeout(timer);
      }
      if (attempt < 2) await sleep(BACKOFF_MS[attempt] ?? 1200);
    }
    throw lastError;
  }

  return {
    getMatchList: () => getJson(MATCHES_PATH),
    getCommentary: (externalMatchId: string) => getJson(commentaryPath(externalMatchId)),
  };
}

export const cricbuzzClient = createCricbuzzClient();
