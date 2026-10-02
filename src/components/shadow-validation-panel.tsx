import { FeedForm } from "@/components/feed-controls";
import { SHADOW_QUALITY_TYPES, type ShadowValidationView } from "@/domain/shadow-validation";

function ms(value: number | null) {
  return value === null ? "—" : `${value} ms`;
}

function latencyLine(label: string, value: ShadowValidationView["latency"]["providerToIngest"]) {
  return `${label}: current ${ms(value.current)} · p50 ${ms(value.p50)} · p95 ${ms(value.p95)} · max ${ms(value.max)}`;
}

export function ShadowValidationPanel({ view, canManage, matchId }: { view: ShadowValidationView; canManage: boolean; matchId: string }) {
  const { report } = view;
  return (
    <section className="mt-6 rounded-xl border border-line bg-card px-3 py-3 text-sm">
      <h3 className="font-semibold">Shadow validation</h3>
      <p className="mt-1 text-xs text-muted">Observation only. Marking this validated does not activate Cricbuzz, turn on real-source pricing, or change the pricing engine.</p>
      <div className="mt-3 space-y-1 text-xs text-muted">
        <p>Match {report.match} · Source {report.source}</p>
        <p>Shadow started {report.shadowStartedAt ?? "not started"} · Runtime {report.shadowRuntimeMinutes === null ? "—" : `${report.shadowRuntimeMinutes} min`}</p>
        <p>Events {report.eventsObserved} · Mapped {report.mappedEvents} · Unmapped {report.unmappedEvents} · Mapping success {report.mappingSuccessPct}%</p>
        <p>Duplicates {report.duplicateEvents} · Corrections {report.corrections} · Possible gaps {report.possibleGaps} · Recovered gaps {report.recoveredGaps} · Unresolved gaps {report.unresolvedGaps}</p>
        <p>Parser failures {report.parserFailures} · Source switches {report.sourceSwitches === null ? "—" : report.sourceSwitches} · Poll latency {ms(report.currentPollLatencyMs)}</p>
        <p>Ingest latency p50 {ms(report.eventIngestLatency.p50)} · p95 {ms(report.eventIngestLatency.p95)}</p>
        <p>Last successful poll {report.lastSuccessfulPoll ?? "none"} · Last cricket event {report.lastCricketEvent ?? "none"}</p>
        <p>Snapshot reconciliation {report.snapshotReconciliation}</p>
      </div>
      <h4 className="mt-4 text-sm font-semibold">Event quality</h4>
      <ul className="mt-1 grid grid-cols-2 gap-x-3 text-xs text-muted sm:grid-cols-4">
        {SHADOW_QUALITY_TYPES.map((type) => (
          <li key={type}>{type} {view.quality.counts[type]}</li>
        ))}
      </ul>
      <div className="mt-2 text-xs text-muted">
        {view.quality.unclassified.length === 0 && view.quality.other.length === 0 ? <p>No unclassified provider events.</p> : null}
        {view.quality.unclassified.map((row) => (
          <p key={row.providerCode}>Unclassified {row.providerCode} · {row.count}</p>
        ))}
        {view.quality.other.map((row) => (
          <p key={row.eventType}>Other retained {row.eventType} · {row.count}</p>
        ))}
      </div>
      <h4 className="mt-4 text-sm font-semibold">Player mapping</h4>
      <p className="mt-1 text-xs text-muted">Participating {view.mapping.participating} · Mapped {view.mapping.mapped} · Unmapped {view.mapping.unmapped} · Needs review {view.mapping.needsReview}. A name match is only a suggestion.</p>
      <ul className="mt-1 space-y-1 text-xs text-muted">
        {view.mapping.unresolved.length === 0 ? <li>No unresolved mappings.</li> : null}
        {view.mapping.unresolved.map((row) => (
          <li key={row.providerPlayerId}>{row.providerPlayerId} · {row.providerName} · {row.mappingStatus}{row.suggestionName ? ` · suggested ${row.suggestionName}` : " · no suggestion"}</li>
        ))}
      </ul>
      <h4 className="mt-4 text-sm font-semibold">Continuity</h4>
      <p className="mt-1 text-xs text-muted">Largest gap {view.gaps.largestObservedGap === null ? "—" : `${view.gaps.largestObservedGap} slots`} · Gaps {view.gaps.numberOfGaps} · Recovered {view.gaps.recoveredGaps} · Unresolved {view.gaps.unresolvedGaps} · Recovery attempts {view.gaps.recoveryAttempts}</p>
      <ul className="mt-1 space-y-1 text-xs text-muted">
        {view.gaps.gaps.length === 0 ? <li>No gaps recorded.</li> : null}
        {view.gaps.gaps.map((gap) => (
          <li key={`${gap.lastKnownEvent}-${gap.nextKnownEvent}`}>Last {gap.lastKnownEvent} · Next {gap.nextKnownEvent} · Sequence {gap.previousSequence ?? "—"} → {gap.nextSequence ?? "—"} · {gap.recoveryResult}</li>
        ))}
      </ul>
      <h4 className="mt-4 text-sm font-semibold">Latency</h4>
      <p className="mt-1 text-xs text-muted">{latencyLine("Provider to ingest", view.latency.providerToIngest)}</p>
      <p className="text-xs text-muted">{latencyLine("Ingest to storage", view.latency.ingestToStorage)}</p>
      <p className="text-xs text-muted">A missing provider timestamp is left blank.</p>
      <h4 className="mt-4 text-sm font-semibold">Reconciliation</h4>
      <p className="mt-1 text-xs text-muted">Current state {view.reconciliation.state}. Conflicts are recorded and are not rewritten.</p>
      <ul className="mt-1 space-y-1 text-xs text-muted">
        {view.reconciliation.conflicts.length === 0 ? <li>No conflicts recorded.</li> : null}
        {view.reconciliation.conflicts.map((conflict) => (
          <li key={conflict.observedAt}>Expected {conflict.expectedRuns ?? "—"}/{conflict.expectedWickets ?? "—"} · Provider {conflict.providerRuns}/{conflict.providerWickets} in {conflict.providerOvers} · Last event {conflict.lastKnownEvent ?? "none"} · {conflict.observedAt}</li>
        ))}
      </ul>
      <h4 className="mt-4 text-sm font-semibold">Corrections</h4>
      <p className="mt-1 text-xs text-muted">Received {view.corrections.correctionsReceived} · Superseded {view.corrections.supersededEvents} · Acknowledged {view.corrections.acknowledgedCorrections} · Unacknowledged {view.corrections.unacknowledgedCorrections}. Acknowledging a correction does not change trades, wallets, or price history.</p>
      <h4 className="mt-4 text-sm font-semibold">Readiness {view.readiness.result}</h4>
      <ul className="mt-1 space-y-1 text-xs">
        {view.readiness.checks.map((check) => (
          <li key={check.key}>{check.state} · {check.label} · {check.detail}</li>
        ))}
      </ul>
      <h4 className="mt-4 text-sm font-semibold">Manual sign-off</h4>
      {view.signoff ? (
        <p className="mt-1 text-xs text-muted">Validated {view.signoff.validatedAt} by {view.signoff.validatedBy ?? "staff"} · {view.signoff.validationReason}</p>
      ) : (
        <p className="mt-1 text-xs text-muted">Not validated.</p>
      )}
      {canManage ? (
        <div className="mt-2 max-w-md">
          <FeedForm action="mark_shadow_validated" title="Mark shadow validated" hidden={{ matchId }} fields={[]} />
        </div>
      ) : null}
      {view.completion ? (
        <div className="mt-4">
          <h4 className="text-sm font-semibold">Match completion summary</h4>
          <p className="mt-1 text-xs text-muted">Frozen {view.completion.frozenAt}. This copy stays after the match.</p>
          <p className="mt-1 text-xs text-muted">
            {view.completion.match} · {view.completion.source} · Events {view.completion.totalEvents} · Mapped {view.completion.mappedPct}% · Duplicates {view.completion.duplicates} · Corrections {view.completion.corrections} · Gaps {view.completion.gaps} · Recovered {view.completion.recoveredGaps} · Unresolved {view.completion.unresolvedGaps} · Parse failures {view.completion.parseFailures} · p50 {ms(view.completion.p50LatencyMs)} · p95 {ms(view.completion.p95LatencyMs)} · Downtime {view.completion.sourceDowntimeMs === null ? "—" : ms(view.completion.sourceDowntimeMs)} · Conflicts {view.completion.reconciliationConflicts} · Unresolved mappings {view.completion.unresolvedMappings} · Readiness {view.completion.finalReadiness}
          </p>
        </div>
      ) : null}
    </section>
  );
}
