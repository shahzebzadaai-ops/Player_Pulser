import Link from "next/link";
import { assertPagePermission } from "@/server/guard";
import { averageLatencyMs, listFeedHealth } from "@/server/feed";
import { dbDiagnostics } from "@/server/db-diagnostics";
import { getSystemHealth, type HealthState } from "@/server/ops-status";
import { prisma } from "@/server/prisma";
import { realtimeDiagnostics, startRealtimeListener } from "@/server/realtime";

export const metadata = { title: "System health" };

export default async function HealthPage() {
  await assertPagePermission("settings.view");
  await startRealtimeListener();
  const feed = await listFeedHealth();
  const health = await getSystemHealth();
  const realtime = realtimeDiagnostics();
  const appDb = dbDiagnostics();
  const workerDbRow = await prisma.appSetting.findUnique({ where: { key: "ops.workerDb" } });
  const workerDb = workerDbStatus(workerDbRow?.value);
  return (
    <main>
      <h2 className="text-2xl font-bold">System health</h2>
      <p className="mt-1 text-sm">Overall: {health.overall}</p>
      <ul className="mt-4 space-y-2 text-sm">
        <Row label="PostgreSQL" state={health.postgres} detail={health.postgres === "HEALTHY" ? "Query succeeded." : "The database did not answer."} />
        <Row label="App DB" state={appDb.poolTimeouts > 0 ? "DEGRADED" : health.postgres} detail={`Pool ${appDb.connectionLimit ?? "default"} · timeout ${appDb.poolTimeout ?? "default"}s · active ${appDb.active} · pool timeouts ${appDb.poolTimeouts} · slow queries ${appDb.slowQueries}${appDb.lastSlowQuery ? ` · ${appDb.lastSlowQuery}` : ""}`} />
        <Row label="Worker DB" state={workerDb ? "HEALTHY" : "DEGRADED"} detail={workerDb ?? "The worker has not reported its pool yet."} />
        <Row label="Price worker" state={health.worker} detail={health.heartbeatAt ? `Heartbeat ${health.heartbeatAt}` : "No heartbeat yet."} />
        <Row label="Feed worker" state={health.feed.worker} detail={health.heartbeatAt ? `Same worker heartbeat ${health.heartbeatAt}` : "The feed worker has not reported a heartbeat."} />
        <Row label="Active source" state={health.feed.activeSourceState} detail={`${health.feed.activeSource ?? "none"} · ${health.feed.activeSourceStatus}`} />
        {health.feed.cricketSources.map((source) => (
          <Row key={source.source} label={source.source} state={source.status} detail={source.status === "HEALTHY" ? "Usable for consensus." : source.status === "DEGRADED" ? "Usable, with recent errors." : "Not usable for consensus."} />
        ))}
        <Row label="Consensus Engine" state={health.feed.consensus} detail={health.feed.consensus === "HEALTHY" ? "At least two cricket sources are usable." : health.feed.consensus === "DEGRADED" ? "Only one usable source, or the latest ball is a conflict." : "No usable cricket source."} />
        <li className="rounded-xl border border-line bg-card px-3 py-2">
          <span className="font-semibold">Pricing engine mode</span>
          <span className="block text-xs text-muted">{health.feed.engineSummary}</span>
        </li>
        <Row label="Last poll" state={health.feed.lastPollState} detail={health.feed.lastPollAt ?? "The feed worker has not completed a poll."} />
        <Row label="Last cricket event" state={health.feed.lastEventState} detail={health.feed.lastEventDetail} />
        <Row label="Last price application" state={health.feed.lastPriceApplicationState} detail={health.feed.lastPriceApplicationAt ?? "No performance price has been applied yet."} />
        <Row label="Postgres realtime listener" state={health.feed.listener} detail={health.feed.listenerAt ?? "The listener has not connected."} />
        <Row label="SSE" state={health.feed.sse} detail={health.feed.sseAt ? `Last customer snapshot ${health.feed.sseAt}` : "No customer stream has confirmed a snapshot yet. A quiet page is not a healthy feed."} />
        <li className="rounded-xl border border-line bg-card px-3 py-2">
          <span className="font-semibold">Price stream</span> · {realtime.listenerConnected ? "CONNECTED" : "DISCONNECTED"}
          <span className="block text-xs text-muted">
            Connected SSE clients {realtime.sseClients}
            {realtime.lastBroadcastAt ? ` · Last SSE broadcast ${realtime.lastBroadcastAt}` : " · No SSE broadcast yet"}
            {realtime.lastLatencyMs !== null ? ` · Tick to broadcast ${realtime.lastLatencyMs}ms` : ""}
            {health.latestTickAt ? ` · Last server tick ${health.latestTickAt}` : " · No server tick yet"}
            {health.worker === "HEALTHY" ? " · Worker alive" : " · Worker down"}
          </span>
        </li>
        <Row
          label="Latest price tick"
          state={health.ticks}
          detail={health.latestTickAt ? `${health.latestTickAt} (${health.latestTickAgeSeconds}s ago)` : "No ticks stored."}
        />
        <Row
          label="Last bonus-expiry run"
          state={health.bonusExpiry}
          detail={health.lastBonusExpiryAt ?? "The worker has not reported a bonus-expiry run."}
        />
        <Row
          label="Last payment retry run"
          state={health.paymentRetry}
          detail={health.lastPaymentRetryAt ?? "The worker has not reported a payment retry run."}
        />
        <li className="rounded-xl border border-line bg-card px-3 py-2">
          Last successful simulated payment retry: {health.lastSuccessfulPaymentRetryAt ?? "none recorded yet"}
        </li>
        {feed.sources.map((source) => (
          <li key={source.source} className="rounded-xl border border-line bg-card px-3 py-2">
            <span className="font-semibold">{source.source}</span> · {source.status} · priority {source.priority} · {source.enabled ? "enabled" : "disabled"}
            <span className="block text-xs text-muted">
              Last success {source.lastSuccessfulPoll?.toISOString() ?? "none"} · Last event {source.lastEventAt?.toISOString() ?? "none"} · Latency {averageLatencyMs(source.latencyTotalMs, source.latencySamples) ?? "—"} ms · Failures {source.consecutiveFailures} in a row
            </span>
          </li>
        ))}
        <li className="rounded-xl border border-line bg-card px-3 py-2">
          Active feed source: {feed.control.activeSource ?? "none"}. <Link className="text-india" href="/admin/market/live">Open live matches</Link>
        </li>
      </ul>
    </main>
  );
}

function workerDbStatus(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as { iterationMs?: number; connectionLimit?: number | null; poolTimeout?: number | null; poolTimeouts?: number; slowQueries?: number; at?: string };
    return `Pool ${parsed.connectionLimit ?? "default"} · timeout ${parsed.poolTimeout ?? "default"}s · last cycle ${parsed.iterationMs ?? "?"}ms · pool timeouts ${parsed.poolTimeouts ?? 0} · slow queries ${parsed.slowQueries ?? 0} · ${parsed.at ?? ""}`;
  } catch {
    return null;
  }
}

function Row({ label, state, detail }: { label: string; state: HealthState; detail: string }) {
  return (
    <li className="rounded-xl border border-line bg-card px-3 py-2">
      <span className="font-semibold">{label}</span> · {state}
      <span className="block text-xs text-muted">{detail}</span>
    </li>
  );
}
