import { randomUUID } from "crypto";
import type { LedgerAccount } from "@prisma/client";
import { AppError } from "@/domain/errors";
import { journalBalances } from "@/domain/settings";
import { prisma, type Tx } from "./prisma";

export type { Tx };

const GUARDED: LedgerAccount[] = [
  "USER_CASH",
  "USER_BONUS",
  "USER_BONUS_PROCEEDS",
  "USER_WITHDRAWAL_HOLD",
];

export type JournalLine = {
  userId: string | null;
  account: LedgerAccount;
  amountPaise: bigint;
  lineKey: string;
};

export async function accountBalance(tx: Tx, userId: string, account: LedgerAccount): Promise<bigint> {
  const aggregate = await tx.ledgerEntry.aggregate({
    where: { userId, account },
    _sum: { amountPaise: true },
  });
  return aggregate._sum.amountPaise ?? 0n;
}

export async function summedAccountBalances(
  tx: Tx,
  userId: string,
  accounts: readonly LedgerAccount[],
): Promise<Record<LedgerAccount, bigint>> {
  const rows = await tx.ledgerEntry.groupBy({
    by: ["account"],
    where: { userId, account: { in: [...accounts] } },
    _sum: { amountPaise: true },
  });
  const totals = Object.fromEntries(accounts.map((account) => [account, 0n])) as Record<LedgerAccount, bigint>;
  for (const row of rows) totals[row.account] = row._sum.amountPaise ?? 0n;
  return totals;
}

export async function postJournal(
  tx: Tx,
  input: {
    entryType: string;
    description: string;
    referenceType?: string;
    referenceId?: string;
    lines: JournalLine[];
    correlationId?: string;
  },
): Promise<string> {
  if (input.lines.length < 2 || !journalBalances(input.lines)) {
    throw new AppError("UNBALANCED", "The ledger journal did not balance. Nothing was saved.", 500);
  }
  const correlationId = input.correlationId ?? randomUUID();
  await tx.ledgerEntry.createMany({
    data: input.lines.map((line) => ({
      userId: line.userId,
      account: line.account,
      amountPaise: line.amountPaise,
      correlationId,
      entryType: input.entryType,
      lineKey: line.lineKey,
      description: input.description,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    })),
  });
  const userIds = [...new Set(input.lines.map((line) => line.userId).filter((id): id is string => id !== null))];
  for (const userId of userIds) {
    for (const account of GUARDED) {
      const balance = await accountBalance(tx, userId, account);
      if (balance < 0n) {
        throw new AppError("INSUFFICIENT_FUNDS", "That would take a balance below zero.", 409);
      }
    }
  }
  return correlationId;
}

export async function withUserLock<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      return fn(tx);
    },
    { timeout: 20_000 },
  );
}

export async function beginIdempotency(
  tx: Tx,
  input: { key: string; userId: string; scope: string; requestHash: string },
): Promise<{ replay: unknown | null }> {
  const existing = await tx.idempotencyRecord.findUnique({ where: { key: input.key } });
  if (!existing) return { replay: null };
  if (existing.userId !== input.userId || existing.scope !== input.scope || existing.requestHash !== input.requestHash) {
    throw new AppError("IDEMPOTENCY_CONFLICT", "This submission was already used for a different request.", 409);
  }
  return { replay: existing.response };
}

export async function saveIdempotency(
  tx: Tx,
  input: { key: string; userId: string; scope: string; requestHash: string; response: unknown },
): Promise<void> {
  await tx.idempotencyRecord.create({
    data: {
      key: input.key,
      userId: input.userId,
      scope: input.scope,
      requestHash: input.requestHash,
      response: input.response as object,
    },
  });
}
