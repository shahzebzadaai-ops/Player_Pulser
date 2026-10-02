import { eventFreshnessSeconds } from "@/domain/cricket-feed";
import { consensusEngineHealth, isUsableConsensusSource } from "@/domain/consensus-feed";
import { engineModeSummary } from "@/domain/pricing-engine";
import { listenerHealth, sseHealth } from "@/domain/realtime";
import { prisma } from "./prisma";
import { getSettings } from "./settings";

export type HealthState = "HEALTHY" | "DEGRADED" | "DOWN";

const HEARTBEAT = "ops.workerHeartbeat";
const BONUS_EXPIRY = "ops.lastBonusExpiry";
const PAYMENT_RETRY = "ops.lastPaymentRetry";
const PAYMENT_RETRY_SUCCESS = "ops.lastPaymentRetrySuccess";
const LISTENER_AT = "ops.realtimeListenerAt";
const SSE_LAST_PUSH = "ops.sseLastPushAt";

export async function markOps(key: string, value: string = new Date().toISOString()): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function markWorkerHeartbeat(): Promise<void> {
  await markOps(HEARTBEAT);
}

export async function markBonusExpiryRun(): Promise<void> {
  await markOps(BONUS_EXPIRY);
}

export async function markPaymentRetryRun(succeeded: number): Promise<void> {
  await markOps(PAYMENT_RETRY);
  if (succeeded > 0) await markOps(PAYMENT_RETRY_SUCCESS);
}

function ageMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return Date.now() - time;
}

function workerState(age: number | null): HealthState {
  if (age === null) return "DOWN";
  if (age <= 20_000) return "HEALTHY";
  if (age <= 60_000) return "DEGRADED";
  return "DOWN";
}

function runState(age: number | null, worker: HealthState): HealthState {
  if (worker === "DOWN") return "DOWN";
  if (age === null || age > 30_000) return "DEGRADED";
  return "HEALTHY";
}

export async function getSystemHealth(): Promise<{
  overall: HealthState;
  postgres: HealthState;
  app: HealthState;
  worker: HealthState;
  ticks: HealthState;
  paymentRetry: HealthState;
  bonusExpiry: HealthState;
  latestTickAt: string | null;
  latestTickAgeSeconds: number | null;
  heartbeatAt: string | null;
  lastPaymentRetryAt: string | null;
  lastSuccessfulPaymentRetryAt: string | null;
  lastBonusExpiryAt: string | null;
  feed: {
    worker: HealthState;
    activeSource: string | null;
    activeSourceStatus: string;
    activeSourceState: HealthState;
    engineMode: string;
    engineSummary: string;
    lastPollAt: string | null;
    lastPollState: HealthState;
    lastEventAt: string | null;
    lastEventState: HealthState;
    lastEventDetail: string;
    lastPriceApplicationAt: string | null;
    lastPriceApplicationState: HealthState;
    listener: HealthState;
    listenerAt: string | null;
    sse: HealthState;
    sseAt: string | null;
    cricketSources: { source: string; status: HealthState }[];
    consensus: HealthState;
  };
}> {
  let postgres: HealthState = "DOWN";
  try {
    await prisma.$queryRaw`SELECT 1`;
    postgres = "HEALTHY";
  } catch {
    postgres = "DOWN";
  }
  const [heartbeat, bonus, retry, success, latest, listenerRow, sseRow, control, sources, latestEvent, liveMatch, latestPerformance, latestConsensus] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: HEARTBEAT } }),
    prisma.appSetting.findUnique({ where: { key: BONUS_EXPIRY } }),
    prisma.appSetting.findUnique({ where: { key: PAYMENT_RETRY } }),
    prisma.appSetting.findUnique({ where: { key: PAYMENT_RETRY_SUCCESS } }),
    prisma.priceTick.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.appSetting.findUnique({ where: { key: LISTENER_AT } }),
    prisma.appSetting.findUnique({ where: { key: SSE_LAST_PUSH } }),
    prisma.feedControl.findUnique({ where: { id: "default" } }),
    prisma.feedSourceState.findMany(),
    prisma.cricketEvent.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.cricketMatch.findFirst({ where: { status: "LIVE" }, orderBy: { updatedAt: "desc" } }),
    prisma.priceTick.findFirst({ where: { source: "performance" }, orderBy: { createdAt: "desc" } }),
    prisma.consensusEvent.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);
  const heartbeatAge = ageMs(heartbeat?.value);
  const worker = postgres === "DOWN" ? "DOWN" : workerState(heartbeatAge);
  const tickAge = latest ? Date.now() - latest.createdAt.getTime() : null;
  const settings = postgres === "HEALTHY" ? await getSettings() : null;
  let ticks: HealthState = "DEGRADED";
  if (!latest || tickAge === null) ticks = worker === "DOWN" ? "DOWN" : "DEGRADED";
  else if (settings?.pricingMode !== "simulation" || settings.engineMode === "EVENT_DRIVEN") ticks = "HEALTHY";
  else if (tickAge <= 30_000) ticks = "HEALTHY";
  else ticks = worker === "DOWN" ? "DOWN" : "DEGRADED";
  const paymentRetry = runState(ageMs(retry?.value), worker);
  const bonusExpiry = runState(ageMs(bonus?.value), worker);
  const listener = postgres === "DOWN" ? "DOWN" : listenerHealth(ageMs(listenerRow?.value));
  const sse = sseHealth({ listener, lastPushAgeMs: ageMs(sseRow?.value) });
  const active = sources.find((source) => source.source === control?.activeSource) ?? null;
  const activeSourceState: HealthState = !control
    ? "DEGRADED"
    : !active || active.status === "DOWN" || active.status === "DISABLED"
    ? "DOWN"
    : active.status === "DEGRADED"
      ? "DEGRADED"
      : "HEALTHY";
  const pollAge = control?.lastPolledAt ? Date.now() - control.lastPolledAt.getTime() : null;
  const lastPollState: HealthState = worker === "DOWN" ? "DOWN" : pollAge === null || pollAge > 60_000 ? "DEGRADED" : "HEALTHY";
  const freshness = eventFreshnessSeconds({
    nowMs: Date.now(),
    lastEventAtMs: latestEvent?.occurredAt.getTime() ?? null,
    status: liveMatch?.status ?? "SCHEDULED",
  });
  const quiet = liveMatch?.status === "INNINGS_BREAK" || liveMatch?.status === "DELAYED";
  const lastEventState: HealthState = worker === "DOWN" ? "DOWN" : "HEALTHY";
  const lastEventDetail = latestEvent
    ? `${latestEvent.createdAt.toISOString()}${freshness === null ? "" : ` · ${freshness}s since the ball`}${quiet || !liveMatch ? " · a quiet period is not a source failure" : ""}`
    : "No cricket event stored yet. A quiet match is not a source failure.";
  const lastPriceApplicationState: HealthState = worker === "DOWN"
    ? "DOWN"
    : settings?.engineMode === "EVENT_DRIVEN" && !latestPerformance
      ? "DEGRADED"
      : "HEALTHY";
  const states = [postgres, worker, ticks, paymentRetry, bonusExpiry, listener, activeSourceState];
  const overall: HealthState = states.includes("DOWN") ? "DOWN" : states.includes("DEGRADED") ? "DEGRADED" : "HEALTHY";
  const cricketNames = ["CREX", "Sportskeeda", "Cricbuzz"] as const;
  const cricketSources = cricketNames.map((name) => {
    const row = sources.find((source) => source.source === name);
    const status: HealthState = !row || row.status === "DOWN" || row.status === "DISABLED" || row.operatingMode === "DISABLED" ? "DOWN" : row.status === "DEGRADED" ? "DEGRADED" : "HEALTHY";
    return { source: name, status };
  });
  const usableSources = sources.filter((source) => cricketNames.includes(source.source as "CREX" | "Sportskeeda" | "Cricbuzz") && isUsableConsensusSource(source)).length;
  const latestConfidence = latestConsensus?.confidence === "CONFIDENCE_HIGH" || latestConsensus?.confidence === "CONFIDENCE_MEDIUM" || latestConsensus?.confidence === "CONFIDENCE_LOW" || latestConsensus?.confidence === "CONFLICT"
    ? latestConsensus.confidence
    : null;
  const consensus = consensusEngineHealth({ usableSources, latestConfidence });
  return {
    overall,
    postgres,
    app: postgres,
    worker,
    ticks,
    paymentRetry,
    bonusExpiry,
    latestTickAt: latest?.createdAt.toISOString() ?? null,
    latestTickAgeSeconds: tickAge === null ? null : Math.round(tickAge / 1000),
    heartbeatAt: typeof heartbeat?.value === "string" ? heartbeat.value : null,
    lastPaymentRetryAt: typeof retry?.value === "string" ? retry.value : null,
    lastSuccessfulPaymentRetryAt: typeof success?.value === "string" ? success.value : null,
    lastBonusExpiryAt: typeof bonus?.value === "string" ? bonus.value : null,
    feed: {
      worker,
      activeSource: control?.activeSource ?? null,
      activeSourceStatus: active?.status ?? "DOWN",
      activeSourceState,
      engineMode: settings?.engineMode ?? "SIMULATION",
      engineSummary: engineModeSummary(settings?.engineMode === "EVENT_DRIVEN" ? "EVENT_DRIVEN" : "SIMULATION"),
      lastPollAt: control?.lastPolledAt?.toISOString() ?? null,
      lastPollState,
      lastEventAt: latestEvent?.createdAt.toISOString() ?? null,
      lastEventState,
      lastEventDetail,
      lastPriceApplicationAt: latestPerformance?.createdAt.toISOString() ?? null,
      lastPriceApplicationState,
      listener,
      listenerAt: typeof listenerRow?.value === "string" ? listenerRow.value : null,
      sse,
      sseAt: typeof sseRow?.value === "string" ? sseRow.value : null,
      cricketSources,
      consensus,
    },
  };
}
