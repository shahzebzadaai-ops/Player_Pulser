import { formatPaise } from "@/domain/money";
import { previewDistanceBps, pulseActivityLabel, pulseFeedLabel, type PulseFeedPicture, type PulseState } from "@/domain/pulse-preview";
import { PulsePreviewSwitch } from "@/components/pulse-admin";
import { assertPagePermission } from "@/server/guard";
import { getSystemHealth } from "@/server/ops-status";
import { prisma } from "@/server/prisma";
import { pulsePreviewStatus } from "@/server/pulse-preview";

export const metadata = { title: "Simulation preview" };

function isState(value: string): value is PulseState {
  return value === "CALM" || value === "STEADY" || value === "ACTIVE" || value === "SURGE";
}

function isPicture(value: string): value is PulseFeedPicture {
  return value === "HEALTHY_LIVE" || value === "OFF_MATCH" || value === "DEGRADED" || value === "CONFLICTING" || value === "STALE" || value === "UNKNOWN";
}

function distanceLabel(nextPaise: bigint, anchorPaise: bigint | null): string {
  if (anchorPaise === null || anchorPaise <= 0n) return "Earlier configuration";
  const bps = previewDistanceBps(nextPaise, anchorPaise);
  const sign = bps > 0 ? "+" : "";
  return `${sign}${(bps / 100).toFixed(2)}%`;
}

export default async function PulsePreviewPage() {
  await assertPagePermission("player.view");
  const [status, health, consensus] = await Promise.all([
    pulsePreviewStatus(),
    getSystemHealth(),
    prisma.feedSourceState.findUnique({ where: { source: "Consensus" }, select: { operatingMode: true, enabled: true } }),
  ]);
  const stale = status.enabled && (!status.lastTickAt || Date.now() - Date.parse(status.lastTickAt) > 45_000);
  const latestPicture = status.recent[0]?.feedPicture ?? null;
  const problems: string[] = [];
  if (stale) problems.push("Preview is on, and a tick has not been stored in the last 45 seconds.");
  if (latestPicture === "STALE" || latestPicture === "UNKNOWN" || latestPicture === "DEGRADED" || latestPicture === "CONFLICTING") {
    problems.push(`Latest feed picture is ${latestPicture}. Preview intensity is reduced. This is not a verified cricket event.`);
  }
  return (
    <main>
      <h2 className="text-2xl font-bold">Simulation preview</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">Simulation only — no effect on cash settlement.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <PulsePreviewSwitch enabled={status.enabled} />
        <section className="rounded-2xl border border-line bg-card p-4 text-sm">
          <p className="font-semibold">Current simulation state</p>
          <p className="mt-2">Preview: {status.enabled ? "Running" : "Stopped"}</p>
          <p>Worker: {health.worker}</p>
          <p>Configuration: {status.configVersion}</p>
          <p>Last successful tick: {status.lastTickAt ?? "None yet"}</p>
          <p>Pricing engine: {status.engineMode}</p>
          <p>Real-source pricing: {status.realSourcePricingEnabled ? "On" : "Off"}</p>
          <p>Consensus mode: {consensus?.operatingMode ?? "Not configured"}{consensus && !consensus.enabled ? " · source disabled" : ""}</p>
        </section>
      </div>
      <section className="mt-4 rounded-2xl border border-line bg-card p-4 text-sm">
        <h3 className="font-semibold">Problems</h3>
        {problems.length === 0 ? <p className="mt-2 text-muted">No preview problems.</p> : (
          <ul className="mt-2 space-y-1">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
        )}
      </section>
      <section className="mt-4">
        <h3 className="font-semibold">Recent cycles</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {status.recent.length === 0 ? <li className="text-muted">No preview cycles yet.</li> : null}
          {status.recent.map((cycle) => (
            <li key={cycle.id} className="rounded-2xl border border-line bg-card p-3">
              <p className="font-semibold">{cycle.player.name}</p>
              <p className="text-muted">
                {isState(cycle.state) ? pulseActivityLabel(cycle.state) : cycle.state}
                {" · "}
                {isPicture(cycle.feedPicture) ? pulseFeedLabel(cycle.feedPicture) : cycle.feedPicture}
                {" · "}
                {formatPaise(cycle.nextPreviewPaise)}
                {" · "}
                {cycle.configVersion}
              </p>
              <p className="text-xs text-muted">
                Anchor {cycle.fairAnchorPaise === null ? "Earlier configuration" : formatPaise(cycle.fairAnchorPaise)}
                {" · "}
                Distance {distanceLabel(cycle.nextPreviewPaise, cycle.fairAnchorPaise)}
              </p>
              <p className="text-xs text-muted">{cycle.createdAt.toISOString()}</p>
            </li>
          ))}
        </ul>
      </section>
      <details className="mt-4 rounded-2xl border border-line bg-card p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Advanced diagnostics</summary>
        <p className="mt-2 text-muted">The active seed stays private. This page shows a reference only.</p>
        <p className="mt-2">Seed reference: {status.seedRef ?? "Not created yet"}</p>
        <ul className="mt-3 space-y-3">
          {status.recent.map((cycle) => (
            <li key={`${cycle.id}-detail`} className="rounded-xl bg-pitch p-3 text-xs">
              <p>{cycle.player.name} · cycle {cycle.cycleId}</p>
              <p>Seed reference {cycle.seedRef} · version {cycle.configVersion}</p>
              <p>Fair anchor {cycle.fairAnchorPaise === null ? "Earlier configuration" : `${cycle.fairAnchorPaise.toString()} paise`}</p>
              <p>Previous preview {cycle.priorPreviewPaise.toString()} paise · new preview {cycle.nextPreviewPaise.toString()} paise</p>
              <p>Distance from anchor {distanceLabel(cycle.nextPreviewPaise, cycle.fairAnchorPaise)}</p>
              <p>Pulse state {isState(cycle.state) ? pulseActivityLabel(cycle.state) : cycle.state}</p>
              <p>Raw pulse {cycle.randomPulseBps ?? cycle.movementBeforeBps} bps · anchor drift {cycle.anchorDriftBps ?? "Earlier configuration"} bps</p>
              <p>Feed scale {cycle.feedScaleMilli === null ? "Earlier configuration" : `${cycle.feedScaleMilli / 10}%`} · final movement {cycle.finalMovementBps ?? cycle.movementAfterBps} bps</p>
              <p>Deviation cap {cycle.deviationCapBps === null ? "Earlier configuration" : `${(cycle.deviationCapBps / 100).toFixed(2)}%`}</p>
              <p className="break-all">Inputs {JSON.stringify(cycle.inputs)}</p>
            </li>
          ))}
        </ul>
      </details>
    </main>
  );
}
