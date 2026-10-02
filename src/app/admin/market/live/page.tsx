import Link from "next/link";
import { eventFreshnessSeconds, FEED_SOURCES, MATCH_STATUSES, SOURCE_OPERATING_MODES } from "@/domain/cricket-feed";
import { consensusEngineHealth, isUsableConsensusSource } from "@/domain/consensus-feed";
import { hasPermission } from "@/domain/permissions";
import { FeedForm } from "@/components/feed-controls";
import { assertPagePermission } from "@/server/guard";
import { averageLatencyMs, feedBoard } from "@/server/feed";
import { consensusAdminReport } from "@/server/consensus-feed";
import { indiaMatchPreview } from "@/server/match-prepare";
import { providerAvailability } from "@/domain/match-resolver";

export const metadata = { title: "Live matches" };

export default async function LiveMatchesPage() {
  const access = await assertPagePermission("feed.view");
  const [board, consensus, preview] = await Promise.all([feedBoard(), consensusAdminReport(), indiaMatchPreview()]);
  const canManage = hasPermission(access.staffRole, "feed.manage");
  const canSource = hasPermission(access.staffRole, "feed.source_manage");
  const usable = consensus.sources.filter((source) => source.source !== "Consensus" && isUsableConsensusSource(source)).length;
  const consensusStatus = consensusEngineHealth({
    usableSources: usable,
    latestConfidence: consensus.latest?.confidence === "CONFIDENCE_HIGH" || consensus.latest?.confidence === "CONFIDENCE_MEDIUM" || consensus.latest?.confidence === "CONFIDENCE_LOW" || consensus.latest?.confidence === "CONFLICT" ? consensus.latest.confidence : null,
  });
  return (
    <main>
      <h2 className="text-2xl font-bold">Live matches</h2>
      <p className="mt-1 text-sm text-muted">Active source {board.control.activeSource ?? "none"}. The feed normalizes events before the pricing engine sees them. Real prices can come only from the consensus feed, and that feed is in shadow.</p>
      <section className="mt-6 rounded-xl border border-line bg-card px-3 py-3">
        <h3 className="font-semibold">India match</h3>
        <p className="mt-1 text-sm text-muted">Find the next India international across CREX, Sportskeeda, and Cricbuzz, then prepare one shadow match. Pricing stays off.</p>
        {canManage ? (
          <div className="mt-3 max-w-md">
            <FeedForm action="refresh_india_matches" title="Look up the next India international" fields={[]} submitLabel="PREPARE INDIA MATCH" />
          </div>
        ) : null}
        {preview ? (
          <div className="mt-3 text-sm">
            <p className="font-semibold">{preview.homeTeam} vs {preview.awayTeam}</p>
            <p className="text-muted">{preview.competition || "India international"} · {preview.scheduledAt ? new Date(preview.scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Start time not set"}</p>
            <ul className="mt-2 space-y-1">
              {Object.entries(providerAvailability(preview)).map(([source, state]) => (
                <li key={source}>{source} {state}</li>
              ))}
            </ul>
            <p className="mt-2">{preview.monitoring === "DEGRADED" ? "DEGRADED · one source can be watched, and it cannot become price eligible." : "Two or more sources can be watched in shadow."}</p>
            {canManage ? (
              <div className="mt-3 max-w-md">
                <FeedForm
                  action="prepare_shadow_match"
                  title="Create one PlayerPulser match and attach the sources that were found"
                  fields={[]}
                  hidden={{ candidate: JSON.stringify(preview) }}
                  submitLabel="PREPARE SHADOW MATCH"
                />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">No India international is stored yet.</p>
        )}
      </section>
      <h3 className="mt-6 font-semibold">Feed sources</h3>
      <p className="mt-1 text-xs text-muted">Consensus {consensusStatus}. Confidence {consensus.latest?.confidence ?? "none"}. Supporting {consensus.latest?.supportingSources.join(", ") || "none"}. Conflicting {consensus.latest?.conflictingSources.join(", ") || "none"}.</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              {["Source", "Health", "Reliability", "Latency", "Agreement", "Gap rate", "Corrections", "Last event"].map((heading) => (
                <th key={heading} className="px-2 py-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {consensus.sources.map((source) => {
              const last = consensus.lastEvents.find((event) => event.source === source.source);
              return (
                <tr key={source.source} className="border-t border-line">
                  <td className="px-2 py-2">{source.source}</td>
                  <td className="px-2 py-2">{source.status}</td>
                  <td className="px-2 py-2">{source.reliabilityScore}</td>
                  <td className="px-2 py-2">{averageLatencyMs(source.latencyTotalMs, source.latencySamples) ?? source.lastPollLatencyMs} ms</td>
                  <td className="px-2 py-2">{source.agreementPercent}%</td>
                  <td className="px-2 py-2">{source.gapPercent}%</td>
                  <td className="px-2 py-2">{source.correctionPercent}%</td>
                  <td className="px-2 py-2">{last ? `${last.normalizedDescription} · ${last.createdAt.toISOString()}` : "none"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h3 className="mt-6 font-semibold">Discovered matches</h3>
      <p className="mt-1 text-xs text-muted">Matches seen by the cricket feeds. Import creates a PlayerPulser match. Nothing here is tradable until you import it.</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              {["Match", "Competition", "Start", "Provider status", "Scope"].map((heading) => (
                <th key={heading} className="px-2 py-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.discovered.length === 0 ? (
              <tr><td className="px-2 py-3 text-muted" colSpan={5}>No discovered matches yet. The shadow feed checks the international list on the poll interval.</td></tr>
            ) : null}
            {board.discovered.map((match) => (
              <tr key={match.id} className="border-t border-line">
                <td className="px-2 py-2">
                  {match.homeTeam} vs {match.awayTeam}
                  {match.importedMatchId ? <Link className="ml-2 text-india" href={`/admin/market/live/${match.importedMatchId}`}>Imported</Link> : null}
                  {canManage && !match.importedMatchId ? (
                    <div className="mt-2 max-w-xs">
                      <FeedForm action="import_discovered" title="Import match" hidden={{ discoveredId: match.id }} fields={[]} />
                    </div>
                  ) : null}
                </td>
                <td className="px-2 py-2">{match.competition}</td>
                <td className="px-2 py-2">{match.scheduledAt.toISOString()}</td>
                <td className="px-2 py-2">{match.providerStatus || "—"}</td>
                <td className="px-2 py-2">{match.indiaInternational ? "India international" : "International"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="mt-6 font-semibold">Imported matches</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              {["Match", "Status", "Over", "Source", "Last event", "Freshness", "Events", "Unmapped"].map((heading) => (
                <th key={heading} className="px-2 py-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.matches.length === 0 ? (
              <tr><td className="px-2 py-3 text-muted" colSpan={8}>No matches yet.</td></tr>
            ) : null}
            {board.matches.map((match) => (
              <tr key={match.id} className="border-t border-line">
                <td className="px-2 py-2"><Link className="text-india" href={`/admin/market/live/${match.id}`}>{match.homeTeam} vs {match.awayTeam}</Link></td>
                <td className="px-2 py-2">{match.status}</td>
                <td className="px-2 py-2">{match.innings ? `${match.innings} · ${match.overLabel ?? "—"}` : "—"}</td>
                <td className="px-2 py-2">{board.control.activeSource ?? "—"}</td>
                <td className="px-2 py-2">{match.events[0]?.normalizedDescription ?? "—"}</td>
                <td className="px-2 py-2">{freshnessLabel(match.status, match.events[0]?.occurredAt ?? null)}</td>
                <td className="px-2 py-2">{match._count.events}</td>
                <td className="px-2 py-2">{board.unmapped}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Pricing applications linked from the latest stored events: {board.applications}.</p>
      <h3 className="mt-6 font-semibold">Sources</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {board.sources.map((source) => (
          <li key={source.source} className="rounded-xl border border-line bg-card px-3 py-2">
            {source.source} · {source.operatingMode} · {source.status} · priority {source.priority} · {source.enabled ? "enabled" : "disabled"}
            <span className="block text-xs text-muted">
              Last success {source.lastSuccessfulPoll?.toISOString() ?? "none"} · Last event {source.lastEventAt?.toISOString() ?? "none"} · Poll {source.lastPollLatencyMs} ms · Outcome {source.lastPollOutcome ?? "none"} · Average {averageLatencyMs(source.latencyTotalMs, source.latencySamples) ?? "—"} ms · Failures {source.failureCount}
              {source.source === "Cricbuzz" ? ` · Ingest p50 ${board.ingestLatencyP50Ms ?? "—"} ms` : ""}
            </span>
            {source.source === "Cricbuzz" ? (
              <span className="mt-1 block text-xs text-muted">
                Activation: {board.cricbuzzActivation.length === 0 ? "Ready for an explicit switch." : board.cricbuzzActivation.join(" ")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {board.failovers.length > 0 ? (
        <>
          <h3 className="mt-6 font-semibold">Source switches</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {board.failovers.map((row) => (
              <li key={row.id}>{row.createdAt.toISOString()} · {row.oldSource ?? "none"} → {row.newSource ?? "none"} · {row.reason}</li>
            ))}
          </ul>
        </>
      ) : null}
      {canManage ? (
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          <FeedForm
            action="create_match"
            title="Import match"
            fields={[
              { name: "competition", label: "Competition" },
              { name: "homeTeam", label: "Home team" },
              { name: "awayTeam", label: "Away team" },
              { name: "venue", label: "Venue" },
              { name: "scheduledAt", label: "Start", type: "datetime-local" },
              { name: "source", label: "External source", options: FEED_SOURCES.map((source) => ({ value: source, label: source })), defaultValue: "DevelopmentSimulator" },
              { name: "externalId", label: "External match id" },
            ]}
          />
          <FeedForm
            action="failover"
            title="Use this source now"
            fields={[{ name: "source", label: "Source", options: board.sources.filter((source) => source.enabled).map((source) => ({ value: source.source, label: source.source })) }]}
          />
        </div>
      ) : null}
      {canSource ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <FeedForm
            action="enable_source"
            title="Enable or disable a source"
            fields={[
              { name: "source", label: "Source", options: FEED_SOURCES.map((source) => ({ value: source, label: source })) },
              { name: "enabled", label: "Enabled", type: "boolean", options: [{ value: "true", label: "Enabled" }, { value: "false", label: "Disabled" }] },
            ]}
          />
          <FeedForm
            action="set_priority"
            title="Change source priority"
            fields={[
              { name: "source", label: "Source", options: FEED_SOURCES.map((source) => ({ value: source, label: source })) },
              { name: "priority", label: "Priority (1 is first)", type: "number" },
            ]}
          />
          <FeedForm
            action="restart_source"
            title="Clear source failures"
            fields={[{ name: "source", label: "Source", options: FEED_SOURCES.map((source) => ({ value: source, label: source })) }]}
          />
          <FeedForm
            action="set_source_mode"
            title="Cricbuzz source mode"
            fields={[
              { name: "source", label: "Source", options: [{ value: "Cricbuzz", label: "Cricbuzz" }], defaultValue: "Cricbuzz" },
              { name: "mode", label: "Mode", options: SOURCE_OPERATING_MODES.map((mode) => ({ value: mode, label: mode })), defaultValue: "SHADOW" },
              { name: "confirmSwitch", label: "Switch the current active source to shadow", type: "boolean", options: [{ value: "false", label: "No" }, { value: "true", label: "Yes, switch" }], defaultValue: "false" },
            ]}
          />
        </div>
      ) : null}
      <p className="mt-4 text-xs text-muted">Backup order follows priority. A disabled or down source is not polled. Status choices: {MATCH_STATUSES.join(", ")}. Event freshness is shown for LIVE matches only. An innings break, delay, or quiet over does not mark a source down.</p>
    </main>
  );
}

function freshnessLabel(status: string, occurredAt: Date | null): string {
  if (status === "INNINGS_BREAK" || status === "DELAYED") return "Not timed";
  const seconds = eventFreshnessSeconds({
    nowMs: Date.now(),
    lastEventAtMs: occurredAt ? occurredAt.getTime() : null,
    status,
  });
  return seconds === null ? "—" : `${seconds}s`;
}
