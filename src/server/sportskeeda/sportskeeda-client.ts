/**
 * Sportskeeda transport. Commentary is public JSON.
 * Parsing and pricing stay in other modules.
 */

export class SportskeedaTransportError extends Error {
  constructor(readonly outcome: "HTTP_ERROR" | "TIMEOUT", message: string) {
    super(message);
    this.name = "SportskeedaTransportError";
  }
}

export type SportskeedaHttp = (input: string, init: RequestInit) => Promise<Response>;

export function createSportskeedaClient(options?: {
  matchesUrl?: string;
  commentaryUrl?: string;
  fetchImpl?: SportskeedaHttp;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  cacheMs?: number;
  now?: () => number;
}) {
  const matchesUrl = options?.matchesUrl ?? process.env.SPORTSKEEDA_MATCHES_URL ?? "https://push.sportskeeda.com/get-cricket-matches/featured_v2";
  const commentaryUrl = (options?.commentaryUrl ?? process.env.SPORTSKEEDA_COMMENTARY_URL ?? "https://cf-gotham.sportskeeda.com/cricket/commentary").replace(/\/$/, "");
  const fetchImpl = options?.fetchImpl ?? fetch;
  const sleep = options?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = options?.timeoutMs ?? 8000;
  const cacheMs = options?.cacheMs ?? 12_000;
  const now = options?.now ?? Date.now;
  const cache = new Map<string, { at: number; body: unknown }>();

  async function getJson(url: string): Promise<unknown> {
    const cached = cache.get(url);
    const clock = now();
    if (cached && clock - cached.at < cacheMs) return cached.body;
    let lastError: Error = new SportskeedaTransportError("HTTP_ERROR", "Sportskeeda request failed");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
          signal: controller.signal,
        });
        if (response.status === 429 || response.status >= 500) {
          lastError = new SportskeedaTransportError("HTTP_ERROR", `Sportskeeda returned ${response.status}`);
        } else if (!response.ok) {
          throw new SportskeedaTransportError("HTTP_ERROR", `Sportskeeda returned ${response.status}`);
        } else {
          const body = await response.json() as unknown;
          cache.set(url, { at: now(), body });
          return body;
        }
      } catch (error) {
        if (error instanceof SportskeedaTransportError && !/429|\b5\d\d\b/.test(error.message)) throw error;
        lastError = error instanceof Error && error.name === "AbortError"
          ? new SportskeedaTransportError("TIMEOUT", "Sportskeeda timed out")
          : lastError;
      } finally {
        clearTimeout(timer);
      }
      if (attempt < 2) await sleep(attempt === 0 ? 400 : 1200);
    }
    throw lastError;
  }

  return {
    getMatches: () => getJson(matchesUrl),
    getCommentary: (slug: string) => getJson(`${commentaryUrl}/${encodeURIComponent(slug)}`),
  };
}
