import { describe, expect, it } from "vitest";
import { attentionItems } from "./reporting";
import {
  SHADOW_VALIDATION_PERMISSION,
  buildShadowValidation,
  correctionCounters,
  eventQuality,
  gapStatistics,
  latencyDistribution,
  mappingQuality,
  reconciliationConflict,
  shadowMatchNeedsAttention,
  shadowReadiness,
} from "./shadow-validation";

const now = Date.parse("2026-09-30T12:00:00.000Z");

function event(partial: { eventType?: string; wicketType?: string | null; sourceTimestampMs?: number | null; receivedAtMs?: number | null; storedAtMs?: number; mapped?: boolean; label?: string }) {
  return {
    eventType: partial.eventType ?? "SINGLE",
    wicketType: partial.wicketType ?? null,
    battingPlayerId: partial.mapped ? "player-1" : null,
    bowlingPlayerId: null,
    fielderPlayerIds: [] as string[],
    sourceTimestampMs: partial.sourceTimestampMs === undefined ? now - 1000 : partial.sourceTimestampMs,
    receivedAtMs: partial.receivedAtMs === undefined ? now - 20 : partial.receivedAtMs,
    storedAtMs: partial.storedAtMs ?? now,
    correctsEventId: null,
    correctionState: "ACTIVE",
    acknowledgedAt: null,
    label: partial.label ?? "SINGLE · 0.1",
  };
}

describe("shadow validation", () => {
  it("counts shadow summary fields without inventing a missing provider latency", () => {
    const view = buildShadowValidation({
      match: "India vs Australia",
      source: "Cricbuzz",
      nowMs: now,
      imported: true,
      shadowStartedAt: new Date(now - 10 * 60_000).toISOString(),
      events: [
        event({ mapped: true, sourceTimestampMs: now - 400, receivedAtMs: now - 20, storedAtMs: now, label: "FOUR · 0.1" }),
        event({ eventType: "SIX", mapped: false, sourceTimestampMs: null, receivedAtMs: null, storedAtMs: now, label: "SIX · 0.2" }),
      ],
      unclassified: [],
      mappings: [],
      gaps: [],
      recoveryAttempts: 0,
      possibleGaps: 0,
      recoveredGaps: 0,
      unresolvedGaps: 0,
      duplicates: 2,
      parserFailures: 1,
      continuity: "CONTINUOUS",
      reconciliationState: "MATCHED",
      conflicts: [],
      health: "HEALTHY",
      lastOutcome: "OK",
      currentPollLatencyMs: 780,
      lastSuccessfulPoll: new Date(now).toISOString(),
      sourceSwitches: 0,
      downtimeIncidents: [],
      openIncidents: [],
      activationCursorReady: true,
      signoff: null,
      frozenCompletion: null,
    });
    expect(view.report).toMatchObject({
      match: "India vs Australia",
      source: "Cricbuzz",
      eventsObserved: 2,
      mappedEvents: 1,
      unmappedEvents: 1,
      mappingSuccessPct: 50,
      duplicateEvents: 2,
      parserFailures: 1,
      currentPollLatencyMs: 780,
      snapshotReconciliation: "MATCHED",
      shadowRuntimeMinutes: 10,
    });
    expect(view.latency.providerToIngest.current).toBe(400);
    expect(view.latency.providerToIngest.max).toBe(400);
    expect(view.latency.providerToIngest.p95).toBeNull();
    expect(view.latency.ingestToStorage.current).toBe(20);
    expect(view.completion).toBeNull();
    expect(view.completionDraft.totalEvents).toBe(2);
    expect(view.completionDraft.p50LatencyMs).toBe(400);
  });

  it("retains unknown event types beside the known groups", () => {
    const quality = eventQuality(
      [
        { eventType: "FOUR" },
        { eventType: "WICKET", wicketType: "RUN_OUT" },
        { eventType: "WICKET", wicketType: "CAUGHT" },
        { eventType: "DROPPED_CATCH" },
      ],
      [{ providerCode: "APPEAL" }, { providerCode: "APPEAL" }],
    );
    expect(quality.counts.FOUR).toBe(1);
    expect(quality.counts.RUN_OUT).toBe(1);
    expect(quality.counts.CATCH).toBe(1);
    expect(quality.counts.WICKET).toBe(0);
    expect(quality.other).toEqual([{ eventType: "DROPPED_CATCH", count: 1 }]);
    expect(quality.unclassified).toEqual([{ providerCode: "APPEAL", count: 2 }]);
  });

  it("reports mapping quality and keeps a name suggestion unresolved", () => {
    const quality = mappingQuality([
      { externalPlayerId: "1413", externalPlayerName: "Virat Kohli", mappingStatus: "MAPPED", participationStatus: "ACTIVE", internalPlayerId: "p1", suggestionName: null },
      { externalPlayerId: "9", externalPlayerName: "Guest Batter", mappingStatus: "UNMAPPED", participationStatus: "ACTIVE", internalPlayerId: null, suggestionName: null },
      { externalPlayerId: "10", externalPlayerName: "Exact Name", mappingStatus: "NEEDS_REVIEW", participationStatus: "PLAYING_XI", internalPlayerId: null, suggestionName: "Exact Name" },
      { externalPlayerId: "11", externalPlayerName: "Squad Player", mappingStatus: "UNMAPPED", participationStatus: "SQUAD", internalPlayerId: null, suggestionName: null },
    ]);
    expect(quality).toMatchObject({ participating: 3, mapped: 1, unmapped: 1, needsReview: 1 });
    expect(quality.unresolved).toEqual([
      { providerPlayerId: "9", providerName: "Guest Batter", suggestionName: null, mappingStatus: "UNMAPPED", participating: true },
      { providerPlayerId: "10", providerName: "Exact Name", suggestionName: "Exact Name", mappingStatus: "NEEDS_REVIEW", participating: true },
      { providerPlayerId: "11", providerName: "Squad Player", suggestionName: null, mappingStatus: "UNMAPPED", participating: false },
    ]);
    expect(quality.unresolved.every((row) => row.mappingStatus !== "MAPPED")).toBe(true);
  });

  it("summarises inspectable gaps", () => {
    const stats = gapStatistics([
      { lastKnownEvent: "1:17.3", nextKnownEvent: "1:17.6", previousSequence: 100, nextSequence: 103, slotSpan: 3, recoveryResult: "RECOVERED" },
      { lastKnownEvent: "1:18.1", nextKnownEvent: "1:18.4", previousSequence: 110, nextSequence: 114, slotSpan: 3, recoveryResult: "UNRESOLVED" },
    ], 2);
    expect(stats).toMatchObject({ largestObservedGap: 3, numberOfGaps: 2, recoveredGaps: 1, unresolvedGaps: 1, recoveryAttempts: 2 });
    expect(stats.gaps[0]).toMatchObject({ lastKnownEvent: "1:17.3", nextKnownEvent: "1:17.6", recoveryResult: "RECOVERED" });
  });

  it("calculates latency percentiles and leaves an empty series blank", () => {
    const samples = latencyDistribution([null, 10, 20, 30, 40, 100]);
    expect(samples).toEqual({ current: 100, p50: 30, p95: 100, max: 100 });
    expect(latencyDistribution([null, undefined])).toEqual({ current: null, p50: null, p95: null, max: null });
  });

  it("reports a reconciliation conflict and ignores a matched snapshot", () => {
    expect(reconciliationConflict({
      state: "CONFLICT",
      expectedRuns: 40,
      expectedWickets: 1,
      providerRuns: 80,
      providerWickets: 1,
      providerOvers: "10.1",
      lastKnownEvent: "1:4.2",
      observedAt: "2026-09-30T12:00:00.000Z",
    })).toMatchObject({ expectedRuns: 40, providerRuns: 80, lastKnownEvent: "1:4.2" });
    expect(reconciliationConflict({
      state: "MATCHED",
      expectedRuns: 40,
      expectedWickets: 1,
      providerRuns: 40,
      providerWickets: 1,
      providerOvers: "4.2",
      lastKnownEvent: "1:4.2",
      observedAt: "2026-09-30T12:00:00.000Z",
    })).toBeNull();
  });

  it("counts corrections without treating an acknowledgement as a price change", () => {
    expect(correctionCounters([
      { correctsEventId: null, correctionState: "SUPERSEDED", acknowledgedAt: null },
      { correctsEventId: "old", correctionState: "ACTIVE", acknowledgedAt: null },
    ])).toEqual({ correctionsReceived: 1, supersededEvents: 1, acknowledgedCorrections: 0, unacknowledgedCorrections: 2 });
    expect(correctionCounters([
      { correctsEventId: null, correctionState: "SUPERSEDED", acknowledgedAt: null },
      { correctsEventId: "old", correctionState: "ACTIVE", acknowledgedAt: "2026-09-30T12:00:00.000Z" },
    ])).toMatchObject({ acknowledgedCorrections: 1, unacknowledgedCorrections: 1 });
  });

  it("blocks readiness while a feed gap is unresolved", () => {
    const ready = shadowReadiness({
      imported: true,
      participating: 2,
      participatingMapped: 2,
      participatingUnresolved: 0,
      otherUnresolved: 0,
      health: "HEALTHY",
      lastOutcome: "OK",
      continuity: "UNRESOLVED_GAP",
      reconciliation: "MATCHED",
      eventsObserved: 8,
      shadowStartedAt: "2026-09-30T11:00:00.000Z",
      openIncidents: [],
      activationCursorReady: true,
    });
    expect(ready.checks.find((check) => check.key === "gap")?.state).toBe("BLOCKED");
    expect(ready.result).toBe("BLOCKED");
  });

  it("requires feed.manage and puts one shadow match on the overview", () => {
    expect(SHADOW_VALIDATION_PERMISSION).toBe("feed.manage");
    expect(shadowMatchNeedsAttention({ unresolvedGap: false, sourceDown: false, mappingBlocker: false, reconciliationConflict: false })).toBe(false);
    expect(shadowMatchNeedsAttention({ unresolvedGap: true, sourceDown: false, mappingBlocker: false, reconciliationConflict: false })).toBe(true);
    const items = attentionItems({
      pendingWithdrawals: 0,
      paymentsNeedingAttention: 0,
      worker: "HEALTHY",
      bannersExpiring: 0,
      highValueChurn: 0,
      disabledFeatures: [],
      shadowMatches: [{ matchId: "match-1", label: "India vs Australia" }],
    });
    expect(items).toEqual([{ label: "India vs Australia shadow feed needs attention", href: "/admin/market/live/match-1" }]);
  });
});
