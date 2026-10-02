/**
 * Feed continuity and real-source pricing eligibility.
 * Score snapshots and gaps never change a price by themselves.
 */

export const CONTINUITY_STATES = ["CONTINUOUS", "POSSIBLE_GAP", "RECOVERING", "UNRESOLVED_GAP"] as const;
export type ContinuityState = (typeof CONTINUITY_STATES)[number];

export const RECONCILIATION_STATES = ["MATCHED", "BEHIND", "CONFLICT", "UNKNOWN"] as const;
export type ReconciliationState = (typeof RECONCILIATION_STATES)[number];

export const GAP_SAFETY_POLICY = "PAUSE_NEW_BUYS_FOR_AFFECTED_PLAYERS";
export const RECOVERY_LIMIT = 12;

const LIVE_MATCH_STATUSES = new Set(["LIVE", "INNINGS_BREAK"]);
const EXTRA_EVENTS = new Set(["WIDE", "NO_BALL", "BYE", "LEG_BYE"]);

export type DeliveryPoint = {
  innings: number;
  over: number;
  ball: number;
  eventType?: string;
  sourceEventId?: string | null;
  sequence?: number | null;
};

export function compareDeliveries(left: DeliveryPoint, right: DeliveryPoint): number {
  if (left.innings !== right.innings) return left.innings - right.innings;
  if (left.over !== right.over) return left.over - right.over;
  return left.ball - right.ball;
}

export function isAfterDelivery(next: DeliveryPoint, cursor: DeliveryPoint): boolean {
  return compareDeliveries(next, cursor) > 0;
}

export function isUnderway(point: DeliveryPoint): boolean {
  return point.innings > 1 || point.over > 0 || point.ball > 1;
}

function isOrdinalSequence(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value < 10_000;
}

function sameSlot(left: DeliveryPoint, right: DeliveryPoint): boolean {
  return left.innings === right.innings && left.over === right.over && left.ball === right.ball;
}

function nextLegalSlot(previous: DeliveryPoint, next: DeliveryPoint): boolean {
  if (next.innings === previous.innings && next.over === previous.over && next.ball === previous.ball + 1) return true;
  if (next.innings === previous.innings && previous.ball >= 6 && next.over === previous.over + 1 && next.ball === 1) return true;
  if (next.innings === previous.innings + 1 && next.over === 0 && next.ball === 1) return true;
  return false;
}

export function detectDeliveryGap(previous: DeliveryPoint | null, next: DeliveryPoint): "CONTINUOUS" | "POSSIBLE_GAP" {
  if (!previous) return "CONTINUOUS";
  if (previous.sourceEventId && previous.sourceEventId === next.sourceEventId) return "CONTINUOUS";
  if (compareDeliveries(next, previous) < 0) return "CONTINUOUS";
  const extras = EXTRA_EVENTS.has(previous.eventType ?? "") || EXTRA_EVENTS.has(next.eventType ?? "");
  if (sameSlot(previous, next)) {
    if (!extras && isOrdinalSequence(previous.sequence) && isOrdinalSequence(next.sequence) && next.sequence > previous.sequence + 1) {
      return "POSSIBLE_GAP";
    }
    return "CONTINUOUS";
  }
  if (nextLegalSlot(previous, next)) {
    if (isOrdinalSequence(previous.sequence) && isOrdinalSequence(next.sequence) && next.sequence > previous.sequence + 1) {
      return "POSSIBLE_GAP";
    }
    return "CONTINUOUS";
  }
  return "POSSIBLE_GAP";
}

export function nextContinuity(input: { gap: boolean; recoveryRan: boolean; filled: boolean }): ContinuityState {
  if (!input.gap) return "CONTINUOUS";
  if (!input.recoveryRan) return "POSSIBLE_GAP";
  if (input.filled) return "CONTINUOUS";
  return "UNRESOLVED_GAP";
}

export function slotsBetween(previous: DeliveryPoint, next: DeliveryPoint): number {
  return (next.innings - previous.innings) * 120 + (next.over - previous.over) * 6 + (next.ball - previous.ball);
}

export function boundRecovery<T extends DeliveryPoint>(events: T[], cursor: DeliveryPoint | null, limit = RECOVERY_LIMIT): T[] {
  if (!cursor) return [];
  return events
    .filter((event) => isAfterDelivery(event, cursor) && slotsBetween(cursor, event) <= limit)
    .sort(compareDeliveries)
    .slice(0, limit);
}

export function parseOvers(value: string): { over: number; ball: number } | null {
  const match = /^(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return null;
  const over = Number(match[1]);
  const ball = Number(match[2]);
  if (!Number.isInteger(over) || !Number.isInteger(ball)) return null;
  return { over, ball };
}

export function reconcileSnapshot(input: {
  snapshot: { runs: number; wickets: number; overs: string } | null;
  highWater: { innings: number; over: number; ball: number } | null;
  summedRuns: number | null;
  summedWickets: number | null;
  startedMidMatch: boolean;
}): ReconciliationState {
  if (!input.snapshot || !input.highWater) return "UNKNOWN";
  const provider = parseOvers(input.snapshot.overs);
  if (!provider) return "UNKNOWN";
  const behindBalls = provider.over * 6 + provider.ball - (input.highWater.over * 6 + input.highWater.ball);
  if (!input.startedMidMatch && input.summedRuns !== null && Math.abs(input.snapshot.runs - input.summedRuns) >= 12) return "CONFLICT";
  if (!input.startedMidMatch && input.summedWickets !== null && input.snapshot.wickets !== input.summedWickets && behindBalls <= 1) return "CONFLICT";
  if (behindBalls > 6) return "BEHIND";
  if (behindBalls < -1) return "CONFLICT";
  if (behindBalls > 1) return "BEHIND";
  return "MATCHED";
}

export type PricingEligibilityInput = {
  source: string;
  operatingMode: string;
  engineAllowsPricing: boolean;
  realSourcePricingEnabled: boolean;
  eventIngestedAtMs: number;
  sourceActivatedAtMs: number | null;
  globalPricingEnabledAtMs: number | null;
  activationCursor: DeliveryPoint | null;
  baselinePending: boolean;
  event: DeliveryPoint;
  superseded: boolean;
  mapped: boolean;
  alreadyPriced: boolean;
  matchStatus: string;
  continuity: string;
  historicalContext: boolean;
  consensusConfidence?: string | null;
  priceableConfidences?: readonly string[];
  consensusIdentityConfirmed?: boolean;
};

export function canProviderEventAffectPricing(input: PricingEligibilityInput): boolean {
  if (input.superseded || input.alreadyPriced) return false;
  if (input.source === "DevelopmentSimulator") {
    return input.engineAllowsPricing && input.operatingMode === "ACTIVE";
  }
  if (input.source !== "Consensus") return false;
  const allowed = input.priceableConfidences ?? ["CONFIDENCE_HIGH", "CONFIDENCE_MEDIUM"];
  const confidence = input.consensusConfidence ?? "";
  if (confidence === "CONFIDENCE_LOW" || confidence === "CONFLICT" || !allowed.includes(confidence)) return false;
  if (input.consensusIdentityConfirmed !== true) return false;
  if (!input.engineAllowsPricing || input.operatingMode !== "ACTIVE" || !input.realSourcePricingEnabled) return false;
  if (!LIVE_MATCH_STATUSES.has(input.matchStatus)) return false;
  if (!input.mapped || input.historicalContext || input.baselinePending) return false;
  if (input.continuity === "UNRESOLVED_GAP") return false;
  if (input.sourceActivatedAtMs === null || input.eventIngestedAtMs < input.sourceActivatedAtMs) return false;
  if (input.globalPricingEnabledAtMs === null || input.eventIngestedAtMs < input.globalPricingEnabledAtMs) return false;
  if (input.activationCursor && !isAfterDelivery(input.event, input.activationCursor)) return false;
  return true;
}

export function gapPausesNewBuys(input: { continuity: string; operatingMode: string; policy: string }): boolean {
  return input.operatingMode === "ACTIVE" && input.continuity === "UNRESOLVED_GAP" && input.policy === GAP_SAFETY_POLICY;
}

export function latencyP95Ms(samples: number[]): number | null {
  const clean = samples.filter((value) => Number.isFinite(value) && value >= 0).sort((left, right) => left - right);
  if (clean.length < 5) return null;
  const index = Math.min(clean.length - 1, Math.ceil(clean.length * 0.95) - 1);
  return clean[index] ?? null;
}

export function activationChecklist(input: {
  imported: boolean;
  participatingMapped: number;
  unresolved: number;
  health: string;
  lastOutcome: string | null;
  continuity: string;
  reconciliation: string;
  shadowEvents: number;
  shadowStartedAtMs: number | null;
  nowMs: number;
  realSourcePricingEnabled: boolean;
}): { label: string; ok: boolean; detail: string }[] {
  const minutes = input.shadowStartedAtMs === null ? null : Math.max(0, Math.floor((input.nowMs - input.shadowStartedAtMs) / 60_000));
  const recentParse = Boolean(input.lastOutcome) && input.lastOutcome !== "HTTP_ERROR" && input.lastOutcome !== "TIMEOUT" && input.lastOutcome !== "PARSE_ERROR" && input.lastOutcome !== "NO_MATCH";
  return [
    { label: "Match imported", ok: input.imported, detail: input.imported ? "Imported" : "Not imported" },
    { label: "Participating players mapped", ok: input.participatingMapped > 0 && input.unresolved === 0, detail: `${input.participatingMapped} mapped, ${input.unresolved} unresolved` },
    { label: "Source healthy", ok: input.health === "HEALTHY" || input.health === "DEGRADED", detail: input.health },
    { label: "Recent parser success", ok: recentParse, detail: input.lastOutcome ?? "none" },
    { label: "Feed continuity", ok: input.continuity === "CONTINUOUS" || input.continuity === "RECOVERING", detail: input.continuity },
    { label: "No unresolved gap", ok: input.continuity !== "UNRESOLVED_GAP" && input.continuity !== "POSSIBLE_GAP", detail: input.continuity },
    { label: "Snapshot reconciliation", ok: input.reconciliation === "MATCHED" || input.reconciliation === "UNKNOWN", detail: input.reconciliation },
    {
      label: "Shadow observation",
      ok: true,
      detail: minutes === null ? `${input.shadowEvents} events. Duration is not decided automatically.` : `${input.shadowEvents} events over ${minutes} min. Duration is not decided automatically.`,
    },
    { label: "Global real-source pricing", ok: true, detail: input.realSourcePricingEnabled ? "On" : "Off. This lock stays separate from source activation." },
  ];
}

export function shadowQuality(input: {
  observed: number;
  mapped: number;
  duplicates: number;
  corrections: number;
  possibleGaps: number;
  recoveredGaps: number;
  unresolvedGaps: number;
  parseFailures: number;
  pollLatencyMs: number | null;
  ingestP50Ms: number | null;
  ingestP95Ms: number | null;
  startedAtMs: number | null;
  nowMs: number;
}) {
  const observed = Math.max(0, input.observed);
  const mappedPct = observed === 0 ? 0 : Math.round((input.mapped / observed) * 100);
  return {
    eventsObserved: observed,
    mappedPct,
    unmappedPct: observed === 0 ? 0 : 100 - mappedPct,
    duplicateDeliveries: input.duplicates,
    corrections: input.corrections,
    possibleGaps: input.possibleGaps,
    recoveredGaps: input.recoveredGaps,
    unresolvedGaps: input.unresolvedGaps,
    parseFailures: input.parseFailures,
    pollLatencyMs: input.pollLatencyMs,
    ingestP50Ms: input.ingestP50Ms,
    ingestP95Ms: input.ingestP95Ms,
    shadowRuntimeMinutes: input.startedAtMs === null ? null : Math.max(0, Math.floor((input.nowMs - input.startedAtMs) / 60_000)),
  };
}
