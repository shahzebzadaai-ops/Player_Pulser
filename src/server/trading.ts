import { randomUUID } from "crypto";
import type { Quote, TradeSide } from "@prisma/client";
import { AppError, unwrap } from "@/domain/errors";
import { divRoundHalfAwayFromZero } from "@/domain/money";
import { splitProceeds, takeLotCost } from "@/domain/lots";
import { feedIsStale, quoteIsFirm, resolveBuyFunding, wageringIncrement } from "@/domain/rules";
import { quoteLifetimeSeconds } from "@/domain/pricing-engine";
import { quoteFromMid } from "@/domain/spread";
import { tryConvertBonus } from "./bonus";
import { assertTradingEnabled } from "./features";
import { assertTradeRisk, evaluatePlayerRisk } from "./risk";
import { accountBalance, beginIdempotency, postJournal, saveIdempotency, withUserLock, type JournalLine, type Tx } from "./ledger";
import { getSettings } from "./settings";

export type TradeResult = {
  tradeId: string;
  playerId: string;
  side: TradeSide;
  quantity: number;
  unitPaise: string;
  cashPaise: string;
  bonusPaise: string;
  replayed: boolean;
};

async function latestMid(tx: Tx, playerId: string) {
  const tick = await tx.priceTick.findFirst({
    where: { playerId },
    orderBy: { createdAt: "desc" },
  });
  return tick;
}

export async function createQuote(input: {
  userId: string;
  playerId: string;
  side: TradeSide;
  quantity: number;
  requestedBonusPaise: bigint | null;
  seenMidPaise: bigint | null;
  confirmPriceChange: boolean;
}): Promise<{
  quoteId: string;
  expiresAt: string;
  unitPaise: string;
  cashPaise: string;
  bonusPaise: string;
  midPaise: string;
}> {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new AppError("QUANTITY", "Buy or sell at least 1 Pulser.", 400);
  }
  await assertTradingEnabled();
  return withUserLock(input.userId, async (tx) => {
    const settings = await getSettings(tx);
    if (input.quantity > settings.tradeMaxQuantity) {
      throw new AppError("QUANTITY", "That quantity is above the current order limit.", 400);
    }
    const player = await tx.player.findUnique({ where: { id: input.playerId } });
    if (!player) throw new AppError("NOT_FOUND", "Player not found.", 404);
    if (!player.tradable) throw new AppError("NOT_TRADABLE", "This player is not open for trading.", 409);
    const tick = await latestMid(tx, player.id);
    if (feedIsStale(tick?.createdAt ?? null, new Date(), settings.feedStaleAfterSeconds)) {
      throw new AppError("FEED_STALE", "Prices are stale because the feed is quiet. Trading is paused.", 409);
    }
    const midPaise = tick?.midPaise ?? player.referenceMidPaise;
    if (
      input.seenMidPaise !== null &&
      !input.confirmPriceChange &&
      priceMoved(input.seenMidPaise, midPaise, settings.quoteConfirmBps)
    ) {
      throw new AppError("PRICE_CHANGED", "The price moved. Confirm the new price to continue.", 409, {
        seenMidPaise: input.seenMidPaise.toString(),
        currentMidPaise: midPaise.toString(),
      });
    }
    const spreadPpm = player.liveMatch ? settings.spreadLivePpm : settings.spreadNormalPpm;
    const quoted = quoteFromMid(midPaise, spreadPpm);
    const unitPaise = input.side === "BUY" ? quoted.buyPaise : quoted.sellPaise;
    const notional = unitPaise * BigInt(input.quantity);
    await assertTradeRisk(tx, {
      userId: input.userId,
      playerId: player.id,
      side: input.side,
      quantity: input.quantity,
      midPaise,
    });
    let cashPaise = notional;
    let bonusPaise = 0n;
    if (input.side === "BUY") {
      const funding = unwrap(
        resolveBuyFunding({
          notionalPaise: notional,
          requestedBonusPaise: input.requestedBonusPaise,
          cashAvailablePaise: await accountBalance(tx, input.userId, "USER_CASH"),
          bonusAvailablePaise: await accountBalance(tx, input.userId, "USER_BONUS"),
          minCashPortionBps: settings.bonusMinCashPortionBps,
        }),
      );
      cashPaise = funding.cashPaise;
      bonusPaise = funding.bonusPaise;
    } else {
      const lots = await tx.holdingLot.aggregate({
        where: { userId: input.userId, playerId: player.id, quantityRemaining: { gt: 0 } },
        _sum: { quantityRemaining: true },
      });
      const available = lots._sum.quantityRemaining ?? 0;
      if (input.quantity > available) {
        throw new AppError("INSUFFICIENT_HOLDINGS", "You cannot sell more Pulsers than you hold.", 409);
      }
    }
    const quote = await tx.quote.create({
      data: {
        userId: input.userId,
        playerId: player.id,
        side: input.side,
        quantity: input.quantity,
        midPaise,
        unitPaise,
        spreadPpm,
        cashPaise,
        bonusPaise,
        expiresAt: new Date(Date.now() + quoteLifetimeSeconds(player.liveMatch, settings.quoteTtlSeconds, settings.quoteTtlLiveSeconds) * 1000),
      },
    });
    return {
      quoteId: quote.id,
      expiresAt: quote.expiresAt.toISOString(),
      unitPaise: unitPaise.toString(),
      cashPaise: cashPaise.toString(),
      bonusPaise: bonusPaise.toString(),
      midPaise: midPaise.toString(),
    };
  });
}

function priceMoved(seen: bigint, current: bigint, thresholdBps: number): boolean {
  const diff = current > seen ? current - seen : seen - current;
  return diff * 10_000n >= seen * BigInt(thresholdBps);
}

async function commitTrade(input: {
  userId: string;
  quoteId: string;
  idempotencyKey: string;
}): Promise<TradeResult> {
  return withUserLock(input.userId, async (tx) => {
    const requestHash = input.quoteId;
    const prior = await beginIdempotency(tx, {
      key: input.idempotencyKey,
      userId: input.userId,
      scope: "trade",
      requestHash,
    });
    if (prior.replay) return { ...(prior.replay as Omit<TradeResult, "replayed">), replayed: true };
    await assertTradingEnabled(tx);

    const quote = await tx.quote.findUnique({ where: { id: input.quoteId } });
    if (!quote || quote.userId !== input.userId) throw new AppError("NOT_FOUND", "Quote not found.", 404);
    if (quote.consumedAt) throw new AppError("QUOTE_USED", "This quote was already used.", 409);
    if (!quoteIsFirm(quote.expiresAt, new Date())) {
      throw new AppError("QUOTE_EXPIRED", "This quote expired. Review the new price and confirm again.", 409);
    }
    const settings = await getSettings(tx);
    const tick = await latestMid(tx, quote.playerId);
    if (feedIsStale(tick?.createdAt ?? null, new Date(), settings.feedStaleAfterSeconds)) {
      throw new AppError("FEED_STALE", "Prices went stale before the trade was accepted.", 409);
    }
    const player = await tx.player.findUnique({ where: { id: quote.playerId } });
    if (!player?.tradable) throw new AppError("NOT_TRADABLE", "This player is not open for trading.", 409);
    const currentMid = tick?.midPaise ?? player.midPricePaise;
    await assertTradeRisk(tx, {
      userId: quote.userId,
      playerId: quote.playerId,
      side: quote.side,
      quantity: quote.quantity,
      midPaise: currentMid,
    });

    const tradeId = randomUUID();
    const result =
      quote.side === "BUY" ? await fillBuy(tx, quote, tradeId) : await fillSell(tx, quote, tradeId);
    await tx.quote.update({ where: { id: quote.id }, data: { consumedAt: new Date() } });
    await tx.player.update({
      where: { id: quote.playerId },
      data: { totalTradedPaise: { increment: quote.unitPaise * BigInt(quote.quantity) } },
    });
    const payload: TradeResult = { ...result, replayed: false };
    await saveIdempotency(tx, {
      key: input.idempotencyKey,
      userId: input.userId,
      scope: "trade",
      requestHash,
      response: { ...payload, replayed: false },
    });
    return payload;
  });
}

export async function executeTrade(input: {
  userId: string;
  quoteId: string;
  idempotencyKey: string;
}): Promise<TradeResult> {
  const result = await commitTrade(input);
  if (!result.replayed) await evaluatePlayerRisk(result.playerId, "Position changed.");
  return result;
}

async function fillBuy(tx: Tx, quote: Quote, tradeId: string): Promise<Omit<TradeResult, "replayed">> {
  const notional = quote.unitPaise * BigInt(quote.quantity);
  if (quote.cashPaise + quote.bonusPaise !== notional) {
    throw new AppError("QUOTE_INVALID", "This quote cannot be filled.", 409);
  }
  const settings = await getSettings(tx);
  const funding = unwrap(
    resolveBuyFunding({
      notionalPaise: notional,
      requestedBonusPaise: quote.bonusPaise,
      cashAvailablePaise: await accountBalance(tx, quote.userId, "USER_CASH"),
      bonusAvailablePaise: await accountBalance(tx, quote.userId, "USER_BONUS"),
      minCashPortionBps: settings.bonusMinCashPortionBps,
    }),
  );
  if (funding.cashPaise !== quote.cashPaise || funding.bonusPaise !== quote.bonusPaise) {
    throw new AppError("BALANCES_CHANGED", "Balances changed. Request a new quote.", 409);
  }
  const lines: JournalLine[] = [
    {
      userId: quote.userId,
      account: "USER_CASH",
      amountPaise: -quote.cashPaise,
      lineKey: `trade:${tradeId}:USER_CASH`,
    },
    {
      userId: null,
      account: "OFFSET_TRADING",
      amountPaise: quote.cashPaise,
      lineKey: `trade:${tradeId}:OFFSET_TRADING`,
    },
  ];
  if (quote.bonusPaise > 0n) {
    lines.push(
      {
        userId: quote.userId,
        account: "USER_BONUS",
        amountPaise: -quote.bonusPaise,
        lineKey: `trade:${tradeId}:USER_BONUS`,
      },
      {
        userId: null,
        account: "OFFSET_BONUS",
        amountPaise: quote.bonusPaise,
        lineKey: `trade:${tradeId}:OFFSET_BONUS`,
      },
    );
  }
  await postJournal(tx, {
    entryType: "TRADE_BUY",
    description: "Buy Pulsers",
    referenceType: "Trade",
    referenceId: tradeId,
    lines,
  });
  await tx.trade.create({
    data: {
      id: tradeId,
      userId: quote.userId,
      playerId: quote.playerId,
      quoteId: quote.id,
      side: "BUY",
      quantity: quote.quantity,
      unitPaise: quote.unitPaise,
      cashPaise: quote.cashPaise,
      bonusPaise: quote.bonusPaise,
      idempotencyKey: `trade:${tradeId}`,
      countsForWagering: true,
    },
  });
  const grant = await tx.bonusGrant.findUnique({
    where: { userId_source: { userId: quote.userId, source: "WELCOME" } },
  });
  await tx.holdingLot.create({
    data: {
      userId: quote.userId,
      playerId: quote.playerId,
      sourceTradeId: tradeId,
      quantityOriginal: quote.quantity,
      quantityRemaining: quote.quantity,
      cashCostPaise: quote.cashPaise,
      bonusCostPaise: quote.bonusPaise,
      bonusGrantId: quote.bonusPaise > 0n ? grant?.id : null,
      bonusDisposition: quote.bonusPaise > 0n && grant?.status === "ACTIVE" ? "OPEN" : "NONE",
    },
  });
  if (grant?.status === "ACTIVE") {
    const increment = wageringIncrement("BUY", notional);
    await tx.bonusGrant.update({
      where: { id: grant.id },
      data: { wageringProgressPaise: grant.wageringProgressPaise + increment },
    });
    await tryConvertBonus(tx, quote.userId);
  }
  return {
    tradeId,
    playerId: quote.playerId,
    side: "BUY",
    quantity: quote.quantity,
    unitPaise: quote.unitPaise.toString(),
    cashPaise: quote.cashPaise.toString(),
    bonusPaise: quote.bonusPaise.toString(),
  };
}

async function fillSell(tx: Tx, quote: Quote, tradeId: string): Promise<Omit<TradeResult, "replayed">> {
  const lots = await tx.holdingLot.findMany({
    where: { userId: quote.userId, playerId: quote.playerId, quantityRemaining: { gt: 0 } },
    orderBy: { createdAt: "asc" },
  });
  let left = quote.quantity;
  let cashWeight = 0n;
  let openBonusWeight = 0n;
  let expiredBonusWeight = 0n;
  for (const lot of lots) {
    if (left === 0) break;
    const take = Math.min(left, lot.quantityRemaining);
    const costs = takeLotCost(
      {
        quantityRemaining: lot.quantityRemaining,
        cashCostPaise: lot.cashCostPaise,
        bonusCostPaise: lot.bonusCostPaise,
      },
      take,
    );
    cashWeight += costs.cashTaken;
    if (lot.bonusDisposition === "EXPIRED_UNCONVERTED") expiredBonusWeight += costs.bonusTaken;
    else openBonusWeight += costs.bonusTaken;
    await tx.holdingLot.update({
      where: { id: lot.id },
      data: {
        quantityRemaining: lot.quantityRemaining - take,
        cashCostPaise: lot.cashCostPaise - costs.cashTaken,
        bonusCostPaise: lot.bonusCostPaise - costs.bonusTaken,
      },
    });
    left -= take;
  }
  if (left > 0) throw new AppError("INSUFFICIENT_HOLDINGS", "You cannot sell more Pulsers than you hold.", 409);

  const total = quote.unitPaise * BigInt(quote.quantity);
  const split = splitProceeds(total, cashWeight, openBonusWeight + expiredBonusWeight);
  const bonusBase = openBonusWeight + expiredBonusWeight;
  const keptBonus =
    bonusBase === 0n ? 0n : divRoundHalfAwayFromZero(split.bonusPaise * openBonusWeight, bonusBase);
  const forfeited = split.bonusPaise - keptBonus;
  const lines: JournalLine[] = [
    {
      userId: null,
      account: "OFFSET_TRADING",
      amountPaise: -total,
      lineKey: `trade:${tradeId}:OFFSET_TRADING`,
    },
  ];
  if (split.cashPaise !== 0n) {
    lines.push({
      userId: quote.userId,
      account: "USER_CASH",
      amountPaise: split.cashPaise,
      lineKey: `trade:${tradeId}:USER_CASH`,
    });
  }
  if (keptBonus !== 0n) {
    lines.push({
      userId: quote.userId,
      account: "USER_BONUS_PROCEEDS",
      amountPaise: keptBonus,
      lineKey: `trade:${tradeId}:BONUS_PROCEEDS`,
    });
  }
  if (forfeited !== 0n) {
    lines.push({
      userId: null,
      account: "OFFSET_FORFEIT",
      amountPaise: forfeited,
      lineKey: `trade:${tradeId}:FORFEIT`,
    });
  }
  await postJournal(tx, {
    entryType: "TRADE_SELL",
    description: "Sell Pulsers",
    referenceType: "Trade",
    referenceId: tradeId,
    lines,
  });
  await tx.trade.create({
    data: {
      id: tradeId,
      userId: quote.userId,
      playerId: quote.playerId,
      quoteId: quote.id,
      side: "SELL",
      quantity: quote.quantity,
      unitPaise: quote.unitPaise,
      cashPaise: split.cashPaise,
      bonusPaise: keptBonus,
      idempotencyKey: `trade:${tradeId}`,
      countsForWagering: true,
    },
  });
  return {
    tradeId,
    playerId: quote.playerId,
    side: "SELL",
    quantity: quote.quantity,
    unitPaise: quote.unitPaise.toString(),
    cashPaise: split.cashPaise.toString(),
    bonusPaise: keptBonus.toString(),
  };
}
