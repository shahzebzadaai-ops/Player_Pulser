import "dotenv/config";
import { hashPassword } from "../src/server/auth";
import { grantWelcomeBonus } from "../src/server/bonus";
import { postJournal } from "../src/server/ledger";
import { prisma } from "../src/server/prisma";
import { getSettings, SETTING_DEFAULT_ROWS } from "../src/server/settings";
import { PLAYERS } from "./catalog";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.DEMO_SEED !== "true") {
    throw new Error("Refusing to seed demo accounts in production without DEMO_SEED=true.");
  }
  for (const row of SETTING_DEFAULT_ROWS) {
    await prisma.appSetting.upsert({
      where: { key: row.key },
      create: { key: row.key, value: row.value },
      update: {},
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
        totalTradedPaise: slug === "virat-kohli" ? 12_400_000_000n : BigInt(mid) * 1_000_000n,
        blurb: "Fictional development price. Not a verified squad selection.",
      },
      update: {
        name,
        shortName,
        role,
        jerseyNumber: jersey,
        referenceMidPaise: BigInt(mid),
        liveMatch: live,
      },
    });
    await prisma.playerRiskControl.upsert({
      where: { playerId: player.id },
      create: { playerId: player.id, manualMode: "AUTO", lastState: "NORMAL" },
      update: {},
    });
    const ticks = await prisma.priceTick.count({ where: { playerId: player.id } });
    if (ticks < 8) {
      const now = Date.now();
      for (let index = 0; index <= 15; index += 1) {
        const price = BigInt(prev) + ((BigInt(mid) - BigInt(prev)) * BigInt(index)) / 15n;
        await prisma.priceTick.create({
          data: {
            playerId: player.id,
            midPaise: price,
            source: "seed",
            performance: index > 10 ? 0.4 : 0,
            demand: 0.2,
            news: 0,
            createdAt: new Date(now - (15 - index) * 60_000),
          },
        });
      }
    }
  }

  const kohli = await prisma.player.findUniqueOrThrow({ where: { slug: "virat-kohli" } });
  const eventCount = await prisma.matchEvent.count({ where: { playerId: kohli.id } });
  if (eventCount === 0) {
    const samples = [
      ["12.3", "6", "Virat Kohli smashes it over long-on"],
      ["12.2", "4", "Classic cover drive from Kohli"],
      ["11.6", "1", "Single to mid-wicket"],
      ["11.5", "W", "Rohit Sharma out (caught). Kohli on strike"],
    ] as const;
    for (const [overLabel, kind, summary] of samples) {
      await prisma.matchEvent.create({
        data: { playerId: kohli.id, overLabel, kind, summary, simulated: true },
      });
    }
  }

  const adminPassword = process.env.ADMIN_SEED_PASSWORD || "dev-admin-1";
  if (process.env.NODE_ENV === "production" && adminPassword === "dev-admin-1") {
    throw new Error("Set ADMIN_SEED_PASSWORD before seeding production.");
  }
  await ensureUser({
    phone: "+919000000001",
    displayName: "Pulser Admin",
    password: adminPassword,
    role: "ADMIN",
    bonus: false,
  });
  const fan = await ensureUser({
    phone: "+919876543210",
    displayName: "Cricket Fan",
    password: "dev-fan-1",
    role: "CUSTOMER",
    bonus: true,
  });
  await seedOpeningPosition(fan.id, kohli.id);
  console.log("Seed complete. Demo fan +919876543210 / dev-fan-1. Admin +919000000001.");
}

async function ensureUser(input: {
  phone: string;
  displayName: string;
  password: string;
  role: "ADMIN" | "CUSTOMER";
  bonus: boolean;
}) {
  const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (existing) return existing;
  const passwordHash = await hashPassword(input.password);
  const settings = await getSettings();
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { phone: input.phone, displayName: input.displayName, passwordHash, role: input.role },
    });
    if (input.bonus) await grantWelcomeBonus(tx, user.id, settings);
    return user;
  });
}

async function seedOpeningPosition(userId: string, playerId: string) {
  const existing = await prisma.trade.findUnique({ where: { idempotencyKey: `seed:${userId}:kohli` } });
  if (existing) return;
  const settings = await getSettings();
  await prisma.$transaction(async (tx) => {
    if ((await tx.bonusGrant.count({ where: { userId } })) === 0) {
      await grantWelcomeBonus(tx, userId, settings);
    }
    await postJournal(tx, {
      entryType: "DEV_OPENING_CASH",
      description: "Development opening cash. Not a qualifying deposit.",
      lines: [
        { userId, account: "USER_CASH", amountPaise: 335_000n, lineKey: `seed:${userId}:open:cash` },
        { userId: null, account: "OFFSET_CASH", amountPaise: -335_000n, lineKey: `seed:${userId}:open:offset` },
      ],
    });
    const quote = await tx.quote.create({
      data: {
        userId,
        playerId,
        side: "BUY",
        quantity: 12,
        midPaise: 7500n,
        unitPaise: 7500n,
        spreadPpm: 10_000,
        cashPaise: 90_000n,
        bonusPaise: 0n,
        expiresAt: new Date(),
        consumedAt: new Date(),
      },
    });
    const trade = await tx.trade.create({
      data: {
        userId,
        playerId,
        quoteId: quote.id,
        side: "BUY",
        quantity: 12,
        unitPaise: 7500n,
        cashPaise: 90_000n,
        bonusPaise: 0n,
        idempotencyKey: `seed:${userId}:kohli`,
        countsForWagering: false,
      },
    });
    await postJournal(tx, {
      entryType: "TRADE_BUY",
      description: "Opening Kohli position. Does not count toward wagering.",
      referenceType: "Trade",
      referenceId: trade.id,
      lines: [
        { userId, account: "USER_CASH", amountPaise: -90_000n, lineKey: `seed:${userId}:buy:cash` },
        { userId: null, account: "OFFSET_TRADING", amountPaise: 90_000n, lineKey: `seed:${userId}:buy:offset` },
      ],
    });
    await tx.holdingLot.create({
      data: {
        userId,
        playerId,
        sourceTradeId: trade.id,
        quantityOriginal: 12,
        quantityRemaining: 12,
        cashCostPaise: 90_000n,
        bonusCostPaise: 0n,
        bonusDisposition: "NONE",
      },
    });
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
