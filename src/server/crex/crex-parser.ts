/**
 * CREX page text becomes ball objects. Names and ids stay provider-side
 * until the normalizer.
 */

export class CrexParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrexParseError";
  }
}

export type CrexBall = {
  id: string;
  matchKey: string;
  innings: number;
  over: number;
  ball: number;
  runsText: string;
  kind: string;
  batterId: string;
  bowlerId: string;
  commentary: string;
  detail: string;
  score: string;
  timestampMs: number | null;
};

const BALL_FEED_URL = "https://content.crickapi.com/commentary/v2/getBallFeeds";
export { BALL_FEED_URL };

export function decodeCrexText(value: string): string {
  return value.replace(/&q;/g, "\"").replace(/&a;/g, "&").replace(/&l;/g, "<").replace(/&g;/g, ">");
}

export function extractEmbeddedJson(page: string, marker: string): unknown {
  const decoded = decodeCrexText(page);
  const token = `"${marker}"`;
  const at = decoded.indexOf(token);
  if (at < 0) throw new CrexParseError("CREX page did not include the ball feed.");
  const start = decoded.indexOf(":", at + token.length);
  if (start < 0) throw new CrexParseError("CREX ball feed had no value.");
  const slice = decoded.slice(start + 1).trimStart();
  const end = jsonEnd(slice);
  try {
    return JSON.parse(slice.slice(0, end));
  } catch {
    throw new CrexParseError("CREX ball feed was not valid JSON.");
  }
}

function jsonEnd(value: string): number {
  const opener = value[0];
  const closer = opener === "[" ? "]" : opener === "{" ? "}" : "";
  if (!closer) throw new CrexParseError("CREX ball feed was not a JSON value.");
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") quoted = false;
      continue;
    }
    if (char === "\"") quoted = true;
    else if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  throw new CrexParseError("CREX ball feed JSON did not close.");
}

export function crexMatchPaths(page: string): { key: string; path: string }[] {
  const found = new Map<string, string>();
  for (const match of page.matchAll(/\/cricket-live-score\/[A-Za-z0-9-]+/g)) {
    const path = match[0];
    const key = path.slice(path.lastIndexOf("-") + 1);
    if (key && key !== "score") found.set(key, path);
  }
  return [...found.entries()].map(([key, path]) => ({ key, path }));
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function parseCrexBalls(payload: unknown): CrexBall[] {
  const list = Array.isArray(payload) ? payload : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
    ? (payload as { data: unknown[] }).data
    : null;
  if (!list) throw new CrexParseError("CREX ball feed was not a list.");
  const balls: CrexBall[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const overText = text(row.o);
    const parts = /^(\d+)\.(\d+)$/.exec(overText);
    if (!parts) continue;
    const ball = Number(parts[2]);
    if (ball < 1) continue;
    balls.push({
      id: text(row.ball_db_id) || text(row.id),
      matchKey: text(row.mfkey),
      innings: Number(row.inning) || 1,
      over: Number(parts[1]),
      ball,
      runsText: text(row.b),
      kind: text(row.type) || "b",
      batterId: text(row.pf),
      bowlerId: text(row.bf),
      commentary: text(row.c1),
      detail: text(row.c2),
      score: text(row.s),
      timestampMs: Number(row.id) > 1_000_000_000_000 ? Number(row.id) : null,
    });
  }
  return balls;
}

export function parseCrexDiscoveries(pageOrPayload: unknown): { externalId: string; homeTeam: string; awayTeam: string; competition: string; scheduledAt: string; providerStatus: string; matchFormat: string; venue: string }[] {
  if (typeof pageOrPayload === "string" && pageOrPayload.trim().startsWith("[")) {
    try {
      return parseCrexDiscoveries(JSON.parse(pageOrPayload) as unknown);
    } catch {
      return [];
    }
  }
  if (Array.isArray(pageOrPayload)) {
    return pageOrPayload.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const externalId = text(row.key) || text(row.mfkey) || text(row.externalId);
      const homeTeam = text(row.team1) || text(row.homeTeam);
      const awayTeam = text(row.team2) || text(row.awayTeam);
      if (!externalId || !homeTeam || !awayTeam) return [];
      return [{
        externalId,
        homeTeam,
        awayTeam,
        competition: text(row.competition) || text(row.series),
        scheduledAt: text(row.start) || text(row.scheduledAt) || new Date(0).toISOString(),
        providerStatus: text(row.status) || text(row.providerStatus),
        matchFormat: text(row.format) || text(row.matchFormat),
        venue: text(row.venue),
      }];
    });
  }
  if (typeof pageOrPayload !== "string") return [];
  const found: { externalId: string; homeTeam: string; awayTeam: string; competition: string; scheduledAt: string; providerStatus: string; matchFormat: string; venue: string }[] = [];
  for (const match of pageOrPayload.matchAll(/\/cricket-live-score\/([a-z0-9-]+)-([A-Za-z0-9]+)/g)) {
    const slug = match[1] ?? "";
    const teams = /^([a-z]+)-vs-([a-z]+)/.exec(slug);
    if (!teams) continue;
    found.push({
      externalId: match[2] ?? "",
      homeTeam: teams[1] ?? "",
      awayTeam: teams[2] ?? "",
      competition: "",
      scheduledAt: new Date(0).toISOString(),
      providerStatus: "",
      matchFormat: /t20/.test(slug) ? "t20" : /odi/.test(slug) ? "odi" : /test/.test(slug) ? "test" : "",
      venue: "",
    });
  }
  return found.filter((match) => match.externalId);
}
