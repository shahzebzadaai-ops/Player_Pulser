/**
 * Multi-source consensus over events that adapters have already normalized.
 * Provider payloads never reach this module.
 */

export const CONSENSUS_PROVIDERS = ["CREX", "Sportskeeda", "Cricbuzz"] as const;
export type ConsensusProvider = (typeof CONSENSUS_PROVIDERS)[number];

export const CONSENSUS_CONFIDENCE = ["CONFIDENCE_HIGH", "CONFIDENCE_MEDIUM", "CONFIDENCE_LOW", "CONFLICT"] as const;
export type ConsensusConfidence = (typeof CONSENSUS_CONFIDENCE)[number];

export const DEFAULT_CONSENSUS_PRIORITIES: Record<ConsensusProvider, number> = {
  CREX: 1,
  Sportskeeda: 2,
  Cricbuzz: 3,
};

export const DEFAULT_PRICEABLE_CONFIDENCE: ConsensusConfidence[] = ["CONFIDENCE_HIGH", "CONFIDENCE_MEDIUM"];

export const RAW_PRICING_SOURCES = ["CREX", "Cricbuzz", "Sportskeeda", "PaidProvider"] as const;

export type ConsensusCandidate = {
  source: ConsensusProvider;
  sourceEventId: string;
  matchId: string;
  innings: number;
  over: number;
  ball: number;
  eventType: string;
  runsTotal: number;
  wicketType: string | null;
  battingPlayerId: string | null;
  bowlingPlayerId: string | null;
  battingName: string | null;
  bowlingName: string | null;
};

export type ConsensusDecision = {
  matchId: string;
  innings: number;
  over: number;
  ball: number;
  acceptedEvent: ConsensusCandidate | null;
  confidence: ConsensusConfidence;
  supportingSources: ConsensusProvider[];
  conflictingSources: ConsensusProvider[];
  sourceEventIds: string[];
  priceableIdentity: boolean;
};

export function normalizePersonName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
}

function samePerson(leftId: string | null, leftName: string | null, rightId: string | null, rightName: string | null): boolean {
  if (leftId && rightId) return leftId === rightId;
  const left = normalizePersonName(leftName);
  const right = normalizePersonName(rightName);
  if (left && right) return left === right;
  if (!left && !right && !leftId && !rightId) return true;
  return false;
}

function sameDelivery(left: ConsensusCandidate, right: ConsensusCandidate): boolean {
  return left.eventType === right.eventType
    && left.runsTotal === right.runsTotal
    && (left.wicketType ?? "") === (right.wicketType ?? "")
    && samePerson(left.battingPlayerId, left.battingName, right.battingPlayerId, right.battingName)
    && samePerson(left.bowlingPlayerId, left.bowlingName, right.bowlingPlayerId, right.bowlingName);
}

function slotKey(event: ConsensusCandidate): string {
  return `${event.matchId}|${event.innings}|${event.over}|${event.ball}`;
}

function dedupeSources(events: ConsensusCandidate[]): ConsensusCandidate[] {
  const bySource = new Map<ConsensusProvider, ConsensusCandidate>();
  for (const event of events) bySource.set(event.source, event);
  return [...bySource.values()];
}

function largestAgreement(events: ConsensusCandidate[]): ConsensusCandidate[] {
  let best: ConsensusCandidate[] = [];
  for (const seed of events) {
    const cluster = events.filter((event) => sameDelivery(seed, event));
    if (cluster.length > best.length) best = cluster;
  }
  return best;
}

export function decideConsensus(input: {
  candidates: ConsensusCandidate[];
  availableSources: ConsensusProvider[];
  priorities?: Partial<Record<ConsensusProvider, number>>;
}): ConsensusDecision[] {
  const priorities = { ...DEFAULT_CONSENSUS_PRIORITIES, ...input.priorities };
  const available = new Set(input.availableSources);
  const grouped = new Map<string, ConsensusCandidate[]>();
  for (const candidate of input.candidates) {
    if (!available.has(candidate.source)) continue;
    const key = slotKey(candidate);
    const list = grouped.get(key) ?? [];
    list.push(candidate);
    grouped.set(key, list);
  }
  const decisions: ConsensusDecision[] = [];
  for (const events of grouped.values()) {
    const unique = dedupeSources(events);
    const support = largestAgreement(unique);
    const supportSources = new Set(support.map((event) => event.source));
    const conflicting = unique.filter((event) => !support.some((item) => item.source === event.source && sameDelivery(item, event)));
    const distinct = new Set(unique.map((event) => `${event.eventType}|${event.runsTotal}|${event.wicketType ?? ""}`));
    let confidence: ConsensusConfidence = "CONFIDENCE_LOW";
    if (support.length < 2 && distinct.size > 1) confidence = "CONFLICT";
    else if (support.length >= 2 && available.size >= 3) confidence = "CONFIDENCE_HIGH";
    else if (support.length >= 2 && available.size === 2) confidence = "CONFIDENCE_MEDIUM";
    else if (support.length === 1) confidence = "CONFIDENCE_LOW";
    else confidence = "CONFLICT";
    const accepted = confidence === "CONFLICT"
      ? null
      : [...support].sort((left, right) => (priorities[left.source] ?? 9) - (priorities[right.source] ?? 9) || left.source.localeCompare(right.source))[0] ?? null;
    const sample = unique[0]!;
    const batterIds = support.map((event) => event.battingPlayerId).filter((id): id is string => Boolean(id));
    const priceableIdentity = confidence !== "CONFLICT" && support.length > 0 && batterIds.length === support.length && new Set(batterIds).size === 1;
    decisions.push({
      matchId: sample.matchId,
      innings: sample.innings,
      over: sample.over,
      ball: sample.ball,
      acceptedEvent: accepted,
      confidence,
      supportingSources: confidence === "CONFLICT" ? [] : [...supportSources],
      conflictingSources: confidence === "CONFLICT" ? unique.map((event) => event.source) : conflicting.map((event) => event.source),
      sourceEventIds: unique.map((event) => event.sourceEventId),
      priceableIdentity,
    });
  }
  return decisions;
}

export function consensusEventIdentity(decision: ConsensusDecision): string {
  const event = decision.acceptedEvent;
  const signature = event ? `${event.eventType}:${event.runsTotal}:${event.wicketType ?? ""}` : "conflict";
  return `consensus:${decision.matchId}:${decision.innings}:${decision.over}.${decision.ball}:${decision.confidence}:${signature}`;
}

export function consensusMayPrice(confidence: string | null | undefined, allowed: readonly string[] = DEFAULT_PRICEABLE_CONFIDENCE): boolean {
  if (!confidence) return false;
  if (confidence === "CONFIDENCE_LOW" || confidence === "CONFLICT") return false;
  return allowed.includes(confidence);
}

export function consensusEngineHealth(input: {
  usableSources: number;
  latestConfidence?: ConsensusConfidence | null;
}): "HEALTHY" | "DEGRADED" | "DOWN" {
  if (input.usableSources <= 0) return "DOWN";
  if (input.usableSources === 1) return "DEGRADED";
  if (input.latestConfidence === "CONFLICT") return "DEGRADED";
  return "HEALTHY";
}

export function isUsableConsensusSource(input: { operatingMode: string; status: string }): boolean {
  const participating = input.operatingMode === "SHADOW" || input.operatingMode === "ACTIVE";
  return participating && (input.status === "HEALTHY" || input.status === "DEGRADED");
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export type ReliabilitySample = {
  parseSuccess: boolean;
  agreementPercent: number;
  latencyMs: number;
  gapPercent: number;
  correctionPercent: number;
};

export type ReliabilityState = {
  score: number;
  agreementPercent: number;
  gapPercent: number;
  correctionPercent: number;
};

export function rollReliability(previous: ReliabilityState, sample: ReliabilitySample, alpha = 0.2): ReliabilityState {
  const weight = Math.max(0, Math.min(1, alpha));
  const smooth = (prior: number, next: number) => Math.round((1 - weight) * prior + weight * clampPercent(next));
  const latencyScore = clampPercent(100 - sample.latencyMs / 80);
  const observed = (
    (sample.parseSuccess ? 100 : 0)
    + clampPercent(sample.agreementPercent)
    + latencyScore
    + (100 - clampPercent(sample.gapPercent))
    + (100 - clampPercent(sample.correctionPercent))
  ) / 5;
  return {
    score: clampPercent((1 - weight) * previous.score + weight * observed),
    agreementPercent: smooth(previous.agreementPercent, sample.agreementPercent),
    gapPercent: smooth(previous.gapPercent, sample.gapPercent),
    correctionPercent: smooth(previous.correctionPercent, sample.correctionPercent),
  };
}
