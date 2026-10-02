/**
 * Sportskeeda commentary JSON becomes delivery rows.
 */

export class SportskeedaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SportskeedaParseError";
  }
}

export type SportskeedaDelivery = {
  id: string;
  slug: string;
  innings: number;
  over: number;
  ball: number;
  runs: number;
  kind: string;
  text: string;
  bowler: string;
  batter: string;
  timestampMs: number | null;
  summary: boolean;
};

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function plain(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export function parseSportskeedaCommentary(payload: unknown): SportskeedaDelivery[] {
  if (!Array.isArray(payload)) throw new SportskeedaParseError("Sportskeeda commentary was not a list.");
  const rows = payload.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  const markers = rows
    .filter((item) => text(item.opta_ball_type) === "end of over")
    .map((item) => ({
      over: Number(/^(\d+)/.exec(text(item.over))?.[1] ?? -1),
      innings: Number(item.inning_number) || 1,
      timestamp: Number(item.timestamp) || 0,
    }))
    .filter((item) => item.over >= 0);
  const deliveries: SportskeedaDelivery[] = [];
  for (const item of rows) {
    const kind = text(item.opta_ball_type) || "normal";
    const body = plain(text(item.comment_text));
    const ballMatch = /^(\d+)\.(\d+)\s+(.+?)\s+to\s+([^,]+)/.exec(body);
    if (kind === "end of over" || !ballMatch) continue;
    const over = Number(ballMatch[1]);
    const ball = Number(ballMatch[2]);
    const marker = markers.find((entry) => entry.over === over) ?? markers.find((entry) => entry.over === over + 1) ?? markers[0];
    deliveries.push({
      id: text(item._id) || `${over}.${ball}`,
      slug: text(item.cardSlug),
      innings: marker?.innings ?? (Number(item.inning_number) || 1),
      over,
      ball,
      runs: Number(item.runs) || 0,
      kind,
      text: body,
      bowler: ballMatch[3]?.trim() ?? "",
      batter: ballMatch[4]?.trim() ?? "",
      timestampMs: Number(item.timestamp) > 0 ? Number(item.timestamp) : null,
      summary: false,
    });
  }
  return deliveries;
}

export function parseSportskeedaMatches(payload: unknown): { externalId: string; homeTeam: string; awayTeam: string; competition: string; scheduledAt: string; providerStatus: string; matchFormat: string; venue: string }[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { matches?: unknown }).matches)) {
    throw new SportskeedaParseError("Sportskeeda match list had no matches.");
  }
  return (payload as { matches: Record<string, unknown>[] }).matches.map((match) => ({
    externalId: text(match.id),
    homeTeam: text(match.t1),
    awayTeam: text(match.t2),
    competition: text(match.event) || text(match.event_menu_name),
    scheduledAt: text(match.datetime) || new Date(0).toISOString(),
    providerStatus: text(match.status),
    matchFormat: text(match.format),
    venue: text(match.venue),
  })).filter((match) => match.externalId);
}
