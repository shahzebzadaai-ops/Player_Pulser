/**
 * Turns Cricbuzz JSON into a small parsed shape.
 * Replace this file if the provider payload changes.
 */

export class CricbuzzParseError extends Error {
  readonly outcome = "PARSE_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "CricbuzzParseError";
  }
}

export type DiscoveredMatchDraft = {
  externalId: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  scheduledAt: string;
  providerStatus: string;
  matchFormat: string;
  indiaInternational: boolean;
};

export type ParsedDelivery = {
  innings: number;
  over: number;
  ball: number;
  sequence: number;
  eventCode: string;
  text: string;
  timestamp: string | null;
  batterId: string | null;
  batterName: string | null;
  bowlerId: string | null;
  bowlerName: string | null;
};

export type ParsedCommentary = {
  externalMatchId: string;
  providerStatus: string;
  state: string;
  homeTeam: string;
  awayTeam: string;
  innings: number | null;
  overLabel: string | null;
  deliveries: ParsedDelivery[];
  score: ParsedScore | null;
};

export type ParsedScore = {
  runs: number;
  wickets: number;
  overs: string;
  strikerId: string | null;
  nonStrikerId: string | null;
  bowlerId: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function objectOf(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  return isObject(record[key]) ? record[key] : null;
}

function arrayOf(record: Record<string, unknown>, key: string): unknown[] {
  return Array.isArray(record[key]) ? record[key] : [];
}

function isIndia(name: string, shortName: string): boolean {
  return name.toLowerCase() === "india" || shortName.toUpperCase() === "IND";
}

function timestampIso(value: unknown): string | null {
  if (typeof value === "string" && value.includes("-") && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const ms = numeric < 1e12 ? numeric * 1000 : numeric;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function splitOver(value: unknown): { over: number; ball: number } | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const [overText, ballText] = numeric.toFixed(1).split(".");
  const over = Number(overText);
  const ball = Number(ballText);
  if (!Number.isInteger(over) || !Number.isInteger(ball)) return null;
  if (ball === 0) return { over: Math.max(0, over - 1), ball: 6 };
  if (ball < 1 || ball > 6) return null;
  return { over, ball };
}

function teamName(team: Record<string, unknown> | null): string {
  if (!team) return "";
  return textOf(team.teamName) || textOf(team.name);
}

function teamShort(team: Record<string, unknown> | null): string {
  if (!team) return "";
  return textOf(team.teamSName) || textOf(team.shortName);
}

function playerId(player: Record<string, unknown> | null, keys: string[]): string | null {
  if (!player) return null;
  for (const key of keys) {
    const value = textOf(player[key]);
    if (value && value !== "0") return value;
  }
  return null;
}

function playerName(player: Record<string, unknown> | null, keys: string[]): string | null {
  if (!player) return null;
  for (const key of keys) {
    const value = textOf(player[key]);
    if (value) return value;
  }
  return null;
}

function plainText(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function eventCodeOf(item: Record<string, unknown>): string {
  const raw = item.event ?? item.eventType;
  const values = (Array.isArray(raw) ? raw : [raw]).map((value) => textOf(value).toUpperCase().replaceAll(" ", "_")).filter((value) => value && value !== "ALL" && value !== "NONE");
  const preferred = ["SIX", "FOUR", "WICKET", "FIFTY", "50", "CENTURY", "100", "WIDE", "NO_BALL", "NOBALL", "BYE", "LEG_BYE", "LEGBYE"];
  return preferred.find((code) => values.includes(code)) ?? values[0] ?? "";
}

function extractBalancedObject(text: string, start: number): string {
  let depth = 0;
  let quote = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") quote = false;
      continue;
    }
    if (char === "\"") quote = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new CricbuzzParseError("Match list did not include typeMatches.");
}

export function unwrapMatchList(payload: unknown): Record<string, unknown> {
  if (isObject(payload) && Array.isArray(payload.typeMatches)) return payload;
  if (isObject(payload) && isObject(payload.currentMatchesList) && Array.isArray(payload.currentMatchesList.typeMatches)) {
    return payload.currentMatchesList;
  }
  if (typeof payload !== "string") throw new CricbuzzParseError("Match list did not include typeMatches.");
  const decoded = payload.includes("\\\"typeMatches\\\"") ? payload.replace(/\\"/g, "\"").replace(/\\n/g, "\n").replace(/\\u0026/g, "&") : payload;
  const marker = decoded.indexOf("\"typeMatches\"");
  if (marker < 0) throw new CricbuzzParseError("Match list did not include typeMatches.");
  const start = decoded.lastIndexOf("{", marker);
  const parsed = JSON.parse(extractBalancedObject(decoded, start)) as unknown;
  if (!isObject(parsed) || !Array.isArray(parsed.typeMatches)) throw new CricbuzzParseError("Match list did not include typeMatches.");
  return parsed;
}

export function parseMatchList(payload: unknown): DiscoveredMatchDraft[] {
  const list = unwrapMatchList(payload);
  const rows: DiscoveredMatchDraft[] = [];
  for (const typeMatch of list.typeMatches as unknown[]) {
    if (!isObject(typeMatch) || textOf(typeMatch.matchType) !== "International") continue;
    for (const series of arrayOf(typeMatch, "seriesMatches")) {
      if (!isObject(series)) continue;
      const wrapper = objectOf(series, "seriesAdWrapper") ?? series;
      const competition = textOf(wrapper.seriesName);
      for (const match of arrayOf(wrapper, "matches")) {
        if (!isObject(match)) continue;
        const info = objectOf(match, "matchInfo") ?? match;
        const externalId = textOf(info.matchId);
        const team1 = objectOf(info, "team1");
        const team2 = objectOf(info, "team2");
        const homeTeam = teamName(team1);
        const awayTeam = teamName(team2);
        if (!externalId || !homeTeam || !awayTeam) continue;
        const venueInfo = objectOf(info, "venueInfo");
        const venue = [venueInfo ? textOf(venueInfo.ground) : "", venueInfo ? textOf(venueInfo.city) : ""].filter(Boolean).join(", ");
        const start = timestampIso(info.startDate) ?? new Date(0).toISOString();
        rows.push({
          externalId,
          competition: textOf(info.seriesName) || competition || "International",
          homeTeam,
          awayTeam,
          venue,
          scheduledAt: start,
          providerStatus: textOf(info.status) || textOf(info.state),
          matchFormat: textOf(info.matchFormat),
          indiaInternational: isIndia(homeTeam, teamShort(team1)) || isIndia(awayTeam, teamShort(team2)),
        });
      }
    }
  }
  return rows.sort((left, right) => Number(right.indiaInternational) - Number(left.indiaInternational) || left.scheduledAt.localeCompare(right.scheduledAt));
}

export function parseCommentary(payload: unknown, externalMatchId: string): ParsedCommentary {
  if (!isObject(payload)) throw new CricbuzzParseError("Commentary payload was not an object.");
  const header = objectOf(payload, "matchHeader");
  const commentaryObject = objectOf(payload, "matchCommentary");
  const list = Array.isArray(payload.commentaryList)
    ? payload.commentaryList
    : commentaryObject
      ? Object.values(commentaryObject)
      : null;
  if (!header && !list) throw new CricbuzzParseError("Commentary payload had no match header or commentary list.");
  const miniscore = objectOf(payload, "miniscore");
  const team1 = header ? objectOf(header, "team1") : null;
  const team2 = header ? objectOf(header, "team2") : null;
  const headerInnings = miniscore ? Number(miniscore.inningsId) : Number.NaN;
  const overLabel = miniscore && (typeof miniscore.overs === "number" || typeof miniscore.overs === "string") ? textOf(miniscore.overs) : null;
  const deliveries: ParsedDelivery[] = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (!isObject(item)) continue;
    const commType = textOf(item.commType).toLowerCase();
    if (commType && commType !== "commentary") continue;
    const eventCode = eventCodeOf(item);
    const slot = splitOver(item.overNumber ?? item.ballMetric) ?? (eventCode === "FIFTY" || eventCode === "50" || eventCode === "CENTURY" || eventCode === "100" ? splitOver(miniscore?.overs) : null);
    if (!slot) continue;
    const innings = Number(item.inningsId ?? headerInnings);
    const batter = objectOf(item, "batsmanStriker") ?? objectOf(item, "batsmanDetails") ?? objectOf(item, "batsman");
    const bowler = objectOf(item, "bowlerStriker") ?? objectOf(item, "bowlerDetails") ?? objectOf(item, "bowler");
    const sequence = Number(item.ballNbr ?? item.timestamp);
    deliveries.push({
      innings: Number.isInteger(innings) && innings > 0 ? innings : 1,
      over: slot.over,
      ball: slot.ball,
      sequence: Number.isInteger(sequence) && sequence > 0 ? sequence : slot.ball,
      eventCode,
      text: plainText(textOf(item.commText) || textOf(item.commentary) || textOf(item.text)),
      timestamp: timestampIso(item.timestamp),
      batterId: playerId(batter, ["batId", "playerId", "id"]) || textOf(item.batsmanId) || null,
      batterName: playerName(batter, ["batName", "playerName", "name"]) || textOf(item.batsmanName) || null,
      bowlerId: playerId(bowler, ["bowlId", "playerId", "id"]) || textOf(item.bowlerId) || null,
      bowlerName: playerName(bowler, ["bowlName", "playerName", "name"]) || textOf(item.bowlerName) || null,
    });
  }
  return {
    externalMatchId: header ? textOf(header.matchId) || externalMatchId : externalMatchId,
    providerStatus: header ? textOf(header.status) || textOf(header.state) : "",
    state: header ? textOf(header.state) : "",
    homeTeam: teamName(team1),
    awayTeam: teamName(team2),
    innings: Number.isInteger(headerInnings) ? headerInnings : null,
    overLabel,
    deliveries,
    score: scoreFrom(miniscore),
  };
}

function scoreFrom(miniscore: Record<string, unknown> | null): ParsedScore | null {
  if (!miniscore) return null;
  const batTeam = objectOf(miniscore, "batTeam");
  const runsText = textOf(batTeam?.teamScore) || textOf(miniscore.runs) || textOf(miniscore.score);
  const wicketsText = textOf(batTeam?.teamWkts) || textOf(miniscore.wickets);
  if (!runsText || !wicketsText) return null;
  const runs = Number(runsText);
  const wickets = Number(wicketsText);
  if (!Number.isInteger(runs) || !Number.isInteger(wickets) || runs < 0 || wickets < 0) return null;
  const striker = objectOf(miniscore, "batsmanStriker");
  const nonStriker = objectOf(miniscore, "batsmanNonStriker");
  const bowler = objectOf(miniscore, "bowlerStriker");
  return {
    runs,
    wickets,
    overs: textOf(miniscore.overs),
    strikerId: playerId(striker, ["batId", "playerId", "id"]),
    nonStrikerId: playerId(nonStriker, ["batId", "playerId", "id"]),
    bowlerId: playerId(bowler, ["bowlId", "playerId", "id"]),
  };
}
