import { randomUUID } from "crypto";
import { afterAll, expect, test } from "vitest";
import { isCompletionSummary } from "@/domain/shadow-validation";
import { ensureFeedConfig, freezeShadowSummary, ingestNormalizedEvent, markShadowValidated, setMatchStatus } from "@/server/feed";
import { prisma } from "@/server/prisma";
import type { NormalizedCricketEvent } from "@/domain/cricket-feed";

function phone() {
  return `+919${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`;
}

function delivery(matchId: string, over: number, ball: number): NormalizedCricketEvent {
  return {
    matchId,
    innings: 1,
    over,
    ball,
    sequence: over * 6 + ball,
    occurredAt: new Date().toISOString(),
    eventType: "SIX",
    battingPlayerId: null,
    bowlingPlayerId: null,
    fielderPlayerIds: [],
    battingExternalId: "shadow-batter",
    bowlingExternalId: null,
    fielderExternalIds: [],
    battingName: "Shadow Batter",
    runsBatter: 6,
    runsExtras: 0,
    runsTotal: 6,
    wicketType: null,
    isBoundary: true,
    isSix: true,
    isFour: false,
    rawDescription: "six",
    normalizedDescription: `six at ${over}.${ball}`,
    source: "Cricbuzz",
    sourceEventId: `shadow:${matchId}:${over}.${ball}`,
    sourceTimestamp: new Date(Date.now() - 500).toISOString(),
    confidence: 90,
  };
}

afterAll(async () => {
  await prisma.feedGapRecord.deleteMany();
  await prisma.feedUnclassifiedEvent.deleteMany();
  await prisma.feedReconciliationNote.deleteMany();
  await prisma.shadowMatchSignoff.deleteMany();
  await prisma.cricketMatchExternalId.deleteMany({ where: { source: "Cricbuzz", externalId: { startsWith: "shadow-" } } });
  await prisma.feedSourceState.update({ where: { source: "Cricbuzz" }, data: { operatingMode: "SHADOW", enabled: true, status: "HEALTHY", lastPollOutcome: "OK" } }).catch(() => undefined);
  await prisma.appSetting.deleteMany({ where: { key: { in: ["feed.realSourcePricingEnabled", "feed.realSourcePricingEnabledAt"] } } });
});

test("shadow mode still cannot price", async () => {
  await ensureFeedConfig();
  await prisma.feedSourceState.update({ where: { source: "Cricbuzz" }, data: { operatingMode: "SHADOW", enabled: true, status: "HEALTHY" } });
  const player = await prisma.player.create({
    data: {
      slug: `shadow-${randomUUID()}`,
      name: "Shadow Batter",
      shortName: "Shadow",
      role: "BATTER",
      referenceMidPaise: 10_000n,
      basePricePaise: 10_000n,
      midPricePaise: 10_000n,
      matchAnchorPaise: 10_000n,
      performanceMatchBps: 40,
      fictional: true,
      blurb: "Shadow validation",
      tradable: true,
    },
  });
  await prisma.priceTick.create({ data: { playerId: player.id, midPaise: 10_000n, source: "test" } });
  const before = await prisma.player.findUniqueOrThrow({ where: { id: player.id }, select: { midPricePaise: true, performanceMatchBps: true } });
  const ticks = await prisma.priceTick.count({ where: { playerId: player.id } });
  const quotes = await prisma.quote.count();
  const ledger = await prisma.ledgerEntry.count();
  const match = await prisma.cricketMatch.create({
    data: {
      competition: "Shadow",
      homeTeam: "India",
      awayTeam: "Australia",
      scheduledAt: new Date(),
      status: "LIVE",
      externalIds: { create: { source: "Cricbuzz", externalId: `shadow-${randomUUID()}` } },
    },
  });
  const result = await ingestNormalizedEvent(delivery(match.id, 0, 1));
  expect(result).toMatchObject({ stored: true, priced: false });
  expect(await prisma.matchEvent.count({ where: { idempotencyKey: { contains: match.id } } })).toBe(0);
  expect(await prisma.priceApplication.count({ where: { eventKey: { contains: match.id } } })).toBe(0);
  expect(await prisma.priceTick.count({ where: { playerId: player.id } })).toBe(ticks);
  expect(await prisma.quote.count()).toBe(quotes);
  expect(await prisma.ledgerEntry.count()).toBe(ledger);
  expect(await prisma.player.findUnique({ where: { id: player.id }, select: { midPricePaise: true, performanceMatchBps: true } })).toEqual(before);
  expect(await prisma.feedSourceState.findUnique({ where: { source: "Cricbuzz" } })).toMatchObject({ operatingMode: "SHADOW" });
});

test("manual validation requires a reason and does not activate the source", async () => {
  await ensureFeedConfig();
  const engine = await prisma.appSetting.findUnique({ where: { key: "pricing.engineMode" } });
  const actor = await prisma.user.create({ data: { phone: phone(), displayName: "Shadow Admin", role: "ADMIN" } });
  const match = await prisma.cricketMatch.create({
    data: {
      competition: "Sign-off",
      homeTeam: "India",
      awayTeam: "Australia",
      scheduledAt: new Date(),
      status: "SCHEDULED",
      externalIds: { create: { source: "Cricbuzz", externalId: `shadow-${randomUUID()}` } },
    },
  });
  await prisma.feedSourceState.update({ where: { source: "Cricbuzz" }, data: { operatingMode: "SHADOW", enabled: true, status: "HEALTHY" } });
  await expect(markShadowValidated({ matchId: match.id, actorId: actor.id, reason: "no" })).rejects.toThrow(/reason/i);
  await markShadowValidated({ matchId: match.id, actorId: actor.id, reason: "staff reviewed the shadow window" });
  const signoff = await prisma.shadowMatchSignoff.findUniqueOrThrow({ where: { matchId_source: { matchId: match.id, source: "Cricbuzz" } } });
  expect(signoff.validatedBy).toBe(actor.id);
  expect(signoff.validatedAt).toBeTruthy();
  expect(signoff.validationReason).toBe("staff reviewed the shadow window");
  expect(await prisma.feedSourceState.findUnique({ where: { source: "Cricbuzz" } })).toMatchObject({ operatingMode: "SHADOW" });
  const flag = await prisma.appSetting.findUnique({ where: { key: "feed.realSourcePricingEnabled" } });
  expect(flag?.value === true || flag?.value === "true").toBe(false);
  expect(await prisma.appSetting.findUnique({ where: { key: "pricing.engineMode" } })).toEqual(engine);
  const audit = await prisma.auditLog.findFirst({ where: { action: "feed.shadow_validated", entityId: match.id }, orderBy: { createdAt: "desc" } });
  expect(audit?.reason).toBe("staff reviewed the shadow window");
  expect(audit?.after).toMatchObject({ validated: true, operatingMode: "SHADOW", realSourcePricingEnabled: false });
});

test("a completed match keeps its frozen shadow summary", async () => {
  await ensureFeedConfig();
  await prisma.feedSourceState.update({ where: { source: "Cricbuzz" }, data: { operatingMode: "SHADOW", enabled: true, status: "HEALTHY" } });
  const match = await prisma.cricketMatch.create({
    data: {
      competition: "Complete",
      homeTeam: "India",
      awayTeam: "Australia",
      scheduledAt: new Date(),
      status: "LIVE",
      externalIds: { create: { source: "Cricbuzz", externalId: `shadow-${randomUUID()}` } },
    },
  });
  expect(await ingestNormalizedEvent(delivery(match.id, 0, 1))).toMatchObject({ priced: false });
  await setMatchStatus(match.id, "COMPLETED");
  const frozen = await prisma.shadowMatchSignoff.findUniqueOrThrow({ where: { matchId_source: { matchId: match.id, source: "Cricbuzz" } } });
  expect(frozen.summaryFrozenAt).toBeTruthy();
  expect(isCompletionSummary(frozen.summary)).toBe(true);
  if (!isCompletionSummary(frozen.summary)) return;
  expect(frozen.summary.totalEvents).toBe(1);
  expect(frozen.summary.source).toBe("Cricbuzz");
  const frozenAt = frozen.summaryFrozenAt;
  expect(await ingestNormalizedEvent(delivery(match.id, 0, 2))).toMatchObject({ priced: false });
  await freezeShadowSummary(match.id);
  const again = await prisma.shadowMatchSignoff.findUniqueOrThrow({ where: { matchId_source: { matchId: match.id, source: "Cricbuzz" } } });
  expect(again.summaryFrozenAt).toEqual(frozenAt);
  expect(isCompletionSummary(again.summary) && again.summary.totalEvents).toBe(1);
});
