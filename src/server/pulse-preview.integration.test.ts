import { randomUUID } from "crypto";
import { expect, test } from "vitest";
import { PULSE_PREVIEW_CONFIG_VERSION, PULSE_PREVIEW_V1_CONFIG_VERSION } from "@/domain/pulse-preview";
import { invalidateFeatureFlags } from "@/server/features";
import { prisma } from "@/server/prisma";
import { runPulsePreview } from "@/server/pulse-preview";
import { getSettings } from "@/server/settings";

async function setPreview(enabled: boolean) {
  await prisma.appSetting.upsert({
    where: { key: "feature.pulsePreviewEnabled" },
    create: { key: "feature.pulsePreviewEnabled", value: enabled },
    update: { value: enabled },
  });
  invalidateFeatureFlags();
}

async function makePlayer() {
  return prisma.player.create({
    data: {
      slug: `pulse-${randomUUID()}`,
      name: "Pulse Test",
      shortName: "Pulse",
      role: "BATTER",
      referenceMidPaise: 8_000n,
      basePricePaise: 8_000n,
      midPricePaise: 1_775n,
      matchAnchorPaise: 10_000n,
      fictional: true,
      blurb: "Preview only",
      tradable: true,
      liveMatch: true,
    },
  });
}

test("pulse preview stays off the executable price, wallet, and holdings", async () => {
  const beforeSettings = await getSettings();
  const consensusBefore = await prisma.feedSourceState.findUnique({ where: { source: "Consensus" } });
  const player = await makePlayer();
  const tickCount = await prisma.priceTick.count({ where: { playerId: player.id } });
  const ledgerCount = await prisma.ledgerEntry.count();
  const holdingCount = await prisma.holdingLot.count();
  const quoteCount = await prisma.quote.count();
  const tradeCount = await prisma.trade.count();
  const riskCount = await prisma.riskStateChange.count();
  await prisma.pulsePreviewCycle.create({
    data: {
      playerId: player.id,
      cycleId: "v1-history",
      configVersion: PULSE_PREVIEW_V1_CONFIG_VERSION,
      priorPreviewPaise: 8_000n,
      nextPreviewPaise: 8_000n,
      state: "SURGE",
      intensityMilli: 1000,
      movementBeforeBps: 120,
      movementAfterBps: 120,
      feedPicture: "HEALTHY_LIVE",
      seedRef: "earlier",
      inputs: { note: "v1 audit row" },
    },
  });
  await setPreview(false);
  const skipped = await runPulsePreview(1_700_000_000_000);
  expect(skipped.ran).toBe(false);
  expect(await prisma.pulsePreviewCycle.count({ where: { playerId: player.id, configVersion: PULSE_PREVIEW_CONFIG_VERSION } })).toBe(0);

  await setPreview(true);
  const now = 1_700_000_015_000;
  const first = await runPulsePreview(now);
  const second = await runPulsePreview(now);
  const rows = await prisma.pulsePreviewCycle.findMany({ where: { playerId: player.id, configVersion: PULSE_PREVIEW_CONFIG_VERSION } });
  const history = await prisma.pulsePreviewCycle.findMany({ where: { playerId: player.id, configVersion: PULSE_PREVIEW_V1_CONFIG_VERSION } });
  expect(first.ran).toBe(true);
  expect(first.written).toBeGreaterThan(0);
  expect(second.written).toBe(0);
  expect(rows).toHaveLength(1);
  expect(history).toHaveLength(1);
  expect(history[0]?.nextPreviewPaise).toBe(8_000n);
  expect(rows[0]?.cycleId).toBe(first.cycleId);
  expect(rows[0]?.configVersion).toBe(PULSE_PREVIEW_CONFIG_VERSION);
  expect(rows[0]?.priorPreviewPaise).toBe(player.midPricePaise);
  expect(rows[0]?.fairAnchorPaise).toBe(player.midPricePaise);
  expect(rows[0]?.randomPulseBps).not.toBeNull();
  expect(Math.abs(rows[0]?.randomPulseBps ?? 0)).toBeLessThanOrEqual(25);

  const stored = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
  expect(stored.midPricePaise).toBe(player.midPricePaise);
  expect(await prisma.priceTick.count({ where: { playerId: player.id } })).toBe(tickCount);
  expect(await prisma.ledgerEntry.count()).toBe(ledgerCount);
  expect(await prisma.holdingLot.count()).toBe(holdingCount);
  expect(await prisma.quote.count()).toBe(quoteCount);
  expect(await prisma.trade.count()).toBe(tradeCount);
  expect(await prisma.riskStateChange.count()).toBe(riskCount);

  const afterSettings = await getSettings();
  expect(afterSettings.engineMode).toBe("SIMULATION");
  expect(afterSettings.engineMode).toBe(beforeSettings.engineMode);
  expect(afterSettings.realSourcePricingEnabled).toBe(false);
  const consensusAfter = await prisma.feedSourceState.findUnique({ where: { source: "Consensus" } });
  expect(consensusAfter?.operatingMode ?? null).toBe(consensusBefore?.operatingMode ?? null);
  if (consensusAfter) expect(consensusAfter.operatingMode).toBe("SHADOW");

  await setPreview(false);
  const stopped = await runPulsePreview(now + 60_000);
  expect(stopped.ran).toBe(false);
  expect(await prisma.pulsePreviewCycle.count({ where: { playerId: player.id, configVersion: PULSE_PREVIEW_CONFIG_VERSION } })).toBe(1);
  expect(await prisma.pulsePreviewCycle.count({ where: { playerId: player.id } })).toBe(2);
});
