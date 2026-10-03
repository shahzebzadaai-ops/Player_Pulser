import "server-only";
import { randomUUID } from "crypto";
import { AppError } from "@/domain/errors";
import {
  INVESTOR_DEMO_CASH_PAISE,
  INVESTOR_DEMO_EMAIL,
  INVESTOR_DEMO_HOLDING_SLUG,
  INVESTOR_DEMO_NAME,
  investorDemoEnabled,
  isInvestorDemoIdentity,
} from "@/domain/investor-demo";
import { grantWelcomeBonus } from "./bonus";
import { postJournal, withUserLock } from "./ledger";
import { prisma } from "./prisma";
import { assignTemporaryUsername } from "./usernames";
import { getSettings } from "./settings";
import { createQuote, executeTrade } from "./trading";

export async function investorDemoUserId(): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email: INVESTOR_DEMO_EMAIL }, select: { id: true } });
  return user?.id ?? null;
}

export function assertDemoPaymentsBlocked(user: { email?: string | null }): void {
  if (!isInvestorDemoIdentity(user)) return;
  throw new AppError(
    "DEMO_PAYMENTS",
    "Investor demo money stays simulated. Deposits and withdrawals are turned off for this session.",
    403,
  );
}

async function ensureDemoUser() {
  const existing = await prisma.user.findUnique({ where: { email: INVESTOR_DEMO_EMAIL } });
  if (existing) {
    if (existing.role !== "CUSTOMER") {
      throw new AppError("DEMO_UNAVAILABLE", "The investor demo account is not available.", 409);
    }
    return existing;
  }
  const created = await prisma.user.create({
    data: {
      email: INVESTOR_DEMO_EMAIL,
      displayName: INVESTOR_DEMO_NAME,
      role: "CUSTOMER",
      passwordHash: null,
      phone: null,
    },
  });
  await assignTemporaryUsername(prisma, created.id);
  return created;
}
async function clearDemoActivity(userId: string) {
  await withUserLock(userId, async (tx) => {
    const trades = await tx.trade.findMany({
      where: { userId },
      select: { id: true, playerId: true, unitPaise: true, quantity: true },
    });
    const traded = new Map<string, bigint>();
    for (const trade of trades) {
      traded.set(trade.playerId, (traded.get(trade.playerId) ?? 0n) + trade.unitPaise * BigInt(trade.quantity));
    }
    const correlations = await tx.ledgerEntry.findMany({
      where: { userId },
      select: { correlationId: true },
    });
    const correlationIds = [...new Set(correlations.map((row) => row.correlationId))];
    const payments = await tx.payment.findMany({ where: { userId }, select: { id: true } });
    await tx.holdingLot.deleteMany({ where: { userId } });
    await tx.trade.deleteMany({ where: { userId } });
    await tx.quote.deleteMany({ where: { userId } });
    if (payments.length > 0) {
      await tx.paymentEvent.deleteMany({ where: { paymentId: { in: payments.map((payment) => payment.id) } } });
      await tx.payment.deleteMany({ where: { userId } });
    }
    await tx.bonusGrant.deleteMany({ where: { userId } });
    await tx.abuseFlag.deleteMany({ where: { userId } });
    await tx.idempotencyRecord.deleteMany({ where: { userId } });
    if (correlationIds.length > 0) {
      await tx.ledgerEntry.deleteMany({ where: { correlationId: { in: correlationIds } } });
    }
    await tx.ledgerEntry.deleteMany({ where: { userId } });
    for (const [playerId, amount] of traded) {
      const player = await tx.player.findUnique({ where: { id: playerId }, select: { totalTradedPaise: true } });
      if (!player) continue;
      const next = player.totalTradedPaise > amount ? player.totalTradedPaise - amount : 0n;
      await tx.player.update({ where: { id: playerId }, data: { totalTradedPaise: next } });
    }
  });
}

async function seedDemoBalances(userId: string) {
  const settings = await getSettings();
  const seedKey = randomUUID();
  await withUserLock(userId, async (tx) => {
    await postJournal(tx, {
      entryType: "DEMO_SEED",
      description: "Investor demo cash",
      referenceType: "User",
      referenceId: userId,
      lines: [
        {
          userId,
          account: "USER_CASH",
          amountPaise: INVESTOR_DEMO_CASH_PAISE,
          lineKey: `demo:${userId}:cash:${seedKey}`,
        },
        {
          userId: null,
          account: "OFFSET_TRADING",
          amountPaise: -INVESTOR_DEMO_CASH_PAISE,
          lineKey: `demo:${userId}:offset:${seedKey}`,
        },
      ],
    });
    await grantWelcomeBonus(tx, userId, settings);
  });
}

async function seedDemoHolding(userId: string) {
  const preferred = await prisma.player.findUnique({ where: { slug: INVESTOR_DEMO_HOLDING_SLUG } });
  const player = preferred?.tradable
    ? preferred
    : await prisma.player.findFirst({ where: { tradable: true }, orderBy: { name: "asc" } });
  if (!player) return;
  try {
    const quote = await createQuote({
      userId,
      playerId: player.id,
      side: "BUY",
      quantity: 1,
      requestedBonusPaise: 0n,
      seenMidPaise: null,
      confirmPriceChange: true,
    });
    await executeTrade({ userId, quoteId: quote.quoteId, idempotencyKey: `demo-seed:${userId}:${randomUUID()}` });
  } catch {
    // A quiet price feed pauses trading. Cash and the welcome bonus still reset.
  }
}

export async function resetInvestorDemo(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!isInvestorDemoIdentity(user)) {
    throw new AppError("FORBIDDEN", "Only the investor demo can be reset.", 403);
  }
  await clearDemoActivity(userId);
  await seedDemoBalances(userId);
  await seedDemoHolding(userId);
}

export async function enterInvestorDemo(): Promise<string> {
  if (!investorDemoEnabled()) throw new AppError("NOT_FOUND", "Not found.", 404);
  const user = await ensureDemoUser();
  await resetInvestorDemo(user.id);
  return user.id;
}
