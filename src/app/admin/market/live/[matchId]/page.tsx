import Link from "next/link";
import { notFound } from "next/navigation";
import { FEED_SOURCES, MATCH_STATUSES, PARTICIPATION_STATUSES, suggestPlayerMatch } from "@/domain/cricket-feed";
import { hasPermission } from "@/domain/permissions";
import { FeedForm } from "@/components/feed-controls";
import { ShadowValidationPanel } from "@/components/shadow-validation-panel";
import { assertPagePermission } from "@/server/guard";
import { matchFeedDetail } from "@/server/feed";
import { shadowOperatorSummary } from "@/server/match-prepare";

export const metadata = { title: "Match feed" };

export default async function MatchFeedPage({ params }: { params: Promise<{ matchId: string }> }) {
  const access = await assertPagePermission("feed.view");
  const { matchId } = await params;
  const detail = await matchFeedDetail(matchId);
  if (!detail) notFound();
  const summary = await shadowOperatorSummary(matchId);
  const { match, mappings, players, sources, applications, debug, shadow, snapshots, continuity, validation } = detail;
  const canManage = hasPermission(access.staffRole, "feed.manage");
  const canMap = hasPermission(access.staffRole, "feed.mapping_manage");
  const active = sources.find((source) => source.enabled && source.status === "HEALTHY") ?? sources.find((source) => source.enabled);
  return (
    <main>
      <p className="text-sm"><Link className="text-india" href="/admin/market/live">Live matches</Link></p>
      <h2 className="mt-2 text-2xl font-bold">{match.homeTeam} vs {match.awayTeam}</h2>
      <p className="mt-1 text-sm text-muted">
        {match.competition} · {match.status} · Start {match.scheduledAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
      </p>
      {summary ? (
        <section className="mt-4 rounded-xl border border-line bg-card px-3 py-3 text-sm">
          <p className="font-semibold">{match.homeTeam} vs {match.awayTeam}</p>
          <ul className="mt-2 space-y-1">
            <li>CREX {summary.crex.linked ? `linked / ${summary.crex.status.toLowerCase()}` : "not linked"}</li>
            <li>Sportskeeda {summary.sportskeeda.linked ? `linked / ${summary.sportskeeda.status.toLowerCase()}` : "not linked"}</li>
            <li>Cricbuzz {summary.cricbuzz.linked ? `linked / ${summary.cricbuzz.status.toLowerCase()}` : "not linked"}</li>
            <li>Players {summary.playersResolved}/{summary.playersTotal} resolved</li>
            <li>Consensus {summary.consensusMode}</li>
            <li>Real pricing {summary.realPricing ? "ON" : "OFF"}</li>
            <li>Engine {summary.engineMode}</li>
            <li>Shadow events {summary.shadowEvents}</li>
          </ul>
          {[summary.crex, summary.sportskeeda, summary.cricbuzz].filter((source) => source.linked).length === 1 ? (
            <p className="mt-2">DEGRADED. One source can be observed. It cannot become price eligible.</p>
          ) : null}
          {summary.participatingOpen > 0 ? <p className="mt-2">Unresolved participating players: {summary.participatingOpen}</p> : null}
          <p className="mt-3"><a className="text-india" href="#shadow-monitor">VIEW SHADOW MONITOR</a></p>
        </section>
      ) : null}
      <h3 className="mt-6 font-semibold">Player mappings</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              {["Provider name", "CREX", "Sportskeeda", "Cricbuzz", "PlayerPulser", "Status"].map((heading) => (
                <th key={heading} className="px-2 py-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(summary?.plan.length ?? 0) === 0 ? (
              <tr><td className="px-2 py-3 text-muted" colSpan={6}>No provider players yet. Shadow observation can start before the playing XI is mapped.</td></tr>
            ) : null}
            {summary?.plan.map((row) => (
              <tr key={row.key} className="border-t border-line">
                <td className="px-2 py-2">{row.providers.CREX?.name || row.providers.Sportskeeda?.name || row.providers.Cricbuzz?.name || "Unknown"}</td>
                <td className="px-2 py-2">{row.providers.CREX ? row.providers.CREX.externalPlayerId : "—"}</td>
                <td className="px-2 py-2">{row.providers.Sportskeeda ? row.providers.Sportskeeda.externalPlayerId : "—"}</td>
                <td className="px-2 py-2">{row.providers.Cricbuzz ? row.providers.Cricbuzz.externalPlayerId : "—"}</td>
                <td className="px-2 py-2">{row.playerName ? `${row.playerName} / ${row.slug}` : "—"}</td>
                <td className="px-2 py-2">{row.status} · {row.participation.replace(/_/g, " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canMap && (summary?.plan.some((row) => row.status === "SAFE") ?? false) ? (
        <div className="mt-3 max-w-md">
          <FeedForm action="confirm_safe_mappings" title="Confirm every row that has one clear PlayerPulser player" hidden={{ matchId: match.id }} fields={[]} submitLabel="CONFIRM ALL SAFE MATCHES" />
        </div>
      ) : null}
      <h3 id="shadow-monitor" className="mt-6 font-semibold">Shadow events</h3>
      <p className="mt-1 text-sm text-muted">{summary?.shadowEvents ?? match.events.length} stored. Consensus {summary?.consensusMode ?? "SHADOW"}. Problems {continuity.incidents.length}.</p>
      <details className="mt-6 rounded-xl border border-line bg-card px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold">Advanced diagnostics</summary>
      <p className="mt-3 text-sm text-muted">
        {match.venue || "Venue not set"} · Innings {match.innings ?? "—"} · Over {match.overLabel ?? "—"}
      </p>
      <p className="mt-1 text-sm text-muted">Active eligible source {active?.source ?? "none"}. Pricing applications for these events: {applications.length}.</p>
      <h3 className="mt-6 font-semibold">Mappings</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {mappings.length === 0 ? <li className="text-muted">No feed players mapped yet.</li> : null}
        {mappings.map((mapping) => (
          <li key={mapping.id} className="rounded-xl border border-line bg-card px-3 py-2">
            {mapping.externalPlayerName} · {mapping.source} · {mapping.externalPlayerId} · {mapping.mappingStatus} · {mapping.participationStatus}
            <span className="block text-xs text-muted">{players.find((player) => player.id === mapping.internalPlayerId)?.name ?? "No PlayerPulser player"}</span>
            {mapping.mappingStatus !== "MAPPED" ? (
              <span className="block text-xs text-muted">
                {(() => {
                  const suggestion = suggestPlayerMatch(mapping.externalPlayerName, players);
                  return suggestion ? `Name matches ${suggestion.name}. Confirm the mapping before it can price.` : "No confirmed player. Similar names are not used.";
                })()}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <h3 className="mt-6 font-semibold">Shadow comparison</h3>
      <div className="mt-2 rounded-xl border border-line bg-card px-3 py-2 text-sm">
        <p>Cricbuzz latest: {shadow.cricbuzz ? `${shadow.cricbuzz.eventType} · ${shadow.cricbuzz.over}.${shadow.cricbuzz.ball} · ${shadow.cricbuzz.normalizedDescription}` : "No Cricbuzz event stored yet."}</p>
        <p className="mt-1">PlayerPulser reference: {shadow.reference ? `${shadow.reference.source} · ${shadow.reference.eventType} · ${shadow.reference.normalizedDescription}` : "No simulator or other reference event yet."}</p>
        <p className="mt-1 text-xs text-muted">Provider timestamp {shadow.providerTimestamp ?? "none"} · Ingest {shadow.ingestTimestamp ?? "none"} · Latency {shadow.latencyMs === null ? "—" : `${shadow.latencyMs} ms`}</p>
        <p className="mt-1 text-xs text-muted">Poll latency {shadow.pollLatencyMs ?? "—"} ms · Outcome {shadow.pollOutcome ?? "none"} · Mapping {shadow.mapping} · Dedupe {shadow.dedupe}</p>
        <p className="mt-1 text-xs text-muted">Would price as {shadow.wouldPriceAs.length ? shadow.wouldPriceAs.join(", ") : "none"}. Mode {shadow.operatingMode}. Real-source pricing lock {shadow.realSourcePricingEnabled ? "on" : "off"}.</p>
        <p className="mt-1 text-xs text-muted">Shadow mode records the event and does not apply the price. An active source still needs the global lock before a real event can reach pricing.</p>
      </div>
      {validation ? <ShadowValidationPanel view={validation} canManage={canManage} matchId={match.id} /> : null}
      <details className="mt-6 rounded-xl border border-line bg-card px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold">Feed continuity</summary>
        <div className="mt-2 space-y-2 text-sm">
          <p>Continuity {continuity.highWater?.continuity ?? "CONTINUOUS"}{continuity.highWater?.startedMidMatch ? " · STARTED_MID_MATCH" : ""}. Reconciliation {continuity.score?.reconciliation ?? "UNKNOWN"}.</p>
          <p className="text-xs text-muted">
            Last delivery {continuity.highWater?.latestOver ?? "—"}.{continuity.highWater?.latestBall ?? "—"} · Provider event {continuity.highWater?.latestProviderEventId ?? "none"} · Sequence {continuity.highWater?.latestSequence ?? "—"} · Ingested {continuity.highWater?.lastIngestAt?.toISOString() ?? "none"}
          </p>
          <p className="text-xs text-muted">
            Snapshot {continuity.score ? `${continuity.score.scoreRuns}/${continuity.score.wickets} in ${continuity.score.overs} overs` : "none"}. Status {continuity.score?.status || "—"}.
          </p>
          <p className="text-xs text-muted">
            Activation {continuity.activation ? continuity.activation.activatedAt.toISOString() : "not activated"} · Cursor {continuity.activation?.activationEventCursor ?? "none"} · Global pricing boundary {continuity.globalPricingEnabledAt ?? "off"}
          </p>
          <p className="text-xs text-muted">Gap policy {continuity.gapPolicy}. It does not change prices while Cricbuzz stays in shadow.</p>
          <p className="text-xs text-muted">
            Shadow quality: {continuity.quality.eventsObserved} events · mapped {continuity.quality.mappedPct}% · unmapped {continuity.quality.unmappedPct}% · duplicates {continuity.quality.duplicateDeliveries} · corrections {continuity.quality.corrections} · possible gaps {continuity.quality.possibleGaps} · recovered {continuity.quality.recoveredGaps} · unresolved {continuity.quality.unresolvedGaps} · parse failures {continuity.quality.parseFailures}
          </p>
          <p className="text-xs text-muted">
            Poll {continuity.quality.pollLatencyMs ?? "—"} ms · Ingest p50 {continuity.quality.ingestP50Ms ?? "—"} ms · Ingest p95 {continuity.quality.ingestP95Ms ?? "—"} ms · Shadow runtime {continuity.quality.shadowRuntimeMinutes ?? "—"} min
          </p>
          <ul className="space-y-1 text-xs">
            {continuity.checklist.map((item) => (
              <li key={item.label}>{item.ok ? "Ready" : "Blocked"} · {item.label} · {item.detail}</li>
            ))}
          </ul>
          <div>
            <p className="text-xs font-semibold">Open incidents</p>
            {continuity.incidents.length === 0 ? <p className="text-xs text-muted">None.</p> : null}
            {continuity.incidents.map((incident) => (
              <p key={incident.id} className="text-xs text-muted">{incident.severity} · {incident.type} · {incident.openedAt.toISOString()}</p>
            ))}
          </div>
        </div>
      </details>
      <h3 className="mt-6 font-semibold">Recent normalized events</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {match.events.length === 0 ? <li className="text-muted">No events stored.</li> : null}
        {match.events.map((event) => (
          <li key={event.id} className="rounded-xl border border-line bg-card px-3 py-2">
            {event.eventType} · {event.over}.{event.ball} · {event.source}
            <span className="block text-xs text-muted">{event.normalizedDescription} · {event.occurredAt.toISOString()} · {event.ingestionKey}</span>
          </li>
        ))}
      </ul>
      <h3 className="mt-6 font-semibold">Source debug</h3>
      <p className="mt-1 text-xs text-muted">Staff only. Customers do not see provider ids, dedupe keys, or correction state.</p>
      <ul className="mt-2 space-y-2 text-sm">
        {debug.length === 0 ? <li className="text-muted">No normalized events to inspect.</li> : null}
        {debug.map((row) => (
          <li key={row.eventId} className="rounded-xl border border-line bg-card px-3 py-2">
            <p>{row.eventType} · {row.correctionState}{row.correctsEventId ? ` · corrects ${row.correctsEventId}` : ""}{row.supersededById ? ` · superseded by ${row.supersededById}` : ""}</p>
            <p className="text-xs text-muted">Provider {row.source} {row.sourceEventId ?? "no source id"}</p>
            <p className="text-xs text-muted">Normalized {row.description}</p>
            <p className="text-xs text-muted">Dedupe {row.ingestionKey}</p>
            <p className="text-xs text-muted">Mapping {row.mapping} · Would price as {row.wouldPriceAs.length ? row.wouldPriceAs.join(", ") : "none"} · Latency {row.latencyMs === null ? "—" : `${row.latencyMs} ms`}</p>
            <p className="text-xs text-muted">Pricing {row.pricingKeys.length ? row.pricingKeys.join(", ") : "not sent to pricing"}</p>
            <p className="text-xs text-muted">
              {row.tickId ? <Link className="text-india" href="/admin/market/prices">PriceTick {row.tickId}</Link> : "No PriceTick"}
              {" · "}processed {row.createdAt}
              {row.acknowledgedAt ? ` · acknowledged ${row.acknowledgedAt}` : ""}
            </p>
            {canManage && (row.correctsEventId || row.correctionState === "SUPERSEDED") ? (
              <div className="mt-2 max-w-md">
                <FeedForm action="acknowledge_correction" title="Acknowledge correction" hidden={{ eventId: row.eventId }} fields={[]} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <h3 className="mt-6 font-semibold">Parsed source snapshots</h3>
      <p className="mt-1 text-xs text-muted">Bounded parsed snapshots for failures and recent polls. Full provider pages are not kept.</p>
      <ul className="mt-2 space-y-2 text-sm">
        {snapshots.length === 0 ? <li className="text-muted">No Cricbuzz snapshot for this match yet.</li> : null}
        {snapshots.map((snapshot) => (
          <li key={snapshot.id} className="rounded-xl border border-line bg-card px-3 py-2">
            <p>{snapshot.kind} · {snapshot.outcome} · {snapshot.bytes} bytes · {snapshot.createdAt.toISOString()}</p>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted">{snapshot.body}</pre>
          </li>
        ))}
      </ul>
      {canManage ? (
        <div className="mt-6 max-w-md">
          <FeedForm
            action="set_status"
            title="Match status"
            hidden={{ matchId: match.id }}
            fields={[{ name: "status", label: "Status", options: MATCH_STATUSES.map((status) => ({ value: status, label: status })), defaultValue: match.status }]}
          />
        </div>
      ) : null}
      {canMap ? (
        <div className="mt-3 max-w-md">
          <FeedForm
            action="map_player"
            title="Map a feed player"
            hidden={{ matchId: match.id }}
            fields={[
              { name: "source", label: "Source", options: FEED_SOURCES.map((source) => ({ value: source, label: source })), defaultValue: "DevelopmentSimulator" },
              { name: "externalPlayerId", label: "External player id" },
              { name: "externalPlayerName", label: "External player name" },
              { name: "participationStatus", label: "Participation", options: PARTICIPATION_STATUSES.map((status) => ({ value: status, label: status })), defaultValue: "ACTIVE" },
              { name: "internalPlayerId", label: "PlayerPulser player", options: players.map((player) => ({ value: player.id, label: player.name })) },
            ]}
          />
        </div>
      ) : null}
      </details>
    </main>
  );
}
