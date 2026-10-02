/**
 * Live cricket feed normalization.
 * Provider payloads stop here. Pricing receives only existing performance event names.
 */

export const FEED_SOURCES = ["DevelopmentSimulator", "CREX", "Cricbuzz", "Sportskeeda", "PaidProvider"] as const;
export type FeedSourceName = (typeof FEED_SOURCES)[number];

export const MATCH_STATUSES = ["SCHEDULED", "LIVE", "INNINGS_BREAK", "COMPLETED", "ABANDONED", "DELAYED"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const FEED_EVENT_TYPES = [
  "DOT_BALL",
  "SINGLE",
  "DOUBLE",
  "TRIPLE",
  "FOUR",
  "SIX",
  "WICKET",
  "NO_BALL",
  "WIDE",
  "BYE",
  "LEG_BYE",
  "CATCH",
  "RUN_OUT",
  "DROPPED_CATCH",
  "FIFTY",
  "CENTURY",
  "MAIDEN_OVER",
] as const;
export type FeedEventType = (typeof FEED_EVENT_TYPES)[number];

export const MAPPING_STATUSES = ["MAPPED", "UNMAPPED", "NEEDS_REVIEW"] as const;
export type MappingStatus = (typeof MAPPING_STATUSES)[number];

export const PARTICIPATION_STATUSES = ["SQUAD", "PLAYING_XI", "ACTIVE", "SUBSTITUTE", "NOT_PLAYING"] as const;
export type ParticipationStatus = (typeof PARTICIPATION_STATUSES)[number];

export function isParticipationStatus(value: string): value is ParticipationStatus {
  return (PARTICIPATION_STATUSES as readonly string[]).includes(value);
}

export function participationJoinsLive(status: string): boolean {
  return status === "PLAYING_XI" || status === "ACTIVE" || status === "SUBSTITUTE";
}

export const SOURCE_HEALTH = ["HEALTHY", "DEGRADED", "DOWN", "DISABLED"] as const;
export type SourceHealth = (typeof SOURCE_HEALTH)[number];

export const DEFAULT_FEED_POLL_SECONDS = 15;
export const SOURCE_DEGRADED_AFTER_FAILURES = 1;
export const SOURCE_DOWN_AFTER_FAILURES = 3;

export type NormalizedCricketEvent = {
  matchId: string;
  innings: number;
  over: number;
  ball: number;
  sequence: number;
  occurredAt: string;
  eventType: FeedEventType;
  battingPlayerId: string | null;
  bowlingPlayerId: string | null;
  fielderPlayerIds: string[];
  battingExternalId: string | null;
  bowlingExternalId: string | null;
  fielderExternalIds: string[];
  battingName?: string | null;
  bowlingName?: string | null;
  fielderNames?: string[];
  runsBatter: number;
  runsExtras: number;
  runsTotal: number;
  wicketType: string | null;
  isBoundary: boolean;
  isSix: boolean;
  isFour: boolean;
  rawDescription: string | null;
  normalizedDescription: string;
  source: string;
  sourceEventId: string | null;
  sourceTimestamp: string | null;
  confidence: number;
  consensusConfidence?: "CONFIDENCE_HIGH" | "CONFIDENCE_MEDIUM" | "CONFIDENCE_LOW" | "CONFLICT";
  consensusIdentityConfirmed?: boolean;
};

export type PollMatch = {
  matchId: string;
  cursor: number;
  battingExternalId: string;
  bowlingExternalId: string;
  externalMatchId?: string | null;
};

export type FeedRecoveryCursor = {
  innings: number;
  over: number;
  ball: number;
  providerEventId: string | null;
};

export interface LiveCricketSource {
  readonly source: FeedSourceName;
  poll(input: { matches: PollMatch[]; now: Date }): Promise<NormalizedCricketEvent[]>;
  recoverEvents?(input: { match: PollMatch; cursor: FeedRecoveryCursor | null; now: Date }): Promise<NormalizedCricketEvent[]>;
}

export function isFeedEventType(value: string): value is FeedEventType {
  return (FEED_EVENT_TYPES as readonly string[]).includes(value);
}

export function isFeedSourceName(value: string): value is FeedSourceName {
  return (FEED_SOURCES as readonly string[]).includes(value);
}

export function ingestionKey(event: {
  source: string;
  sourceEventId?: string | null;
  matchId: string;
  innings: number;
  over: number;
  ball: number;
  eventType: string;
  playerIdentity: string;
  sequence: number;
}): string {
  if (event.sourceEventId) return `${event.source}:${event.sourceEventId}`;
  return `fp:${event.matchId}:${event.innings}:${event.over}:${event.ball}:${event.eventType}:${event.playerIdentity}:${event.sequence}`;
}

export function pricingKey(input: {
  matchId: string;
  innings: number;
  over: number;
  ball: number;
  kind: string;
  playerId: string;
}): string {
  return `feed:${input.matchId}:${input.innings}:${input.over}:${input.ball}:${input.kind}:${input.playerId}`;
}

export function playerIdentity(event: {
  battingExternalId?: string | null;
  bowlingExternalId?: string | null;
  battingPlayerId?: string | null;
  eventType: string;
}): string {
  return event.battingExternalId || event.battingPlayerId || event.bowlingExternalId || event.eventType;
}

export function pricingActions(event: {
  eventType: string;
  battingPlayerId?: string | null;
  bowlingPlayerId?: string | null;
  fielderPlayerIds?: string[];
  wicketType?: string | null;
}): { playerId: string; kind: string }[] {
  const batter = event.battingPlayerId ?? null;
  const bowler = event.bowlingPlayerId ?? null;
  const fielder = event.fielderPlayerIds?.[0] ?? null;
  const actions: { playerId: string; kind: string }[] = [];
  const add = (playerId: string | null, kind: string) => {
    if (playerId) actions.push({ playerId, kind });
  };
  switch (event.eventType) {
    case "DOT_BALL":
      add(bowler, "DOT_BALL");
      break;
    case "SINGLE":
      add(batter, "SINGLE");
      break;
    case "DOUBLE":
      add(batter, "DOUBLE");
      break;
    case "TRIPLE":
      add(batter, "TRIPLE");
      break;
    case "FOUR":
      add(batter, "FOUR");
      break;
    case "SIX":
      add(batter, "SIX");
      break;
    case "FIFTY":
      add(batter, "FIFTY");
      break;
    case "CENTURY":
      add(batter, "CENTURY");
      break;
    case "MAIDEN_OVER":
      add(bowler, "MAIDEN_OVER");
      break;
    case "CATCH":
      add(fielder, "CATCH");
      break;
    case "RUN_OUT":
      add(fielder ?? bowler, "RUN_OUT");
      break;
    case "DROPPED_CATCH":
      add(fielder, "DROPPED_CATCH");
      break;
    case "WICKET":
      add(batter, "BATTER_WICKET");
      if (event.wicketType !== "RUN_OUT") add(bowler, "BOWLER_WICKET");
      break;
    default:
      break;
  }
  return actions;
}

export type SourceCandidate = {
  source: string;
  priority: number;
  enabled: boolean;
  status: SourceHealth;
};

export function nextSourceHealth(input: { enabled: boolean; consecutiveFailures: number }): SourceHealth {
  if (!input.enabled) return "DISABLED";
  if (input.consecutiveFailures >= SOURCE_DOWN_AFTER_FAILURES) return "DOWN";
  if (input.consecutiveFailures >= SOURCE_DEGRADED_AFTER_FAILURES) return "DEGRADED";
  return "HEALTHY";
}

export function chooseActiveSource(sources: SourceCandidate[]): string | null {
  const eligible = sources
    .filter((source) => source.enabled && (source.status === "HEALTHY" || source.status === "DEGRADED"))
    .sort((left, right) => left.priority - right.priority || left.source.localeCompare(right.source));
  const healthy = eligible.find((source) => source.status === "HEALTHY");
  return (healthy ?? eligible[0])?.source ?? null;
}

export function alreadyPriced(existingKeys: ReadonlySet<string>, key: string): boolean {
  return existingKeys.has(key);
}

const LIVE_PRICING_STATUSES = new Set<string>(["LIVE", "INNINGS_BREAK"]);

export function planPlayerLiveTransition(input: {
  previousMatchStatus: string;
  nextMatchStatus: string;
  playerAlreadyLive: boolean;
  stillLiveElsewhere: boolean;
}): { liveMatch: boolean; setAnchor: boolean; clearPerformance: boolean } {
  if (input.nextMatchStatus === "DELAYED") {
    return { liveMatch: input.playerAlreadyLive, setAnchor: false, clearPerformance: false };
  }
  const wasLive = LIVE_PRICING_STATUSES.has(input.previousMatchStatus);
  const nextLive = LIVE_PRICING_STATUSES.has(input.nextMatchStatus);
  if (nextLive) {
    const setAnchor = !wasLive && !input.playerAlreadyLive;
    return { liveMatch: true, setAnchor, clearPerformance: setAnchor };
  }
  if (input.stillLiveElsewhere) {
    return { liveMatch: true, setAnchor: false, clearPerformance: false };
  }
  if (!wasLive && input.nextMatchStatus !== "COMPLETED" && input.nextMatchStatus !== "ABANDONED") {
    return { liveMatch: input.playerAlreadyLive, setAnchor: false, clearPerformance: false };
  }
  return { liveMatch: false, setAnchor: false, clearPerformance: input.playerAlreadyLive };
}

export function eventFreshnessSeconds(input: { nowMs: number; lastEventAtMs: number | null; status: string }): number | null {
  if (input.status !== "LIVE" || input.lastEventAtMs === null) return null;
  return Math.max(0, Math.floor((input.nowMs - input.lastEventAtMs) / 1000));
}

export function correctionIngestionKey(originalKey: string, revision: number): string {
  return `${originalKey}:correction:${revision}`;
}

export const SOURCE_OPERATING_MODES = ["DISABLED", "SHADOW", "ACTIVE"] as const;
export type SourceOperatingMode = (typeof SOURCE_OPERATING_MODES)[number];

export const POLL_OUTCOMES = ["OK", "HTTP_ERROR", "TIMEOUT", "PARSE_ERROR", "NO_MATCH", "NO_NEW_EVENT", "MAPPING_REQUIRED"] as const;
export type PollOutcome = (typeof POLL_OUTCOMES)[number];

export function isSourceOperatingMode(value: string): value is SourceOperatingMode {
  return (SOURCE_OPERATING_MODES as readonly string[]).includes(value);
}

export function pollCountsAsFailure(outcome: string): boolean {
  return outcome === "HTTP_ERROR" || outcome === "TIMEOUT" || outcome === "PARSE_ERROR";
}

export function nextPollDelayMs(intervalSeconds: number, consecutiveFailures: number): number {
  const base = Math.max(1, intervalSeconds) * 1000;
  if (consecutiveFailures <= 0) return base;
  return base * 2 ** Math.min(consecutiveFailures, 3);
}

export function mayApplyFeedPricing(input: {
  source: string;
  operatingMode: string;
  engineAllowsPricing: boolean;
  realSourcePricingEnabled: boolean;
}): boolean {
  if (!input.engineAllowsPricing || input.operatingMode !== "ACTIVE") return false;
  if (input.source === "DevelopmentSimulator") return true;
  return input.realSourcePricingEnabled;
}

export function wouldPriceAs(event: {
  eventType: string;
  battingPlayerId?: string | null;
  bowlingPlayerId?: string | null;
  fielderPlayerIds?: string[];
  wicketType?: string | null;
}): string[] {
  const priced = pricingActions(event);
  if (priced.length > 0) return priced.map((row) => row.kind);
  return pricingActions({
    eventType: event.eventType,
    battingPlayerId: event.battingPlayerId ?? "preview-batter",
    bowlingPlayerId: event.bowlingPlayerId ?? "preview-bowler",
    fielderPlayerIds: event.fielderPlayerIds?.length ? event.fielderPlayerIds : ["preview-fielder"],
    wicketType: event.wicketType,
  }).map((row) => row.kind);
}

export function activationBlockers(input: {
  matches: { label: string; participatingMapped: number; unresolved: number }[];
  health: string;
  lastOutcome: string | null;
  continuity?: string | null;
  reconciliation?: string | null;
}): string[] {
  const blockers: string[] = [];
  if (input.matches.length === 0) blockers.push("Import the match before activating this source.");
  for (const match of input.matches) {
    if (match.participatingMapped < 1) blockers.push(`Map at least one participating PlayerPulser player for ${match.label}.`);
    if (match.unresolved > 0) blockers.push(`Resolve unmapped feed players for ${match.label} before activation.`);
  }
  if (input.health !== "HEALTHY" && input.health !== "DEGRADED") blockers.push("Source health must be healthy or degraded.");
  if (!input.lastOutcome || pollCountsAsFailure(input.lastOutcome) || input.lastOutcome === "NO_MATCH") {
    blockers.push("Recent events have not parsed successfully.");
  }
  if (input.continuity === "UNRESOLVED_GAP" || input.continuity === "POSSIBLE_GAP") {
    blockers.push("Resolve the feed gap before activation.");
  }
  if (input.reconciliation === "CONFLICT" || input.reconciliation === "BEHIND") {
    blockers.push("Snapshot reconciliation must be matched before activation.");
  }
  return blockers;
}

export function normalizePlayerName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function suggestPlayerMatch(name: string, players: { id: string; name: string }[]): { id: string; name: string } | null {
  const key = normalizePlayerName(name);
  if (key.length < 3) return null;
  const hits = players.filter((player) => normalizePlayerName(player.name) === key);
  return hits.length === 1 ? hits[0] ?? null : null;
}

export function ingestLatencyMs(sourceTimestampMs: number | null, ingestedAtMs: number): number | null {
  if (sourceTimestampMs === null) return null;
  return Math.max(0, ingestedAtMs - sourceTimestampMs);
}

export function latencyP50Ms(samples: number[]): number | null {
  const clean = samples.filter((value) => Number.isFinite(value) && value >= 0).sort((left, right) => left - right);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  if (clean.length % 2 === 1) return clean[mid] ?? null;
  const left = clean[mid - 1] ?? 0;
  const right = clean[mid] ?? left;
  return Math.round((left + right) / 2);
}

export function deliveryChanged(
  stored: { eventType: string; runsBatter: number; runsExtras: number; runsTotal: number; wicketType: string | null },
  incoming: { eventType: string; runsBatter: number; runsExtras: number; runsTotal: number; wicketType: string | null },
): boolean {
  return stored.eventType !== incoming.eventType
    || stored.runsBatter !== incoming.runsBatter
    || stored.runsExtras !== incoming.runsExtras
    || stored.runsTotal !== incoming.runsTotal
    || (stored.wicketType ?? null) !== (incoming.wicketType ?? null);
}

const SIMULATOR_SCRIPT: FeedEventType[] = ["DOT_BALL", "SINGLE", "FOUR", "SIX", "WICKET", "FIFTY", "CATCH", "MAIDEN_OVER"];

const RUNS: Partial<Record<FeedEventType, { batter: number; extras: number; total: number; boundary: boolean; six: boolean; four: boolean }>> = {
  DOT_BALL: { batter: 0, extras: 0, total: 0, boundary: false, six: false, four: false },
  SINGLE: { batter: 1, extras: 0, total: 1, boundary: false, six: false, four: false },
  DOUBLE: { batter: 2, extras: 0, total: 2, boundary: false, six: false, four: false },
  TRIPLE: { batter: 3, extras: 0, total: 3, boundary: false, six: false, four: false },
  FOUR: { batter: 4, extras: 0, total: 4, boundary: true, six: false, four: true },
  SIX: { batter: 6, extras: 0, total: 6, boundary: true, six: true, four: false },
  WICKET: { batter: 0, extras: 0, total: 0, boundary: false, six: false, four: false },
  FIFTY: { batter: 0, extras: 0, total: 0, boundary: false, six: false, four: false },
  CENTURY: { batter: 0, extras: 0, total: 0, boundary: false, six: false, four: false },
  CATCH: { batter: 0, extras: 0, total: 0, boundary: false, six: false, four: false },
  MAIDEN_OVER: { batter: 0, extras: 0, total: 0, boundary: false, six: false, four: false },
};

export function nextSimulatorDelivery(input: PollMatch & { now: Date }): NormalizedCricketEvent {
  const eventType = SIMULATOR_SCRIPT[input.cursor % SIMULATOR_SCRIPT.length] ?? "DOT_BALL";
  const runs = RUNS[eventType] ?? RUNS.DOT_BALL!;
  const over = Math.floor(input.cursor / 6);
  const ball = eventType === "MAIDEN_OVER" ? 6 : (input.cursor % 6) + 1;
  const occurredAt = input.now.toISOString();
  return {
    matchId: input.matchId,
    innings: 1,
    over,
    ball,
    sequence: input.cursor + 1,
    occurredAt,
    eventType,
    battingPlayerId: null,
    bowlingPlayerId: null,
    fielderPlayerIds: [],
    battingExternalId: input.battingExternalId,
    bowlingExternalId: input.bowlingExternalId,
    fielderExternalIds: eventType === "CATCH" || eventType === "DROPPED_CATCH" ? [input.bowlingExternalId] : [],
    runsBatter: runs.batter,
    runsExtras: runs.extras,
    runsTotal: runs.total,
    wicketType: eventType === "WICKET" ? "BOWLED" : null,
    isBoundary: runs.boundary,
    isSix: runs.six,
    isFour: runs.four,
    rawDescription: null,
    normalizedDescription: `${eventType.replaceAll("_", " ").toLowerCase()} at ${over}.${ball}`,
    source: "DevelopmentSimulator",
    sourceEventId: `sim:${input.matchId}:${input.cursor}`,
    sourceTimestamp: occurredAt,
    confidence: 100,
  };
}

export class DevelopmentSimulator implements LiveCricketSource {
  readonly source = "DevelopmentSimulator" as const;
  async poll(input: { matches: PollMatch[]; now: Date }): Promise<NormalizedCricketEvent[]> {
    return input.matches.map((match) => nextSimulatorDelivery({ ...match, now: input.now }));
  }
}

export class UnconfiguredFeedSource implements LiveCricketSource {
  constructor(readonly source: FeedSourceName) {}
  async poll(): Promise<NormalizedCricketEvent[]> {
    throw new Error(`${this.source} is not configured`);
  }
}

export function sourceAdapter(name: string): LiveCricketSource {
  if (name === "DevelopmentSimulator") return new DevelopmentSimulator();
  if (!isFeedSourceName(name)) throw new Error("Unknown cricket source");
  return new UnconfiguredFeedSource(name);
}

type CrexBallPayload = {
  mid: string;
  inn: number;
  ov: number;
  bl: number;
  code: string;
  batsman?: string;
  bowler?: string;
  eid: string;
  ts: string;
  text?: string;
};

const CREX_CODE: Record<string, FeedEventType> = {
  "0": "DOT_BALL",
  "1": "SINGLE",
  "2": "DOUBLE",
  "3": "TRIPLE",
  "4": "FOUR",
  "6": "SIX",
  W: "WICKET",
  "50": "FIFTY",
  "100": "CENTURY",
};

export function normalizeCrexBall(matchId: string, payload: CrexBallPayload): NormalizedCricketEvent {
  const eventType = CREX_CODE[payload.code] ?? "DOT_BALL";
  const runs = RUNS[eventType] ?? RUNS.DOT_BALL!;
  return {
    matchId,
    innings: payload.inn,
    over: payload.ov,
    ball: payload.bl,
    sequence: payload.bl,
    occurredAt: payload.ts,
    eventType,
    battingPlayerId: null,
    bowlingPlayerId: null,
    fielderPlayerIds: [],
    battingExternalId: payload.batsman ?? null,
    bowlingExternalId: payload.bowler ?? null,
    fielderExternalIds: [],
    runsBatter: runs.batter,
    runsExtras: runs.extras,
    runsTotal: runs.total,
    wicketType: eventType === "WICKET" ? "BOWLED" : null,
    isBoundary: runs.boundary,
    isSix: runs.six,
    isFour: runs.four,
    rawDescription: payload.text ?? null,
    normalizedDescription: `${eventType.replaceAll("_", " ").toLowerCase()} at ${payload.ov}.${payload.bl}`,
    source: "CREX",
    sourceEventId: payload.eid,
    sourceTimestamp: payload.ts,
    confidence: 80,
  };
}
