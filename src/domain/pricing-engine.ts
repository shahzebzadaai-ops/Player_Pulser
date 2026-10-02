import { divRoundHalfAwayFromZero } from "./money";

/**
 * Event-driven fair value.
 *
 * new mid = round_half_away(previous mid * (1_000_000 + totalBps * 100) / 1_000_000)
 * totalBps = performanceBps + demandBps + newsBps
 *
 * Each contribution is already in basis points. The 55 / 25 / 20 weights are the
 * target importance of the three engines. They are not a second multiplier on
 * top of the published event tables.
 *
 * Company profit and loss are not inputs.
 * Risk exposure is not an input.
 */

export const CONTRIBUTION_WEIGHTS = { performance: 55, demand: 25, news: 20 } as const;

export const ENGINE_MODES = ["SIMULATION", "EVENT_DRIVEN"] as const;
export type EngineMode = (typeof ENGINE_MODES)[number];

export function directSimulatedPricingEnabled(mode: EngineMode): boolean {
  return mode === "SIMULATION";
}

export function feedPricingEnabled(mode: EngineMode): boolean {
  return mode === "EVENT_DRIVEN";
}

export function engineModeSummary(mode: EngineMode): string {
  if (mode === "EVENT_DRIVEN") {
    return "EVENT_DRIVEN. Normalized cricket events move prices. Direct simulated ticks are stopped.";
  }
  return "SIMULATION. Direct simulated ticks may run. Stored cricket events do not move prices.";
}

export const CONTEXTS = ["NORMAL", "IMPORTANT", "HIGH_PRESSURE", "MATCH_DEFINING"] as const;
export type MatchContext = (typeof CONTEXTS)[number];

export const NEWS_CATEGORIES = [
  "INJURY",
  "SELECTION",
  "NOT_SELECTED",
  "SUSPENSION",
  "RETURN",
  "CAPTAINCY",
  "RECORD",
  "FORM",
  "CONTROVERSY",
  "OFFICIAL_ANNOUNCEMENT",
] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export type PerformanceRule = { bps: number; contextApplies: boolean; label: string };

export const PERFORMANCE_RULES: Record<string, PerformanceRule> = {
  SINGLE: { bps: 3, contextApplies: true, label: "Single" },
  DOUBLE: { bps: 6, contextApplies: true, label: "Double" },
  TRIPLE: { bps: 9, contextApplies: true, label: "Triple" },
  FOUR: { bps: 18, contextApplies: true, label: "Four" },
  SIX: { bps: 30, contextApplies: true, label: "Six" },
  DUCK: { bps: -100, contextApplies: true, label: "Duck" },
  BATTER_WICKET: { bps: -80, contextApplies: true, label: "Batter wicket" },
  FIFTY: { bps: 50, contextApplies: true, label: "Fifty" },
  CENTURY: { bps: 100, contextApplies: true, label: "Century" },
  DOT_BALL: { bps: 3, contextApplies: true, label: "Dot ball" },
  BOWLER_WICKET: { bps: 80, contextApplies: true, label: "Bowler wicket" },
  MAIDEN_OVER: { bps: 30, contextApplies: true, label: "Maiden over" },
  CATCH: { bps: 20, contextApplies: true, label: "Catch" },
  RUN_OUT: { bps: 30, contextApplies: true, label: "Run out" },
  DROPPED_CATCH: { bps: -15, contextApplies: true, label: "Dropped catch" },
};

export const CONTEXT_SCALE_MILLI: Record<MatchContext, number> = {
  NORMAL: 1000,
  IMPORTANT: 1250,
  HIGH_PRESSURE: 1500,
  MATCH_DEFINING: 2000,
};

export type NewsBand = { mildBps: number; strongBps: number };

export const NEWS_BANDS: Record<NewsCategory, NewsBand> = {
  INJURY: { mildBps: -100, strongBps: -500 },
  SELECTION: { mildBps: 50, strongBps: 200 },
  NOT_SELECTED: { mildBps: -100, strongBps: -250 },
  SUSPENSION: { mildBps: -150, strongBps: -500 },
  RETURN: { mildBps: 50, strongBps: 200 },
  CAPTAINCY: { mildBps: 40, strongBps: 180 },
  RECORD: { mildBps: 30, strongBps: 150 },
  FORM: { mildBps: 20, strongBps: 120 },
  CONTROVERSY: { mildBps: -40, strongBps: -200 },
  OFFICIAL_ANNOUNCEMENT: { mildBps: 20, strongBps: 100 },
};

export const DEFAULT_ENGINE_LIMITS = {
  performanceMatchCapBps: 1200,
  circuitBreakerBps: 1800,
  demandWindowSeconds: 300,
  demandMaxBps: 25,
  demandDayCapBps: 200,
  demandMinTrades: 2,
  newsEventCapBps: 500,
  quoteTtlSeconds: 30,
  quoteTtlLiveSeconds: 8,
  floorPaise: 100n,
};

export function resolveEngineMode(setting: unknown, env: string | undefined): EngineMode {
  if (env === "EVENT_DRIVEN" || env === "SIMULATION") return env;
  if (setting === "EVENT_DRIVEN") return "EVENT_DRIVEN";
  return "SIMULATION";
}

export function isMatchContext(value: string): value is MatchContext {
  return (CONTEXTS as readonly string[]).includes(value);
}

export function contextMultiplier(context: MatchContext, scales: Record<MatchContext, number> = CONTEXT_SCALE_MILLI): number {
  return scales[context] / 1000;
}

export function scaleBps(bps: number, milli: number): number {
  const scaled = bps * milli;
  const negative = scaled < 0;
  const absolute = Math.abs(scaled);
  const rounded = Math.floor((absolute + 500) / 1000);
  return negative ? -rounded : rounded;
}

export function performanceContribution(
  eventType: string,
  context: MatchContext,
  rules: Record<string, PerformanceRule> = PERFORMANCE_RULES,
  scales: Record<MatchContext, number> = CONTEXT_SCALE_MILLI,
): { bps: number; multiplier: number } {
  const rule = rules[eventType];
  if (!rule) return { bps: 0, multiplier: 1 };
  const milli = rule.contextApplies ? scales[context] : 1000;
  return { bps: scaleBps(rule.bps, milli), multiplier: milli / 1000 };
}

export function clampPerformanceRunning(
  runningBps: number,
  eventBps: number,
  capBps: number,
): { appliedBps: number; nextRunningBps: number; clamped: boolean } {
  const cap = Math.abs(capBps);
  const next = Math.max(-cap, Math.min(cap, runningBps + eventBps));
  const appliedBps = next - runningBps;
  return { appliedBps, nextRunningBps: next, clamped: appliedBps !== eventBps };
}

export function demandContribution(input: {
  buyVolumePaise: bigint;
  sellVolumePaise: bigint;
  tradeCount: number;
  minTrades: number;
  maxBps: number;
  dayContributionBps: number;
  dayCapBps: number;
}): { bps: number; imbalance: number; clamped: boolean } {
  const total = input.buyVolumePaise + input.sellVolumePaise;
  if (total <= 0n || input.tradeCount < input.minTrades || input.maxBps <= 0) {
    return { bps: 0, imbalance: 0, clamped: false };
  }
  const imbalance = Number(input.buyVolumePaise - input.sellVolumePaise) / Number(total);
  const raw = Number(divRoundHalfAwayFromZero((input.buyVolumePaise - input.sellVolumePaise) * BigInt(input.maxBps), total));
  const dayCap = Math.abs(input.dayCapBps);
  const next = Math.max(-dayCap, Math.min(dayCap, input.dayContributionBps + raw));
  const bps = next - input.dayContributionBps;
  return { bps, imbalance, clamped: bps !== raw };
}

export function newsContribution(input: {
  category: string;
  severity: number;
  direction: "POSITIVE" | "NEGATIVE";
  confidence: number;
  verified: boolean;
  enabled: boolean;
  capBps: number;
  bands?: Record<string, NewsBand>;
}): { bps: number } {
  if (!input.verified || !input.enabled) return { bps: 0 };
  const bands = input.bands ?? NEWS_BANDS;
  const band = bands[input.category as NewsCategory];
  if (!band) return { bps: 0 };
  const steps = 4;
  const severity = Math.max(1, Math.min(5, Math.round(input.severity)));
  const span = band.strongBps - band.mildBps;
  const raw = band.mildBps + Math.round((span * (severity - 1)) / steps);
  const signed = input.direction === "NEGATIVE" ? -Math.abs(raw) : Math.abs(raw);
  const confidence = Math.max(0, Math.min(100, Math.round(input.confidence)));
  const scaled = scaleBps(signed, confidence * 10);
  const cap = Math.abs(input.capBps);
  const bps = Math.max(-cap, Math.min(cap, scaled));
  return { bps };
}

export function moveMidPaise(midPaise: bigint, totalBps: number): bigint {
  const ppm = BigInt(totalBps) * 100n;
  return divRoundHalfAwayFromZero(midPaise * (1_000_000n + ppm), 1_000_000n);
}

export function clampToAnchor(midPaise: bigint, anchorPaise: bigint, capBps: number): { midPaise: bigint; clamped: boolean } {
  const capPpm = BigInt(Math.abs(capBps)) * 100n;
  const upper = divRoundHalfAwayFromZero(anchorPaise * (1_000_000n + capPpm), 1_000_000n);
  const lower = divRoundHalfAwayFromZero(anchorPaise * (1_000_000n - capPpm), 1_000_000n);
  if (midPaise > upper) return { midPaise: upper, clamped: true };
  if (midPaise < lower) return { midPaise: lower, clamped: true };
  return { midPaise, clamped: false };
}

export type FairValueInput = {
  midPaise: bigint;
  anchorPaise: bigint;
  performanceBps: number;
  demandBps: number;
  newsBps: number;
  circuitBreakerBps: number;
  floorPaise?: bigint;
};

export type FairValue = {
  previousMidPaise: bigint;
  midPaise: bigint;
  performanceBps: number;
  demandBps: number;
  newsBps: number;
  wasClamped: boolean;
  clampReason: string | null;
};

export function fairValue(input: FairValueInput): FairValue {
  const total = input.performanceBps + input.demandBps + input.newsBps;
  let next = moveMidPaise(input.midPaise, total);
  const floor = input.floorPaise ?? DEFAULT_ENGINE_LIMITS.floorPaise;
  if (next < floor) next = floor;
  const bounded = clampToAnchor(next, input.anchorPaise, input.circuitBreakerBps);
  const floorClamped = next !== moveMidPaise(input.midPaise, total);
  return {
    previousMidPaise: input.midPaise,
    midPaise: bounded.midPaise,
    performanceBps: input.performanceBps,
    demandBps: input.demandBps,
    newsBps: input.newsBps,
    wasClamped: bounded.clamped || floorClamped,
    clampReason: bounded.clamped ? "circuit" : floorClamped ? "floor" : null,
  };
}

export function gateContributions(
  input: { performanceBps: number; demandBps: number; newsBps: number },
  flags: { demandPriceMovementEnabled: boolean; newsPriceMovementEnabled: boolean },
): { performanceBps: number; demandBps: number; newsBps: number } {
  return {
    performanceBps: input.performanceBps,
    demandBps: flags.demandPriceMovementEnabled ? input.demandBps : 0,
    newsBps: flags.newsPriceMovementEnabled ? input.newsBps : 0,
  };
}

export function fairValueIgnoringRisk(input: FairValueInput, _exposure: unknown): FairValue {
  return fairValue(input);
}

export function quoteLifetimeSeconds(live: boolean, nonLiveSeconds: number, liveSeconds: number): number {
  return live ? liveSeconds : nonLiveSeconds;
}

const PHASE: Record<Exclude<MatchContext, "NORMAL">, string> = {
  IMPORTANT: "in an important phase",
  HIGH_PRESSURE: "in a high-pressure phase",
  MATCH_DEFINING: "in a match-defining phase",
};

export function explainPerformance(eventType: string, context: MatchContext, rules = PERFORMANCE_RULES): string {
  const rule = rules[eventType];
  const label = rule?.label ?? eventType;
  if (!rule?.contextApplies || context === "NORMAL") return label;
  return `${label} ${PHASE[context]}`;
}

export function explainDemand(bps: number): string | null {
  if (bps > 0) return "Positive buying activity";
  if (bps < 0) return "More selling than buying";
  return null;
}

export function explainNews(category: string, headline: string): string {
  if (category === "NOT_SELECTED") return "Player not selected";
  return headline;
}

export type MovementFact = {
  performanceEvent?: string | null;
  context?: string | null;
  demandBps?: number | null;
  newsCategory?: string | null;
  newsHeadline?: string | null;
  wasClamped?: boolean | null;
};

export function explainMovement(facts: MovementFact[]): string[] {
  const lines: string[] = [];
  for (const fact of facts) {
    if (fact.performanceEvent) {
      const context = fact.context && isMatchContext(fact.context) ? fact.context : "NORMAL";
      lines.push(explainPerformance(fact.performanceEvent, context));
    }
    if (typeof fact.demandBps === "number") {
      const line = explainDemand(fact.demandBps);
      if (line) lines.push(line);
    }
    if (fact.newsCategory) lines.push(explainNews(fact.newsCategory, fact.newsHeadline ?? fact.newsCategory));
    if (fact.wasClamped) lines.push("Move clamped to the price limit");
  }
  return lines;
}

export function eventApplicationKey(kind: "match" | "news" | "demand", id: string): string {
  return `${kind}:${id}`;
}

export function claimEvent(applied: ReadonlySet<string>, key: string): { keys: Set<string>; fresh: boolean } {
  if (applied.has(key)) return { keys: new Set(applied), fresh: false };
  const keys = new Set(applied);
  keys.add(key);
  return { keys, fresh: true };
}
