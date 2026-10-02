import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/domain/errors";
import { PAYMENT_PENDING_EXPIRY_MS, webhookAmountAccepted, webhookCurrencyAccepted } from "@/domain/growth";
import { canExpirePayment, safeProviderIdentity } from "@/domain/payment-lifecycle";
import { tryConvertBonus } from "./bonus";
import { accountBalance, beginIdempotency, postJournal, saveIdempotency, withUserLock, type Tx } from "./ledger";
import { prisma } from "./prisma";
import { assertDepositsEnabled, assertWithdrawalsEnabled } from "./features";
import { getSettings } from "./settings";
import { planWithdrawal } from "@/domain/rules";
import { unwrap } from "@/domain/errors";

const SIMULATOR_MAX_PAISE = 10_000_000n;

function assertSimulatedProvider() {
  if (process.env.PAYMENT_PROVIDER !== "simulated") {
    throw new AppError("PAYMENTS_NOT_CONFIGURED", "A payment provider is not configured. Real payments stay off.", 503);
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SIMULATED_PAYMENTS !== "true") {
    throw new AppError("PAYMENTS_NOT_CONFIGURED", "Simulated payments are disabled in production.", 503);
  }
}

export function signWebhook(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyWebhookSignature(body: string, signature: string | null): boolean {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET ?? "";
  if (!signature || secret.length < 8) return false;
  const expected = Buffer.from(signWebhook(body, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export type PaymentView = {
  paymentId: string;
  status: string;
  amountPaise: string;
  kind: string;
  providerRef: string | null;
  remainderPaise?: string;
};

export async function createDeposit(input: {
  userId: string;
  amountPaise: bigint;
  method: "UPI" | "BANK" | "CRYPTO";
  idempotencyKey: string;
  simulate?: "settle" | "fail" | "pending";
}): Promise<PaymentView> {
  assertSimulatedProvider();
  if (input.amountPaise < 100n || input.amountPaise > SIMULATOR_MAX_PAISE) {
    throw new AppError("AMOUNT", "Simulated deposits must be between ₹1 and ₹1,00,000.", 400);
  }
  const simulate = process.env.NODE_ENV === "production" ? "pending" : (input.simulate ?? "settle");
  const created = await withUserLock(input.userId, async (tx) => {
    const requestHash = `${input.amountPaise}:${input.method}:${simulate}`;
    const prior = await beginIdempotency(tx, {
      key: input.idempotencyKey,
      userId: input.userId,
      scope: "deposit",
      requestHash,
    });
    if (prior.replay) return prior.replay as PaymentView;
    await assertDepositsEnabled(tx);
    const payment = await tx.payment.create({
      data: {
        userId: input.userId,
        provider: "simulated",
        providerRef: `sim_${randomUUID()}`,
        kind: "DEPOSIT",
        status: "PENDING",
        amountPaise: input.amountPaise,
        idempotencyKey: input.idempotencyKey,
        metadata: { method: input.method, simulate },
        nextRetryAt: new Date(Date.now() + 15_000),
      },
    });
    const view: PaymentView = {
      paymentId: payment.id,
      status: payment.status,
      amountPaise: payment.amountPaise.toString(),
      kind: payment.kind,
      providerRef: payment.providerRef,
    };
    await saveIdempotency(tx, {
      key: input.idempotencyKey,
      userId: input.userId,
      scope: "deposit",
      requestHash,
      response: view,
    });
    return view;
  });
  if (process.env.SIMULATED_PAYMENTS_AUTO_SETTLE === "true" && simulate === "settle") {
    await applyProviderResult({
      paymentId: created.paymentId,
      status: "SETTLED",
      eventId: `auto:${created.paymentId}`,
      payload: { source: "auto" },
    });
    return { ...created, status: "SETTLED" };
  }
  if (process.env.SIMULATED_PAYMENTS_AUTO_SETTLE === "true" && simulate === "fail") {
    await applyProviderResult({
      paymentId: created.paymentId,
      status: "FAILED",
      eventId: `auto-fail:${created.paymentId}`,
      payload: { source: "auto" },
      failureReason: "Simulated bank rejection",
    });
    return { ...created, status: "FAILED" };
  }
  return created;
}

export async function requestWithdrawal(input: { userId: string; idempotencyKey: string }): Promise<PaymentView> {
  assertSimulatedProvider();
  const settings = await getSettings();
  const created = await withUserLock(input.userId, async (tx) => {
    const prior = await beginIdempotency(tx, {
      key: input.idempotencyKey,
      userId: input.userId,
      scope: "withdrawal",
      requestHash: "standard",
    });
    if (prior.replay) return prior.replay as PaymentView;
    await assertWithdrawalsEnabled(tx);
    const eligible = await accountBalance(tx, input.userId, "USER_CASH");
    const plan = unwrap(
      planWithdrawal({
        eligibleCashPaise: eligible,
        minimumPaise: settings.withdrawalMinPaise,
        standardBps: settings.withdrawalStandardBps,
      }),
    );
    const payment = await tx.payment.create({
      data: {
        userId: input.userId,
        provider: "simulated",
        providerRef: `sim_${randomUUID()}`,
        kind: "PAYOUT",
        status: "PENDING",
        amountPaise: plan.standardPaise,
        idempotencyKey: input.idempotencyKey,
        metadata: {
          remainderPaise: plan.remainderPaise.toString(),
          standardBps: settings.withdrawalStandardBps,
          simulate: "settle",
        },
        nextRetryAt: new Date(Date.now() + 15_000),
      },
    });
    await postJournal(tx, {
      entryType: "WITHDRAWAL_HOLD",
      description: "Withdrawal reserved. The remainder stays in cash.",
      referenceType: "Payment",
      referenceId: payment.id,
      lines: [
        {
          userId: input.userId,
          account: "USER_CASH",
          amountPaise: -plan.standardPaise,
          lineKey: `payout:${payment.id}:USER_CASH`,
        },
        {
          userId: input.userId,
          account: "USER_WITHDRAWAL_HOLD",
          amountPaise: plan.standardPaise,
          lineKey: `payout:${payment.id}:HOLD`,
        },
      ],
    });
    const view: PaymentView = {
      paymentId: payment.id,
      status: "PENDING",
      amountPaise: plan.standardPaise.toString(),
      kind: "PAYOUT",
      providerRef: payment.providerRef,
      remainderPaise: plan.remainderPaise.toString(),
    };
    await saveIdempotency(tx, {
      key: input.idempotencyKey,
      userId: input.userId,
      scope: "withdrawal",
      requestHash: "standard",
      response: view,
    });
    return view;
  });
  if (process.env.SIMULATED_PAYMENTS_AUTO_SETTLE === "true") {
    await applyProviderResult({
      paymentId: created.paymentId,
      status: "SETTLED",
      eventId: `auto:${created.paymentId}`,
      payload: { source: "auto" },
    });
    return { ...created, status: "SETTLED" };
  }
  return created;
}

export async function applyProviderResult(input: {
  paymentId: string;
  status: "SETTLED" | "FAILED" | "CANCELLED";
  eventId: string;
  payload: unknown;
  failureReason?: string;
}): Promise<{ duplicate: boolean }> {
  const payment = await prisma.payment.findUnique({ where: { id: input.paymentId } });
  if (!payment) throw new AppError("NOT_FOUND", "Payment not found.", 404);
  const result = await withUserLock(payment.userId, async (tx) => {
    const existing = await tx.paymentEvent.findUnique({
      where: { provider_eventId: { provider: payment.provider, eventId: input.eventId } },
    });
    if (existing) return { duplicate: true };
    const current = await tx.payment.findUnique({ where: { id: payment.id } });
    if (!current) throw new AppError("NOT_FOUND", "Payment not found.", 404);
    await tx.paymentEvent.create({
      data: {
        paymentId: current.id,
        provider: current.provider,
        eventId: input.eventId,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
    if (current.status !== "PENDING") return { duplicate: false };
    const reported = reportedWebhook(input.payload);
    const mismatch = input.status === "SETTLED" && (!webhookAmountAccepted(current.amountPaise, reported.amountPaise) || !webhookCurrencyAccepted(reported.currency));
    const status = mismatch ? "FAILED" : input.status;
    const failureReason = mismatch ? "Amount or currency did not match the payment." : input.failureReason;
    const identity = safeProviderIdentity(reportedIdentity(input.payload));
    if (status === "FAILED" || status === "CANCELLED") {
      if (current.kind === "PAYOUT") await releaseHold(tx, current.userId, current.id, current.amountPaise);
      await tx.payment.update({
        where: { id: current.id },
        data: {
          status: status === "CANCELLED" ? "CANCELLED" : "FAILED",
          failureReason: failureReason ?? (status === "CANCELLED" ? "Payment cancelled" : "Payment failed"),
          attemptCount: { increment: 1 },
          ...(identity.providerCustomerId ? { providerCustomerId: identity.providerCustomerId } : {}),
          ...(identity.payerReference ? { payerReference: identity.payerReference } : {}),
          ...(identity.paymentInstrumentFingerprint ? { paymentInstrumentFingerprint: identity.paymentInstrumentFingerprint } : {}),
        },
      });
      return { duplicate: false };
    }
    if (current.kind === "DEPOSIT") {
      await postJournal(tx, {
        entryType: "DEPOSIT",
        description: "Simulated deposit settled",
        referenceType: "Payment",
        referenceId: current.id,
        lines: [
          {
            userId: current.userId,
            account: "USER_CASH",
            amountPaise: current.amountPaise,
            lineKey: `deposit:${current.id}:USER_CASH`,
          },
          {
            userId: null,
            account: "OFFSET_CASH",
            amountPaise: -current.amountPaise,
            lineKey: `deposit:${current.id}:OFFSET_CASH`,
          },
        ],
      });
      await tryConvertBonus(tx, current.userId);
    } else {
      await postJournal(tx, {
        entryType: "PAYOUT",
        description: "Simulated payout settled",
        referenceType: "Payment",
        referenceId: current.id,
        lines: [
          {
            userId: current.userId,
            account: "USER_WITHDRAWAL_HOLD",
            amountPaise: -current.amountPaise,
            lineKey: `payout-settle:${current.id}:HOLD`,
          },
          {
            userId: null,
            account: "OFFSET_CASH",
            amountPaise: current.amountPaise,
            lineKey: `payout-settle:${current.id}:OFFSET_CASH`,
          },
        ],
      });
    }
    await tx.payment.update({
      where: { id: current.id },
      data: {
        status: "SETTLED",
        settledAt: new Date(),
        attemptCount: { increment: 1 },
        ...(identity.providerCustomerId ? { providerCustomerId: identity.providerCustomerId } : {}),
        ...(identity.payerReference ? { payerReference: identity.payerReference } : {}),
        ...(identity.paymentInstrumentFingerprint ? { paymentInstrumentFingerprint: identity.paymentInstrumentFingerprint } : {}),
      },
    });
    return { duplicate: false, settledKind: current.kind, amountPaise: current.amountPaise, userId: current.userId, paymentId: current.id };
  });
  if (result.duplicate === false && "settledKind" in result && result.settledKind) {
    const { noteSettlement } = await import("./attribution");
    await noteSettlement(result.userId, result.paymentId, result.settledKind, result.amountPaise);
  }
  return { duplicate: result.duplicate };
}

async function releaseHold(tx: Tx, userId: string, paymentId: string, amountPaise: bigint) {
  await postJournal(tx, {
    entryType: "PAYOUT_REVERSAL",
    description: "Withdrawal failed and the reserved cash was returned",
    referenceType: "Payment",
    referenceId: paymentId,
    lines: [
      {
        userId,
        account: "USER_WITHDRAWAL_HOLD",
        amountPaise: -amountPaise,
        lineKey: `payout-fail:${paymentId}:HOLD`,
      },
      {
        userId,
        account: "USER_CASH",
        amountPaise: amountPaise,
        lineKey: `payout-fail:${paymentId}:USER_CASH`,
      },
    ],
  });
}

export async function expireStalePayments(now = new Date(), expiryMs = PAYMENT_PENDING_EXPIRY_MS): Promise<number> {
  const cutoff = new Date(now.getTime() - expiryMs);
  const due = await prisma.payment.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    select: { id: true, status: true },
    take: 50,
  });
  const ids = due.filter((payment) => canExpirePayment(payment.status)).map((payment) => payment.id);
  if (ids.length === 0) return 0;
  const updated = await prisma.payment.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: { status: "EXPIRED", failureReason: "The payment window expired before confirmation." },
  });
  return updated.count;
}

export async function retryPendingPayments(): Promise<number> {
  if (process.env.PAYMENT_PROVIDER !== "simulated") return 0;
  const due = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      attemptCount: { lt: 5 },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
    },
    take: 20,
  });
  let count = 0;
  for (const payment of due) {
    const metadata = payment.metadata as { simulate?: string } | null;
    const status = metadata?.simulate === "fail" ? "FAILED" : "SETTLED";
    try {
      await applyProviderResult({
        paymentId: payment.id,
        status,
        eventId: `retry:${payment.id}:${payment.attemptCount}`,
        payload: { source: "worker" },
        failureReason: status === "FAILED" ? "Simulated failure" : undefined,
      });
      count += 1;
    } catch (error) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          attemptCount: { increment: 1 },
          nextRetryAt: new Date(Date.now() + 30_000),
          failureReason: error instanceof Error ? error.message : "Retry failed",
        },
      });
    }
  }
  return count;
}

function reportedIdentity(payload: unknown): { providerCustomerId?: string | null; payerReference?: string | null; paymentInstrumentFingerprint?: string | null } {
  if (!payload || typeof payload !== "object") return {};
  const body = payload as { providerCustomerId?: unknown; payerReference?: unknown; paymentInstrumentFingerprint?: unknown };
  return {
    providerCustomerId: typeof body.providerCustomerId === "string" ? body.providerCustomerId : null,
    payerReference: typeof body.payerReference === "string" ? body.payerReference : null,
    paymentInstrumentFingerprint: typeof body.paymentInstrumentFingerprint === "string" ? body.paymentInstrumentFingerprint : null,
  };
}

function reportedWebhook(payload: unknown): { amountPaise: bigint | null; currency: string | null } {
  if (!payload || typeof payload !== "object") return { amountPaise: null, currency: null };
  const body = payload as { amountPaise?: unknown; currency?: unknown };
  let amountPaise: bigint | null = null;
  if (body.amountPaise !== undefined && body.amountPaise !== null) {
    if (typeof body.amountPaise === "string" && /^\d+$/.test(body.amountPaise)) amountPaise = BigInt(body.amountPaise);
    else if (typeof body.amountPaise === "number" && Number.isInteger(body.amountPaise) && body.amountPaise >= 0) amountPaise = BigInt(body.amountPaise);
    else amountPaise = -1n;
  }
  return { amountPaise, currency: typeof body.currency === "string" ? body.currency : null };
}

export async function reconcilePayment(paymentId: string, actorId: string): Promise<PaymentView> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new AppError("NOT_FOUND", "Payment not found.", 404);
  if (payment.status === "PENDING") {
    const metadata = payment.metadata as { simulate?: string } | null;
    await applyProviderResult({
      paymentId: payment.id,
      status: metadata?.simulate === "fail" ? "FAILED" : "SETTLED",
      eventId: `reconcile:${payment.id}:${randomUUID()}`,
      payload: { source: "admin", actorId },
    });
  }
  const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  return {
    paymentId: fresh.id,
    status: fresh.status,
    amountPaise: fresh.amountPaise.toString(),
    kind: fresh.kind,
    providerRef: fresh.providerRef,
  };
}
