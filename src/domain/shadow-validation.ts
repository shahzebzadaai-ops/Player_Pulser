/**
 * Shadow-match validation. These checks record what the feed did.
 * They do not activate a source, enable pricing, or change the engine.
 */

import { ingestLatencyMs, latencyP50Ms, participationJoinsLive } from "./cricket-feed";
import { latencyP95Ms } from "./feed-continuity";

export const SHADOW_VALIDATION_PERMISSION = "feed.manage" as const;
export const MIN_SHADOW_EVENTS = 5;

export const SHADOW_QUALITY_TYPES = [
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
  "FIFTY",
  "CENTURY",
  "MAIDEN_OVER",
] as const;

export type ReadinessState = "PASS" | "WARNING" | "BLOCKED";

export type LatencyDistribution = {
  current: number | null;
  p50: number | null;
  p95: number | null;
  max: number | null;
};

const EMPTY_LATENCY: LatencyDistribution = { current: null, p50: null, p95: null, max: null };

export function latencyDistribution(samples: Array<number | null | undefined>): LatencyDistribution {
  const clean: number[] = [];
  let current: number | null = null;
  for (const sample of samples) {
    if (typeof sample !== "number" || !Number.isFinite(sample) || sample < 0) continue;
    clean.push(sample);
    current = sample;
  }
  if (clean.length === 0) return EMPTY_LATENCY;
  return {
    current,
    p50: latencyP50Ms(clean),
    p95: latencyP95Ms(clean),
    max: clean.reduce((highest, value) => Math.max(highest, value), clean[0] ?? 0),
  };
}

export function storageLatencyMs(receivedAtMs: number | null, storedAtMs: number | null): number | null {
  if (receivedAtMs === null || storedAtMs === null) return null;
  return Math.max(0, storedAtMs - receivedAtMs);
}

export function qualityBucket(event: { eventType: string; wicketType?: string | null }): string {
  if (event.eventType === "WICKET" && event.wicketType === "RUN_OUT") return "RUN_OUT";
  if (event.eventType === "WICKET" && event.wicketType === "CAUGHT") return "CATCH";
  return event.eventType;
}

export function eventQuality(
  events: { eventType: string; wicketType?: string | null }[],
  unclassified: { providerCode: string }[],
) {
  const counts = Object.fromEntries(SHADOW_QUALITY_TYPES.map((type) => [type, 0])) as Record<(typeof SHADOW_QUALITY_TYPES)[number], number>;
  const other: { eventType: string; count: number }[] = [];
  const otherCounts = new Map<string, number>();
  for (const event of events) {
    const bucket = qualityBucket(event);
    if ((SHADOW_QUALITY_TYPES as readonly string[]).includes(bucket)) {
      counts[bucket as (typeof SHADOW_QUALITY_TYPES)[number]] += 1;
    } else {
      otherCounts.set(bucket, (otherCounts.get(bucket) ?? 0) + 1);
    }
  }
  for (const [eventType, count] of otherCounts) other.push({ eventType, count });
  const unclassifiedCounts = new Map<string, number>();
  for (const row of unclassified) {
    const code = row.providerCode || "UNCLASSIFIED";
    unclassifiedCounts.set(code, (unclassifiedCounts.get(code) ?? 0) + 1);
  }
  return {
    counts,
    other,
    unclassified: [...unclassifiedCounts].map(([providerCode, count]) => ({ providerCode, count })),
    unclassifiedTotal: unclassified.length,
  };
}

export function mappingQuality(rows: {
  externalPlayerId: string;
  externalPlayerName: string;
  mappingStatus: string;
  participationStatus: string;
  internalPlayerId: string | null;
  suggestionName: string | null;
}[]) {
  const participating = rows.filter((row) => participationJoinsLive(row.participationStatus));
  const mapped = participating.filter((row) => row.mappingStatus === "MAPPED" && row.internalPlayerId).length;
  const unmapped = participating.filter((row) => row.mappingStatus === "UNMAPPED").length;
  const needsReview = participating.filter((row) => row.mappingStatus === "NEEDS_REVIEW").length;
  const unresolved = rows
    .filter((row) => row.mappingStatus !== "MAPPED" || !row.internalPlayerId)
    .map((row) => ({
      providerPlayerId: row.externalPlayerId,
      providerName: row.externalPlayerName,
      suggestionName: row.suggestionName,
      mappingStatus: row.mappingStatus,
      participating: participationJoinsLive(row.participationStatus),
    }));
  return {
    participating: participating.length,
    mapped,
    unmapped,
    needsReview,
    unresolved,
  };
}

export type GapInspection = {
  lastKnownEvent: string;
  nextKnownEvent: string;
  previousSequence: number | null;
  nextSequence: number | null;
  slotSpan: number;
  recoveryResult: string;
};

export function gapStatistics(gaps: GapInspection[], recoveryAttempts: number) {
  const largest = gaps.reduce((highest, gap) => Math.max(highest, gap.slotSpan), 0);
  return {
    largestObservedGap: gaps.length === 0 ? null : largest,
    numberOfGaps: gaps.length,
    recoveredGaps: gaps.filter((gap) => gap.recoveryResult === "RECOVERED").length,
    unresolvedGaps: gaps.filter((gap) => gap.recoveryResult === "UNRESOLVED").length,
    recoveryAttempts,
    gaps,
  };
}

export type ReconciliationConflict = {
  expectedRuns: number | null;
  expectedWickets: number | null;
  providerRuns: number;
  providerWickets: number;
  providerOvers: string;
  lastKnownEvent: string | null;
  observedAt: string;
};

export function reconciliationConflict(input: ReconciliationConflict & { state: string }): ReconciliationConflict | null {
  if (input.state !== "CONFLICT") return null;
  return {
    expectedRuns: input.expectedRuns,
    expectedWickets: input.expectedWickets,
    providerRuns: input.providerRuns,
    providerWickets: input.providerWickets,
    providerOvers: input.providerOvers,
    lastKnownEvent: input.lastKnownEvent,
    observedAt: input.observedAt,
  };
}

export function correctionCounters(events: {
  correctsEventId: string | null;
  correctionState: string;
  acknowledgedAt: string | null;
}[]) {
  const correctionRows = events.filter((event) => event.correctsEventId || event.correctionState === "SUPERSEDED");
  return {
    correctionsReceived: events.filter((event) => event.correctsEventId).length,
    supersededEvents: events.filter((event) => event.correctionState === "SUPERSEDED").length,
    acknowledgedCorrections: correctionRows.filter((event) => event.acknowledgedAt).length,
    unacknowledgedCorrections: correctionRows.filter((event) => !event.acknowledgedAt).length,
  };
}

export function sourceDowntimeMs(
  incidents: { openedAtMs: number; resolvedAtMs: number | null }[],
  nowMs: number,
  startedAtMs: number | null,
): number | null {
  if (startedAtMs === null) return null;
  return incidents.reduce((total, incident) => {
    const start = Math.max(incident.openedAtMs, startedAtMs);
    const end = incident.resolvedAtMs ?? nowMs;
    return end > start ? total + (end - start) : total;
  }, 0);
}

export function shadowMatchNeedsAttention(input: {
  unresolvedGap: boolean;
  sourceDown: boolean;
  mappingBlocker: boolean;
  reconciliationConflict: boolean;
}): boolean {
  return input.unresolvedGap || input.sourceDown || input.mappingBlocker || input.reconciliationConflict;
}

export function shadowAttentionItems(matches: { matchId: string; label: string }[]): { label: string; href: string }[] {
  return matches.map((match) => ({
    label: `${match.label} shadow feed needs attention`,
    href: `/admin/market/live/${match.matchId}`,
  }));
}

export type ReadinessCheck = { key: string; label: string; state: ReadinessState; detail: string };

function overall(checks: ReadinessCheck[]): ReadinessState {
  if (checks.some((check) => check.state === "BLOCKED")) return "BLOCKED";
  if (checks.some((check) => check.state === "WARNING")) return "WARNING";
  return "PASS";
}

export function shadowReadiness(input: {
  imported: boolean;
  participating: number;
  participatingMapped: number;
  participatingUnresolved: number;
  otherUnresolved: number;
  health: string;
  lastOutcome: string | null;
  continuity: string;
  reconciliation: string;
  eventsObserved: number;
  shadowStartedAt: string | null;
  openIncidents: string[];
  activationCursorReady: boolean;
}): { checks: ReadinessCheck[]; result: ReadinessState } {
  const parserFailed = !input.lastOutcome || ["HTTP_ERROR", "TIMEOUT", "PARSE_ERROR", "NO_MATCH"].includes(input.lastOutcome);
  const criticalIncident = input.openIncidents.some((type) => type === "UNRESOLVED_GAP" || type === "SOURCE_DOWN" || type === "REPEATED_PARSE_FAILURE");
  const warningIncident = input.openIncidents.some((type) => type === "MAPPING_BLOCKER" || type === "RECONCILIATION_CONFLICT");
  const checks: ReadinessCheck[] = [
    {
      key: "imported",
      label: "Match imported",
      state: input.imported ? "PASS" : "BLOCKED",
      detail: input.imported ? "Imported" : "Not imported",
    },
    {
      key: "players",
      label: "Participating players mapped",
      state: input.participating > 0 && input.participatingMapped > 0 && input.participatingUnresolved === 0 ? "PASS" : "BLOCKED",
      detail: `${input.participatingMapped} of ${input.participating} participating players mapped`,
    },
    {
      key: "health",
      label: "Source healthy",
      state: input.health === "HEALTHY" ? "PASS" : input.health === "DEGRADED" ? "WARNING" : "BLOCKED",
      detail: input.health,
    },
    {
      key: "parser",
      label: "Recent parser success",
      state: parserFailed ? "BLOCKED" : input.lastOutcome === "MAPPING_REQUIRED" ? "WARNING" : "PASS",
      detail: input.lastOutcome ?? "none",
    },
    {
      key: "mapping",
      label: "No unresolved critical mapping",
      state: input.participatingUnresolved > 0 ? "BLOCKED" : input.otherUnresolved > 0 ? "WARNING" : "PASS",
      detail: input.participatingUnresolved > 0 ? `${input.participatingUnresolved} participating players are unresolved` : input.otherUnresolved > 0 ? `${input.otherUnresolved} non-playing mappings are unresolved` : "None",
    },
    {
      key: "gap",
      label: "No unresolved feed gap",
      state: input.continuity === "UNRESOLVED_GAP" ? "BLOCKED" : input.continuity === "POSSIBLE_GAP" ? "WARNING" : "PASS",
      detail: input.continuity,
    },
    {
      key: "reconciliation",
      label: "Reconciliation acceptable",
      state: input.reconciliation === "MATCHED" ? "PASS" : input.reconciliation === "CONFLICT" ? "BLOCKED" : "WARNING",
      detail: input.reconciliation,
    },
    {
      key: "runtime",
      label: "Shadow runtime recorded",
      state: input.shadowStartedAt ? "PASS" : "WARNING",
      detail: input.shadowStartedAt ?? "Not started",
    },
    {
      key: "sample",
      label: "Minimum event sample available",
      state: input.eventsObserved >= MIN_SHADOW_EVENTS ? "PASS" : input.eventsObserved > 0 ? "WARNING" : "BLOCKED",
      detail: `${input.eventsObserved} events. ${MIN_SHADOW_EVENTS} is the sample used for a p95.`,
    },
    {
      key: "incidents",
      label: "No critical feed incident",
      state: criticalIncident ? "BLOCKED" : warningIncident ? "WARNING" : "PASS",
      detail: input.openIncidents.length === 0 ? "None" : input.openIncidents.join(", "),
    },
    {
      key: "watermark",
      label: "Activation watermark ready",
      state: !input.imported ? "BLOCKED" : input.activationCursorReady ? "PASS" : "WARNING",
      detail: !input.imported ? "Not imported" : input.activationCursorReady ? "A future activation can use the current delivery as its cursor." : "No delivery cursor yet. Staff still activate separately.",
    },
  ];
  return { checks, result: overall(checks) };
}

export type ShadowCompletionSummary = {
  match: string;
  source: string;
  totalEvents: number;
  mappedPct: number;
  duplicates: number;
  corrections: number;
  gaps: number;
  recoveredGaps: number;
  unresolvedGaps: number;
  parseFailures: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  sourceDowntimeMs: number | null;
  reconciliationConflicts: number;
  unresolvedMappings: number;
  finalReadiness: ReadinessState;
  frozenAt: string;
};

export type ShadowValidationView = {
  report: {
    match: string;
    source: string;
    shadowStartedAt: string | null;
    shadowRuntimeMinutes: number | null;
    eventsObserved: number;
    mappedEvents: number;
    unmappedEvents: number;
    mappingSuccessPct: number;
    duplicateEvents: number;
    corrections: number;
    possibleGaps: number;
    recoveredGaps: number;
    unresolvedGaps: number;
    parserFailures: number;
    sourceSwitches: number | null;
    currentPollLatencyMs: number | null;
    eventIngestLatency: LatencyDistribution;
    lastSuccessfulPoll: string | null;
    lastCricketEvent: string | null;
    snapshotReconciliation: string;
  };
  quality: ReturnType<typeof eventQuality>;
  mapping: ReturnType<typeof mappingQuality>;
  gaps: ReturnType<typeof gapStatistics>;
  latency: { providerToIngest: LatencyDistribution; ingestToStorage: LatencyDistribution };
  reconciliation: { state: string; conflicts: ReconciliationConflict[] };
  corrections: ReturnType<typeof correctionCounters>;
  readiness: { checks: ReadinessCheck[]; result: ReadinessState };
  signoff: { validatedBy: string | null; validatedAt: string | null; validationReason: string | null } | null;
  completion: ShadowCompletionSummary | null;
  completionDraft: ShadowCompletionSummary;
};

export function isCompletionSummary(value: unknown): value is ShadowCompletionSummary {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<ShadowCompletionSummary>;
  return typeof row.match === "string" && typeof row.source === "string" && typeof row.finalReadiness === "string" && typeof row.frozenAt === "string";
}

export function buildShadowValidation(input: {
  match: string;
  source: string;
  nowMs: number;
  imported: boolean;
  shadowStartedAt: string | null;
  events: {
    eventType: string;
    wicketType: string | null;
    battingPlayerId: string | null;
    bowlingPlayerId: string | null;
    fielderPlayerIds: string[];
    sourceTimestampMs: number | null;
    receivedAtMs: number | null;
    storedAtMs: number;
    correctsEventId: string | null;
    correctionState: string;
    acknowledgedAt: string | null;
    label: string;
  }[];
  unclassified: { providerCode: string }[];
  mappings: {
    externalPlayerId: string;
    externalPlayerName: string;
    mappingStatus: string;
    participationStatus: string;
    internalPlayerId: string | null;
    suggestionName: string | null;
  }[];
  gaps: GapInspection[];
  recoveryAttempts: number;
  possibleGaps: number;
  recoveredGaps: number;
  unresolvedGaps: number;
  duplicates: number;
  parserFailures: number;
  continuity: string;
  reconciliationState: string;
  conflicts: ReconciliationConflict[];
  health: string;
  lastOutcome: string | null;
  currentPollLatencyMs: number | null;
  lastSuccessfulPoll: string | null;
  sourceSwitches: number | null;
  downtimeIncidents: { openedAtMs: number; resolvedAtMs: number | null }[];
  openIncidents: string[];
  activationCursorReady: boolean;
  signoff: { validatedBy: string | null; validatedAt: string | null; validationReason: string | null } | null;
  frozenCompletion: ShadowCompletionSummary | null;
}): ShadowValidationView {
  const mappedEvents = input.events.filter((event) => event.battingPlayerId || event.bowlingPlayerId || event.fielderPlayerIds.length > 0).length;
  const observed = input.events.length;
  const mappingSuccessPct = observed === 0 ? 0 : Math.round((mappedEvents / observed) * 100);
  const providerSamples = input.events.map((event) => ingestLatencyMs(event.sourceTimestampMs, event.storedAtMs));
  const storageSamples = input.events.map((event) => storageLatencyMs(event.receivedAtMs, event.storedAtMs));
  const providerToIngest = latencyDistribution(providerSamples);
  const ingestToStorage = latencyDistribution(storageSamples);
  const startedMs = input.shadowStartedAt ? Date.parse(input.shadowStartedAt) : null;
  const runtimeMinutes = startedMs === null || Number.isNaN(startedMs) ? null : Math.max(0, Math.floor((input.nowMs - startedMs) / 60_000));
  const mapping = mappingQuality(input.mappings);
  const participatingUnresolved = mapping.unresolved.filter((row) => row.participating).length;
  const otherUnresolved = mapping.unresolved.filter((row) => !row.participating).length;
  const readiness = shadowReadiness({
    imported: input.imported,
    participating: mapping.participating,
    participatingMapped: mapping.mapped,
    participatingUnresolved,
    otherUnresolved,
    health: input.health,
    lastOutcome: input.lastOutcome,
    continuity: input.continuity,
    reconciliation: input.reconciliationState,
    eventsObserved: observed,
    shadowStartedAt: input.shadowStartedAt,
    openIncidents: input.openIncidents,
    activationCursorReady: input.activationCursorReady,
  });
  const corrections = correctionCounters(input.events);
  const last = input.events[input.events.length - 1] ?? null;
  const completion: ShadowCompletionSummary = {
    match: input.match,
    source: input.source,
    totalEvents: observed,
    mappedPct: mappingSuccessPct,
    duplicates: input.duplicates,
    corrections: corrections.correctionsReceived,
    gaps: input.gaps.length,
    recoveredGaps: input.recoveredGaps,
    unresolvedGaps: input.unresolvedGaps,
    parseFailures: input.parserFailures,
    p50LatencyMs: providerToIngest.p50,
    p95LatencyMs: providerToIngest.p95,
    sourceDowntimeMs: sourceDowntimeMs(input.downtimeIncidents, input.nowMs, startedMs !== null && !Number.isNaN(startedMs) ? startedMs : null),
    reconciliationConflicts: input.conflicts.length,
    unresolvedMappings: mapping.unresolved.length,
    finalReadiness: readiness.result,
    frozenAt: new Date(input.nowMs).toISOString(),
  };
  return {
    report: {
      match: input.match,
      source: input.source,
      shadowStartedAt: input.shadowStartedAt,
      shadowRuntimeMinutes: runtimeMinutes,
      eventsObserved: observed,
      mappedEvents,
      unmappedEvents: Math.max(0, observed - mappedEvents),
      mappingSuccessPct,
      duplicateEvents: input.duplicates,
      corrections: corrections.correctionsReceived,
      possibleGaps: input.possibleGaps,
      recoveredGaps: input.recoveredGaps,
      unresolvedGaps: input.unresolvedGaps,
      parserFailures: input.parserFailures,
      sourceSwitches: input.sourceSwitches,
      currentPollLatencyMs: input.currentPollLatencyMs,
      eventIngestLatency: providerToIngest,
      lastSuccessfulPoll: input.lastSuccessfulPoll,
      lastCricketEvent: last?.label ?? null,
      snapshotReconciliation: input.reconciliationState,
    },
    quality: eventQuality(input.events, input.unclassified),
    mapping,
    gaps: gapStatistics(input.gaps, input.recoveryAttempts),
    latency: { providerToIngest, ingestToStorage },
    reconciliation: { state: input.reconciliationState, conflicts: input.conflicts },
    corrections,
    readiness,
    signoff: input.signoff,
    completion: input.frozenCompletion,
    completionDraft: completion,
  };
}
