/**
 * Decides when provider matches are the same real match.
 * Team identity, start time, format, and venue are compared.
 * The title string is not the match key.
 */

export const MATCH_PROVIDERS = ["CREX", "Sportskeeda", "Cricbuzz"] as const;
export type MatchProvider = (typeof MATCH_PROVIDERS)[number];

export type ProviderMatchRecord = {
  source: MatchProvider;
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  scheduledAt: string;
  matchFormat: string;
  venue: string;
  providerStatus: string;
};

export type ResolvedCricketMatch = {
  homeTeam: string;
  awayTeam: string;
  competition: string;
  scheduledAt: string;
  matchFormat: string;
  venue: string;
  providers: Partial<Record<MatchProvider, ProviderMatchRecord>>;
  foundCount: number;
  monitoring: "READY" | "DEGRADED";
};

const TEAM_ALIASES: Record<string, string> = {
  ind: "india",
  india: "india",
  aus: "australia",
  australia: "australia",
  eng: "england",
  england: "england",
  pak: "pakistan",
  pakistan: "pakistan",
  sl: "sri lanka",
  "sri lanka": "sri lanka",
  sa: "south africa",
  "south africa": "south africa",
  nz: "new zealand",
  "new zealand": "new zealand",
  wi: "west indies",
  "west indies": "west indies",
  ban: "bangladesh",
  bangladesh: "bangladesh",
  afg: "afghanistan",
  afghanistan: "afghanistan",
  zim: "zimbabwe",
  zimbabwe: "zimbabwe",
  ire: "ireland",
  ireland: "ireland",
};

const START_WINDOW_MS = 6 * 60 * 60 * 1000;

export function canonicalTeam(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b(men|mens|male|women|womens)\b/g, " ").replace(/\s+/g, " ").trim();
  return TEAM_ALIASES[cleaned] ?? cleaned;
}

export function isIndiaTeam(value: string): boolean {
  return canonicalTeam(value) === "india";
}

export function canonicalFormat(value: string): string {
  const text = value.toLowerCase();
  if (!text.trim()) return "";
  if (/t20|twenty/.test(text)) return "t20";
  if (/odi|one[\s-]?day/.test(text)) return "odi";
  if (/\btest\b/.test(text)) return "test";
  return text.replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((token) => token.length >= 5 && !/^\d+$/.test(token));
}

function compatibleText(left: string, right: string): boolean {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (!a || !b) return true;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const shared = tokens(a).filter((token) => tokens(b).includes(token));
  return shared.length > 0;
}

function sameTeams(left: ProviderMatchRecord, right: ProviderMatchRecord): boolean {
  const leftTeams = [canonicalTeam(left.homeTeam), canonicalTeam(left.awayTeam)].sort();
  const rightTeams = [canonicalTeam(right.homeTeam), canonicalTeam(right.awayTeam)].sort();
  return leftTeams[0] !== "" && leftTeams[0] === rightTeams[0] && leftTeams[1] === rightTeams[1];
}

export function sameRealMatch(left: ProviderMatchRecord, right: ProviderMatchRecord): boolean {
  if (left.source === right.source) return left.externalId === right.externalId;
  if (!sameTeams(left, right)) return false;
  const leftStart = Date.parse(left.scheduledAt);
  const rightStart = Date.parse(right.scheduledAt);
  if (!Number.isFinite(leftStart) || !Number.isFinite(rightStart)) return false;
  if (Math.abs(leftStart - rightStart) > START_WINDOW_MS) return false;
  const leftFormat = canonicalFormat(left.matchFormat);
  const rightFormat = canonicalFormat(right.matchFormat);
  if (leftFormat && rightFormat && leftFormat !== rightFormat) return false;
  if (!compatibleText(left.venue, right.venue)) return false;
  const leftYear = /\b(20\d{2})\b/.exec(left.competition)?.[1];
  const rightYear = /\b(20\d{2})\b/.exec(right.competition)?.[1];
  if (leftYear && rightYear && leftYear !== rightYear) return false;
  return true;
}

function bestName(records: ProviderMatchRecord[], canonical: string): string {
  const names = records.flatMap((record) => [record.homeTeam, record.awayTeam]).filter((name) => canonicalTeam(name) === canonical);
  return names.sort((left, right) => right.length - left.length)[0] ?? canonical;
}

export function resolveCrossSourceMatches(records: ProviderMatchRecord[]): ResolvedCricketMatch[] {
  const groups: ProviderMatchRecord[][] = [];
  for (const record of records) {
    const group = groups.find((items) => items.some((item) => sameRealMatch(item, record)));
    if (group) {
      if (!group.some((item) => item.source === record.source && item.externalId === record.externalId)) group.push(record);
    } else groups.push([record]);
  }
  return groups.map((group) => {
    const providers: Partial<Record<MatchProvider, ProviderMatchRecord>> = {};
    for (const record of group) {
      const current = providers[record.source];
      if (!current) providers[record.source] = record;
    }
    const chosen = Object.values(providers);
    const sample = chosen[0];
    const foundCount = chosen.length;
    return {
      homeTeam: bestName(chosen, canonicalTeam(sample?.homeTeam ?? "")),
      awayTeam: bestName(chosen, canonicalTeam(sample?.awayTeam ?? "")),
      competition: chosen.map((record) => record.competition).sort((left, right) => right.length - left.length)[0] ?? "",
      scheduledAt: chosen.map((record) => record.scheduledAt).sort()[0] ?? "",
      matchFormat: canonicalFormat(chosen.find((record) => record.matchFormat)?.matchFormat ?? ""),
      venue: chosen.map((record) => record.venue).sort((left, right) => right.length - left.length)[0] ?? "",
      providers,
      foundCount,
      monitoring: foundCount >= 2 ? "READY" : "DEGRADED",
    };
  });
}

export function nextIndiaMatch(records: ProviderMatchRecord[], nowMs: number): ResolvedCricketMatch | null {
  const india = resolveCrossSourceMatches(records).filter((match) => isIndiaTeam(match.homeTeam) || isIndiaTeam(match.awayTeam));
  const ranked = india.sort((left, right) => {
    const leftLive = Object.values(left.providers).some((provider) => isLiveProviderStatus(provider?.providerStatus ?? "")) ? 0 : 1;
    const rightLive = Object.values(right.providers).some((provider) => isLiveProviderStatus(provider?.providerStatus ?? "")) ? 0 : 1;
    return leftLive - rightLive || Math.abs(Date.parse(left.scheduledAt) - nowMs) - Math.abs(Date.parse(right.scheduledAt) - nowMs);
  });
  return ranked[0] ?? null;
}

export function isLiveProviderStatus(status: string): boolean {
  const text = status.toLowerCase();
  if (!text || /complete|abandon|post|scheduled|upcoming|stumps|preview/.test(text)) return false;
  return /live|in play|in progress|innings/.test(text);
}

export function providerAvailability(match: ResolvedCricketMatch | null): Record<MatchProvider, "FOUND" | "NOT FOUND"> {
  return {
    CREX: match?.providers.CREX ? "FOUND" : "NOT FOUND",
    Sportskeeda: match?.providers.Sportskeeda ? "FOUND" : "NOT FOUND",
    Cricbuzz: match?.providers.Cricbuzz ? "FOUND" : "NOT FOUND",
  };
}
