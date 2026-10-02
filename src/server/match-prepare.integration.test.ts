import { randomUUID } from "crypto";
import { expect, test } from "vitest";
import { getSettings } from "@/server/settings";
import { prisma } from "@/server/prisma";
import { advancePreparedShadowMatches, confirmSafePlayerMappings, prepareShadowMatch, refreshIndiaDiscoveries } from "@/server/match-prepare";

const start = "2026-10-02T14:00:00.000Z";

function indiaList(sourceId: string, status: string) {
  return {
    matches: [{
      id: sourceId,
      t1: "India",
      t2: "Australia",
      event: "India tour of Australia 2026",
      datetime: start,
      status,
      format: "T20",
      venue: "Melbourne Cricket Ground",
    }],
  };
}

test("preparation attaches one canonical match and does not enable pricing", async () => {
  const before = await getSettings();
  const suffix = randomUUID().slice(0, 8);
  const availability = await refreshIndiaDiscoveries({
    crexPage: async () => JSON.stringify([{
      key: `crex-${suffix}`,
      team1: "IND",
      team2: "AUS",
      competition: "India tour of Australia 2026",
      start,
      status: "upcoming",
      format: "T20",
      venue: "Melbourne Cricket Ground",
    }]),
    sportskeedaMatches: async () => indiaList(`sk-${suffix}`, "upcoming"),
    cricbuzz: async () => [{
      source: "Cricbuzz",
      externalId: `cb-${suffix}`,
      homeTeam: "India Men",
      awayTeam: "Australia",
      competition: "India tour of Australia 2026",
      scheduledAt: start,
      matchFormat: "T20",
      venue: "Melbourne",
      providerStatus: "upcoming",
    }],
  });
  expect(availability).toEqual({ CREX: "FOUND", Sportskeeda: "FOUND", Cricbuzz: "FOUND" });
  const stored = await prisma.discoveredCricketMatch.findMany({
    where: { externalId: { in: [`crex-${suffix}`, `sk-${suffix}`, `cb-${suffix}`] } },
  });
  const { resolveCrossSourceMatches } = await import("@/domain/match-resolver");
  const [resolved] = resolveCrossSourceMatches(stored.map((row) => ({
    source: row.source as "CREX" | "Sportskeeda" | "Cricbuzz",
    externalId: row.externalId,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    competition: row.competition,
    scheduledAt: row.scheduledAt.toISOString(),
    matchFormat: row.matchFormat,
    venue: row.venue,
    providerStatus: row.providerStatus,
  })));
  expect(resolved?.foundCount).toBe(3);
  const prepared = await prepareShadowMatch({ match: resolved!, reason: "prepare shadow test" });
  const again = await prepareShadowMatch({ match: resolved!, reason: "prepare shadow again" });
  expect(again.matchId).toBe(prepared.matchId);
  expect(await prisma.cricketMatch.count({ where: { id: prepared.matchId } })).toBe(1);
  expect(await prisma.cricketMatchExternalId.count({ where: { matchId: prepared.matchId } })).toBe(3);
  const modes = await prisma.feedSourceState.findMany({
    where: { source: { in: ["CREX", "Sportskeeda", "Cricbuzz", "Consensus"] } },
  });
  expect(modes.find((row) => row.source === "Consensus")?.operatingMode).toBe("SHADOW");
  expect(modes.find((row) => row.source === "Consensus")?.enabled).toBe(false);
  expect(modes.find((row) => row.source === "CREX")?.enabled).toBe(false);
  expect(modes.find((row) => row.source === "Sportskeeda")?.enabled).toBe(false);
  const after = await getSettings();
  expect(after.realSourcePricingEnabled).toBe(before.realSourcePricingEnabled);
  expect(after.engineMode).toBe(before.engineMode);
  expect(after.engineMode).toBe("SIMULATION");
  expect(after.realSourcePricingEnabled).toBe(false);

  const player = await prisma.player.create({
    data: {
      slug: `prep-${suffix}`,
      name: `Prep Batter ${suffix}`,
      shortName: "VK",
      role: "BATTER",
      referenceMidPaise: 10_000n,
      basePricePaise: 10_000n,
      midPricePaise: 10_000n,
      matchAnchorPaise: 10_000n,
      fictional: true,
      blurb: "Prepare test",
      tradable: true,
    },
  });
  await prisma.playerFeedMapping.create({
    data: {
      matchId: prepared.matchId,
      source: "CREX",
      externalPlayerId: `crex-player-${suffix}`,
      externalPlayerName: `Prep Batter ${suffix}`,
      internalPlayerId: player.id,
      mappingStatus: "MAPPED",
      participationStatus: "PLAYING_XI",
    },
  });
  await prisma.playerFeedMapping.createMany({
    data: [
      { matchId: prepared.matchId, source: "Sportskeeda", externalPlayerId: `sk-player-${suffix}`, externalPlayerName: `Prep Batter ${suffix}`, mappingStatus: "UNMAPPED", participationStatus: "PLAYING_XI" },
      { matchId: prepared.matchId, source: "Cricbuzz", externalPlayerId: `cb-player-${suffix}`, externalPlayerName: `Prep Batter ${suffix}`, mappingStatus: "UNMAPPED", participationStatus: "SQUAD" },
    ],
  });
  const confirmed = await confirmSafePlayerMappings({ matchId: prepared.matchId, reason: "confirm safe test" });
  expect(confirmed.confirmed).toBe(1);
  const mapped = await prisma.playerFeedMapping.findMany({ where: { matchId: prepared.matchId, mappingStatus: "MAPPED" } });
  expect(mapped).toHaveLength(3);
  expect(new Set(mapped.map((row) => row.internalPlayerId))).toEqual(new Set([player.id]));

  expect((await prisma.cricketMatch.findUnique({ where: { id: prepared.matchId } }))?.status).toBe("SCHEDULED");
  await prisma.discoveredCricketMatch.updateMany({
    where: { externalId: `sk-${suffix}` },
    data: { providerStatus: "live" },
  });
  await advancePreparedShadowMatches();
  expect((await prisma.cricketMatch.findUnique({ where: { id: prepared.matchId } }))?.status).toBe("LIVE");
  const finished = await getSettings();
  expect(finished.engineMode).toBe("SIMULATION");
  expect(finished.realSourcePricingEnabled).toBe(false);

  await prisma.playerFeedMapping.deleteMany({ where: { matchId: prepared.matchId } });
  await prisma.cricketMatchExternalId.deleteMany({ where: { matchId: prepared.matchId } });
  await prisma.discoveredCricketMatch.deleteMany({ where: { externalId: { in: [`crex-${suffix}`, `sk-${suffix}`, `cb-${suffix}`] } } });
  await prisma.cricketMatch.delete({ where: { id: prepared.matchId } });
  await prisma.player.delete({ where: { id: player.id } });
});

test("two sources prepare and one source stays degraded", async () => {
  const suffix = randomUUID().slice(0, 8);
  await refreshIndiaDiscoveries({
    crexPage: async () => "no india match here",
    sportskeedaMatches: async () => indiaList(`sk-two-${suffix}`, "upcoming"),
    cricbuzz: async () => [{
      source: "Cricbuzz",
      externalId: `cb-two-${suffix}`,
      homeTeam: "India",
      awayTeam: "Australia",
      competition: "India tour of Australia 2026",
      scheduledAt: start,
      matchFormat: "T20",
      venue: "Melbourne Cricket Ground",
      providerStatus: "upcoming",
    }],
  });
  const rows = await prisma.discoveredCricketMatch.findMany({
    where: { externalId: { in: [`sk-two-${suffix}`, `cb-two-${suffix}`] } },
  });
  const { resolveCrossSourceMatches } = await import("@/domain/match-resolver");
  const [resolved] = resolveCrossSourceMatches(rows.map((row) => ({
    source: row.source as "Sportskeeda" | "Cricbuzz",
    externalId: row.externalId,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    competition: row.competition,
    scheduledAt: row.scheduledAt.toISOString(),
    matchFormat: row.matchFormat,
    venue: row.venue,
    providerStatus: row.providerStatus,
  })));
  expect(resolved?.monitoring).toBe("READY");
  expect(resolved?.foundCount).toBe(2);
  const prepared = await prepareShadowMatch({ match: resolved!, reason: "two source shadow" });
  expect(await prisma.cricketMatchExternalId.count({ where: { matchId: prepared.matchId } })).toBe(2);

  const only = resolveCrossSourceMatches([{
    source: "Sportskeeda",
    externalId: `sk-one-${suffix}`,
    homeTeam: "India",
    awayTeam: "England",
    competition: "India in England 2026",
    scheduledAt: "2026-11-02T14:00:00.000Z",
    matchFormat: "ODI",
    venue: "Lord's",
    providerStatus: "upcoming",
  }]);
  expect(only[0]?.monitoring).toBe("DEGRADED");
  const degraded = await prepareShadowMatch({ match: only[0]!, reason: "one source shadow" });
  expect(degraded.monitoring).toBe("DEGRADED");
  expect(await prisma.cricketMatchExternalId.count({ where: { matchId: degraded.matchId } })).toBe(1);

  await prisma.cricketMatchExternalId.deleteMany({ where: { matchId: { in: [prepared.matchId, degraded.matchId] } } });
  await prisma.discoveredCricketMatch.deleteMany({ where: { externalId: { in: [`sk-two-${suffix}`, `cb-two-${suffix}`] } } });
  await prisma.cricketMatch.deleteMany({ where: { id: { in: [prepared.matchId, degraded.matchId] } } });
});
