import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  PULSE_PREVIEW_CONFIG_VERSION,
  classifyPulseFeed,
  pictureForPlayer,
  pulseActivityLabel,
  pulseCycleId,
  pulseFeedLabel,
  pulseSeedRef,
  quotedMidAnchor,
  stepPulsePreview,
  type PulseFeedPicture,
  type PulseState,
  type PulseStep,
} from "@/domain/pulse-preview";
import { getFeatureFlags } from "./features";
import { markOps } from "./ops-status";
import { prisma } from "./prisma";
import { getSettings } from "./settings";

const SEED_KEY = "pulse.previewSeed";

export type PulseCustomerView = {
  state: PulseStep["state"];
  activity: string;
  feedLabel: string;
  previewPaise: string;
  cycleId: string;
  at: string;
};

function isPulseState(value: string): value is PulseState {
  return value === "CALM" || value === "STEADY" || value === "ACTIVE" || value === "SURGE";
}

function isFeedPicture(value: string): value is PulseFeedPicture {
  return value === "HEALTHY_LIVE" || value === "OFF_MATCH" || value === "DEGRADED" || value === "CONFLICTING" || value === "STALE" || value === "UNKNOWN";
}

function customerView(row: {
  state: string;
  nextPreviewPaise: bigint;
  feedPicture: string;
  cycleId: string;
  createdAt: Date;
}): PulseCustomerView | null {
  if (!isPulseState(row.state) || !isFeedPicture(row.feedPicture)) return null;
  return {
    state: row.state,
    activity: pulseActivityLabel(row.state),
    feedLabel: pulseFeedLabel(row.feedPicture),
    previewPaise: row.nextPreviewPaise.toString(),
    cycleId: row.cycleId,
    at: row.createdAt.toISOString(),
  };
}

async function ensurePulseSeed(): Promise<string> {
  const existing = await prisma.appSetting.findUnique({ where: { key: SEED_KEY } });
  if (typeof existing?.value === "string" && existing.value.length >= 32) return existing.value;
  const seed = randomBytes(32).toString("hex");
  await prisma.appSetting.upsert({
    where: { key: SEED_KEY },
    create: { key: SEED_KEY, value: seed },
    update: { value: seed },
  });
  return seed;
}

async function marketPicture(nowMs: number): Promise<{ picture: PulseFeedPicture; sourceStatus: string | null; consensusConfidence: string | null }> {
  const settings = await getSettings();
  const [control, consensus] = await Promise.all([
    prisma.feedControl.findUnique({ where: { id: "default" } }),
    prisma.consensusEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { confidence: true, createdAt: true } }),
  ]);
  const source = control?.activeSource
    ? await prisma.feedSourceState.findUnique({ where: { source: control.activeSource } })
    : null;
  const recentConsensus = consensus && nowMs - consensus.createdAt.getTime() < 10 * 60 * 1000 ? consensus.confidence : null;
  return {
    picture: classifyPulseFeed({
      sourceStatus: source?.status ?? null,
      lastSuccessfulPollMs: source?.lastSuccessfulPoll ? source.lastSuccessfulPoll.getTime() : null,
      nowMs,
      staleAfterSeconds: settings.feedStaleAfterSeconds,
      consensusConfidence: recentConsensus,
      reconciliation: null,
    }),
    sourceStatus: source?.status ?? null,
    consensusConfidence: recentConsensus,
  };
}

async function storeCycle(step: PulseStep, inputs: Prisma.InputJsonValue): Promise<boolean> {
  try {
    await prisma.pulsePreviewCycle.create({
      data: {
        playerId: step.playerId,
        cycleId: step.cycleId,
        configVersion: step.configVersion,
        priorPreviewPaise: step.priorPreviewPaise,
        nextPreviewPaise: step.nextPreviewPaise,
        state: step.state,
        intensityMilli: step.intensityMilli,
        movementBeforeBps: step.movementBeforeBps,
        movementAfterBps: step.movementAfterBps,
        feedPicture: step.feedPicture,
        seedRef: step.seedRef,
        fairAnchorPaise: step.anchorPaise,
        randomPulseBps: step.randomPulseBps,
        anchorDriftBps: step.anchorDriftBps,
        feedScaleMilli: step.feedScaleMilli,
        finalMovementBps: step.finalMovementBps,
        deviationCapBps: step.deviationCapBps,
        inputs,
      },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

export async function runPulsePreview(nowMs = Date.now()): Promise<{ ran: boolean; cycleId: string | null; written: number }> {
  const flags = await getFeatureFlags();
  if (!flags.pulsePreviewEnabled) return { ran: false, cycleId: null, written: 0 };
  const seed = await ensurePulseSeed();
  const cycleId = pulseCycleId(nowMs);
  const market = await marketPicture(nowMs);
  const players = await prisma.player.findMany({
    where: { tradable: true },
    select: { id: true, liveMatch: true, midPricePaise: true },
  });
  const priors = await prisma.pulsePreviewCycle.findMany({
    where: { playerId: { in: players.map((player) => player.id) }, configVersion: PULSE_PREVIEW_CONFIG_VERSION },
    orderBy: [{ playerId: "asc" }, { createdAt: "desc" }],
    distinct: ["playerId"],
    select: { playerId: true, nextPreviewPaise: true },
  });
  const priorByPlayer = new Map(priors.map((row) => [row.playerId, row.nextPreviewPaise]));
  let written = 0;
  for (const player of players) {
    const picture = pictureForPlayer(market.picture, player.liveMatch);
    const anchor = quotedMidAnchor(player.midPricePaise);
    const step = stepPulsePreview({
      seed,
      playerId: player.id,
      cycleId,
      priorPreviewPaise: priorByPlayer.get(player.id) ?? anchor.anchorPaise,
      anchorPaise: anchor.anchorPaise,
      anchorSource: anchor.source,
      feedPicture: picture,
    });
    const before = await prisma.pulsePreviewCycle.findUnique({
      where: {
        playerId_cycleId_configVersion: {
          playerId: player.id,
          cycleId,
          configVersion: PULSE_PREVIEW_CONFIG_VERSION,
        },
      },
      select: { id: true },
    });
    if (before) continue;
    const stored = await storeCycle(step, {
      feedPicture: picture,
      playerLive: player.liveMatch,
      sourceStatus: market.sourceStatus,
      consensusConfidence: market.consensusConfidence,
      configVersion: step.configVersion,
      anchorSource: step.anchorSource,
      scaledPulseBps: step.scaledPulseBps,
    });
    if (stored) written += 1;
  }
  await markOps("ops.pulsePreviewAt", new Date(nowMs).toISOString());
  return { ran: true, cycleId, written };
}

export async function latestPulsePreviews(): Promise<Map<string, PulseCustomerView>> {
  const rows = await prisma.pulsePreviewCycle.findMany({
    where: { configVersion: PULSE_PREVIEW_CONFIG_VERSION },
    orderBy: [{ playerId: "asc" }, { createdAt: "desc" }],
    distinct: ["playerId"],
    select: {
      playerId: true,
      cycleId: true,
      state: true,
      nextPreviewPaise: true,
      feedPicture: true,
      createdAt: true,
    },
  });
  const views = new Map<string, PulseCustomerView>();
  for (const row of rows) {
    const view = customerView(row);
    if (view) views.set(row.playerId, view);
  }
  return views;
}

export async function pulsePreviewStatus() {
  const [flags, settings, latest, recent, seedRow] = await Promise.all([
    getFeatureFlags(),
    getSettings(),
    prisma.pulsePreviewCycle.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.pulsePreviewCycle.findMany({ orderBy: { createdAt: "desc" }, take: 12, include: { player: { select: { name: true } } } }),
    prisma.appSetting.findUnique({ where: { key: SEED_KEY } }),
  ]);
  const seed = typeof seedRow?.value === "string" ? seedRow.value : null;
  return {
    enabled: flags.pulsePreviewEnabled,
    configVersion: PULSE_PREVIEW_CONFIG_VERSION,
    engineMode: settings.engineMode,
    realSourcePricingEnabled: settings.realSourcePricingEnabled,
    seedRef: seed ? pulseSeedRef(seed) : null,
    lastTickAt: latest?.createdAt.toISOString() ?? null,
    recent,
  };
}
