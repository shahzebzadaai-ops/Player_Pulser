import type { BonusGrant } from "@prisma/client";
import { assessWelcomeBonus } from "@/domain/growth";
import type { AppSettings } from "@/domain/settings";
import { conversionReady } from "@/domain/rules";
import { assertWelcomeBonusAllowed } from "./features";
import { accountBalance, postJournal, type Tx } from "./ledger";

export async function settledDepositsPaise(tx: Tx, userId: string): Promise<bigint> {
  const aggregate = await tx.payment.aggregate({
    where: { userId, kind: "DEPOSIT", status: "SETTLED" },
    _sum: { amountPaise: true },
  });
  return aggregate._sum.amountPaise ?? 0n;
}

export async function grantWelcomeBonus(
  tx: Tx,
  userId: string,
  settings: AppSettings,
  signals: { sameDeviceGrant?: boolean; samePaymentIdentityGrant?: boolean } = {},
): Promise<BonusGrant | null> {
  const existing = await tx.bonusGrant.findUnique({ where: { userId_source: { userId, source: "WELCOME" } } });
  if (existing) return existing;
  if (!(await assertWelcomeBonusAllowed(tx))) return null;
  const decision = assessWelcomeBonus({
    alreadyGranted: false,
    sameDeviceGrant: signals.sameDeviceGrant === true,
    samePaymentIdentityGrant: signals.samePaymentIdentityGrant === true,
  });
  const grant = await tx.bonusGrant.create({
    data: {
      userId,
      source: "WELCOME",
      amountPaise: settings.bonusWelcomePaise,
      wageringRequiredPaise: settings.bonusWelcomePaise * BigInt(settings.bonusWageringMultiplier),
      depositRequiredPaise: settings.bonusMinQualifyingDepositPaise,
      expiresAt: new Date(Date.now() + settings.bonusValidityDays * 24 * 60 * 60 * 1000),
      status: decision.decision === "GRANT" ? "ACTIVE" : decision.decision,
      eligibility: decision.decision === "GRANT" ? "GRANTED" : decision.decision,
      eligibilityReason: decision.reason,
    },
  });
  if (decision.decision !== "GRANT") {
    await tx.abuseFlag.create({
      data: { userId, code: decision.decision, detail: decision.reason ?? "Welcome bonus was not granted." },
    });
    return grant;
  }
  await postJournal(tx, {
    entryType: "BONUS_GRANT",
    description: "Welcome bonus",
    referenceType: "BonusGrant",
    referenceId: grant.id,
    lines: [
      {
        userId,
        account: "USER_BONUS",
        amountPaise: settings.bonusWelcomePaise,
        lineKey: `bonus:${grant.id}:USER_BONUS`,
      },
      {
        userId: null,
        account: "OFFSET_BONUS",
        amountPaise: -settings.bonusWelcomePaise,
        lineKey: `bonus:${grant.id}:OFFSET_BONUS`,
      },
    ],
  });
  return grant;
}

export async function tryConvertBonus(tx: Tx, userId: string): Promise<boolean> {
  const grant = await tx.bonusGrant.findUnique({ where: { userId_source: { userId, source: "WELCOME" } } });
  if (!grant) return false;
  const ready = conversionReady({
    status: grant.status,
    now: new Date(),
    expiresAt: grant.expiresAt,
    wageringProgressPaise: grant.wageringProgressPaise,
    wageringRequiredPaise: grant.wageringRequiredPaise,
    settledDepositsPaise: await settledDepositsPaise(tx, userId),
    depositRequiredPaise: grant.depositRequiredPaise,
  });
  if (!ready) return false;

  const bonus = await accountBalance(tx, userId, "USER_BONUS");
  const proceeds = await accountBalance(tx, userId, "USER_BONUS_PROCEEDS");
  const lines = [];
  if (bonus > 0n) {
    lines.push(
      { userId, account: "USER_BONUS" as const, amountPaise: -bonus, lineKey: `convert:${grant.id}:USER_BONUS` },
      { userId, account: "USER_CASH" as const, amountPaise: bonus, lineKey: `convert:${grant.id}:CASH_FROM_BONUS` },
    );
  }
  if (proceeds > 0n) {
    lines.push(
      {
        userId,
        account: "USER_BONUS_PROCEEDS" as const,
        amountPaise: -proceeds,
        lineKey: `convert:${grant.id}:PROCEEDS`,
      },
      { userId, account: "USER_CASH" as const, amountPaise: proceeds, lineKey: `convert:${grant.id}:CASH_FROM_PROCEEDS` },
    );
  }
  if (lines.length > 0) {
    await postJournal(tx, {
      entryType: "BONUS_CONVERT",
      description: "Welcome bonus converted to cash",
      referenceType: "BonusGrant",
      referenceId: grant.id,
      lines,
    });
  }
  const lots = await tx.holdingLot.findMany({ where: { userId, bonusGrantId: grant.id } });
  for (const lot of lots) {
    await tx.holdingLot.update({
      where: { id: lot.id },
      data: {
        cashCostPaise: lot.cashCostPaise + lot.bonusCostPaise,
        bonusCostPaise: 0n,
        bonusDisposition: "CONVERTED",
      },
    });
  }
  await tx.bonusGrant.update({
    where: { id: grant.id },
    data: { status: "CONVERTED", convertedAt: new Date() },
  });
  return true;
}

/** Proposed expiry: unused bonus and unconverted bonus proceeds are forfeited. Open units stay. */
export async function expireBonusGrant(tx: Tx, grantId: string): Promise<boolean> {
  const grant = await tx.bonusGrant.findUnique({ where: { id: grantId } });
  if (!grant || grant.status !== "ACTIVE" || grant.expiresAt.getTime() > Date.now()) return false;
  const bonus = await accountBalance(tx, grant.userId, "USER_BONUS");
  const proceeds = await accountBalance(tx, grant.userId, "USER_BONUS_PROCEEDS");
  const lines = [];
  if (bonus > 0n) {
    lines.push(
      {
        userId: grant.userId,
        account: "USER_BONUS" as const,
        amountPaise: -bonus,
        lineKey: `expire:${grant.id}:USER_BONUS`,
      },
      {
        userId: null,
        account: "OFFSET_BONUS" as const,
        amountPaise: bonus,
        lineKey: `expire:${grant.id}:OFFSET_BONUS`,
      },
    );
  }
  if (proceeds > 0n) {
    lines.push(
      {
        userId: grant.userId,
        account: "USER_BONUS_PROCEEDS" as const,
        amountPaise: -proceeds,
        lineKey: `expire:${grant.id}:PROCEEDS`,
      },
      {
        userId: null,
        account: "OFFSET_FORFEIT" as const,
        amountPaise: proceeds,
        lineKey: `expire:${grant.id}:FORFEIT`,
      },
    );
  }
  if (lines.length > 0) {
    await postJournal(tx, {
      entryType: "BONUS_EXPIRE",
      description: "Welcome bonus expired before conversion",
      referenceType: "BonusGrant",
      referenceId: grant.id,
      lines,
    });
  }
  await tx.holdingLot.updateMany({
    where: { bonusGrantId: grant.id, bonusDisposition: "OPEN", bonusCostPaise: { gt: 0n } },
    data: { bonusDisposition: "EXPIRED_UNCONVERTED" },
  });
  await tx.bonusGrant.update({
    where: { id: grant.id },
    data: { status: "EXPIRED", expiredAt: new Date() },
  });
  return true;
}
