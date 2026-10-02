import { createRequire } from "node:module";
import { PLAYERS } from "./catalog";

const require = createRequire(import.meta.url);
const { env } = require("../scripts/read-production-config.cjs") as { env: Record<string, string> };

for (const [key, value] of Object.entries(env)) {
  if (value && process.env[key] === undefined) process.env[key] = value;
}

async function main() {
  if (process.env.CONFIRM_PRODUCTION_SEED !== "yes") {
    throw new Error("Set CONFIRM_PRODUCTION_SEED=yes to write production master data.");
  }

  const { prisma } = await import("../src/server/prisma");
  const { SETTING_DEFAULT_ROWS } = await import("../src/server/settings");

  for (const row of SETTING_DEFAULT_ROWS) {
    await prisma.appSetting.upsert({
      where: { key: row.key },
      create: { key: row.key, value: row.value },
      update: {},
    });
  }

  const locked = [
    { key: "feed.realSourcePricingEnabled", value: "false" },
    { key: "pricing.engineMode", value: "SIMULATION" },
    { key: "pricing.mode", value: "simulation" },
    { key: "feature.pulsePreviewEnabled", value: false },
  ] as const;
  for (const row of locked) {
    await prisma.appSetting.upsert({
      where: { key: row.key },
      create: { key: row.key, value: row.value },
      update: { value: row.value },
    });
  }

  const canonical = process.env.CANONICAL_URL?.trim() ?? "";
  if (canonical) {
    const existing = await prisma.appSetting.findUnique({ where: { key: "seo" } });
    const current =
      existing?.value && typeof existing.value === "object" && !Array.isArray(existing.value)
        ? (existing.value as Record<string, unknown>)
        : {};
    const value = {
      siteTitle: "PlayerPulser",
      siteDescription: "Trade cricket-player holdings, track a portfolio, and manage a wallet.",
      defaultOgImageId: "",
      robotsIndex: false,
      robotsFollow: false,
      ...current,
      canonicalDomain: canonical,
    };
    await prisma.appSetting.upsert({
      where: { key: "seo" },
      create: { key: "seo", value },
      update: { value },
    });
  }

  for (const [slug, name, shortName, role, jersey, mid, prev, live] of PLAYERS) {
    const player = await prisma.player.upsert({
      where: { slug },
      create: {
        slug,
        name,
        shortName,
        role,
        jerseyNumber: jersey,
        referenceMidPaise: BigInt(mid),
        basePricePaise: BigInt(mid),
        midPricePaise: BigInt(mid),
        matchAnchorPaise: BigInt(mid),
        liveMatch: live,
        fictional: true,
        tradable: true,
        totalTradedPaise: 0n,
        blurb: "Player price on PlayerPulser.",
      },
      update: {
        name,
        shortName,
        role,
        jerseyNumber: jersey,
      },
    });
    await prisma.playerRiskControl.upsert({
      where: { playerId: player.id },
      create: { playerId: player.id, manualMode: "AUTO", lastState: "NORMAL" },
      update: {},
    });
    const ticks = await prisma.priceTick.count({ where: { playerId: player.id } });
    if (ticks === 0) {
      const now = Date.now();
      for (let index = 0; index <= 15; index += 1) {
        const price = BigInt(prev) + ((BigInt(mid) - BigInt(prev)) * BigInt(index)) / 15n;
        await prisma.priceTick.create({
          data: {
            playerId: player.id,
            midPaise: price,
            source: "seed",
            performance: 0,
            demand: 0,
            news: 0,
            createdAt: new Date(now - (15 - index) * 60_000),
          },
        });
      }
    }
  }

  const players = await prisma.player.count();
  console.log(`Production master data ready. Players: ${players}. No customers, bonuses, or ledger rows were written.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
