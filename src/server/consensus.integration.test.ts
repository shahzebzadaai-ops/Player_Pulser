import { randomUUID } from "crypto";
import { afterAll, expect, test } from "vitest";
import type { NormalizedCricketEvent } from "@/domain/cricket-feed";
import { ensureFeedConfig, ingestNormalizedEvent } from "@/server/feed";
import { applyPendingPricing } from "@/server/pricing";
import { prisma } from "@/server/prisma";
import { setRealSourcePricingEnabled } from "@/server/settings";

function phone() {
  return `+919${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`;
}

function agreed(matchId: string, ball: number, confidence: NormalizedCricketEvent["consensusConfidence"], playerId: string): NormalizedCricketEvent {
  return {
    matchId,
    innings: 1,
    over: 2,
    ball,
    sequence: ball,
    occurredAt: new Date().toISOString(),
    eventType: "FOUR",
    battingPlayerId: playerId,
    bowlingPlayerId: null,
    fielderPlayerIds: [],
    battingExternalId: null,
    bowlingExternalId: null,
    fielderExternalIds: [],
    runsBatter: 4,
    runsExtras: 0,
    runsTotal: 4,
    wicketType: null,
    isBoundary: true,
    isSix: false,
    isFour: true,
    rawDescription: null,
    normalizedDescription: "FOUR",
    source: "Consensus",
    sourceEventId: `consensus:${matchId}:${ball}:${confidence}`,
    sourceTimestamp: new Date().toISOString(),
    confidence: 90,
    consensusConfidence: confidence,
    consensusIdentityConfirmed: true,
  };
}

afterAll(async () => {
  await prisma.consensusEvent.deleteMany();
  await prisma.feedIncident.deleteMany({ where: { source: "Consensus" } });
  await prisma.feedSourceState.update({ where: { source: "Consensus" }, data: { operatingMode: "SHADOW", enabled: false, status: "HEALTHY" } }).catch(() => undefined);
  await prisma.appSetting.deleteMany({ where: { key: { in: ["feed.realSourcePricingEnabled", "feed.realSourcePricingEnabledAt", "pricing.engineMode"] } } }).catch(() => undefined);
});

test("a high consensus event prices once and low or conflict events do not", async () => {
  await ensureFeedConfig();
  const actor = await prisma.user.create({ data: { phone: phone(), displayName: "Consensus Admin", role: "ADMIN" } });
  const player = await prisma.player.create({
    data: {
      slug: `cons-${randomUUID()}`,
      name: "Consensus Batter",
      shortName: "Cons",
      role: "BATTER",
      referenceMidPaise: 10_000n,
      basePricePaise: 10_000n,
      midPricePaise: 10_000n,
      matchAnchorPaise: 10_000n,
      performanceMatchBps: 40,
      fictional: true,
      blurb: "Consensus test",
      tradable: true,
    },
  });
  await prisma.priceTick.create({ data: { playerId: player.id, midPaise: 10_000n, source: "test" } });
  const match = await prisma.cricketMatch.create({
    data: { competition: "Consensus", homeTeam: "India", awayTeam: "Australia", scheduledAt: new Date(), status: "LIVE" },
  });
  await prisma.appSetting.upsert({ where: { key: "pricing.engineMode" }, create: { key: "pricing.engineMode", value: "EVENT_DRIVEN" }, update: { value: "EVENT_DRIVEN" } });
  await setRealSourcePricingEnabled({ enabled: true, actorId: actor.id, reason: "consensus pricing test" });
  await prisma.feedSourceState.update({ where: { source: "Consensus" }, data: { operatingMode: "ACTIVE", status: "HEALTHY", enabled: false } });
  await prisma.feedActivation.create({
    data: {
      source: "Consensus",
      matchId: match.id,
      activatedAt: new Date(Date.now() - 1000),
      activationInnings: 1,
      activationOver: 2,
      activationBall: 1,
      activationReason: "consensus test",
      baselinePending: false,
    },
  });
  await prisma.feedHighWater.create({
    data: { source: "Consensus", matchId: match.id, startedMidMatch: false, continuity: "CONTINUOUS", latestInnings: 1, latestOver: 2, latestBall: 1 },
  });
  const high = agreed(match.id, 2, "CONFIDENCE_HIGH", player.id);
  expect(await ingestNormalizedEvent(high)).toMatchObject({ stored: true, priced: true });
  expect(await ingestNormalizedEvent(high)).toMatchObject({ duplicate: true, priced: false });
  expect(await prisma.matchEvent.count({ where: { playerId: player.id, simulated: false } })).toBe(1);
  expect(await ingestNormalizedEvent(agreed(match.id, 3, "CONFIDENCE_LOW", player.id))).toMatchObject({ stored: true, priced: false });
  expect(await ingestNormalizedEvent(agreed(match.id, 4, "CONFLICT", player.id))).toMatchObject({ stored: true, priced: false });
  expect(await ingestNormalizedEvent(agreed(match.id, 5, "CONFIDENCE_MEDIUM", player.id))).toMatchObject({ stored: true, priced: true });
  expect(await prisma.matchEvent.count({ where: { playerId: player.id, simulated: false } })).toBe(2);
  expect(await applyPendingPricing(player.id)).toBeGreaterThan(0);
  expect(await prisma.priceTick.count({ where: { playerId: player.id, eventType: "FOUR" } })).toBe(2);
  await setRealSourcePricingEnabled({ enabled: false, actorId: actor.id, reason: "close consensus pricing test" });
});
