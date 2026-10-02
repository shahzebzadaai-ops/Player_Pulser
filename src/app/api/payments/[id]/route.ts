import { creditFromPaymentReturn } from "@/domain/growth";
import { normalizePaymentStatus } from "@/domain/payment-lifecycle";
import { AppError } from "@/domain/errors";
import { expireStalePayments } from "@/server/payments";
import { assertDurableRate } from "@/server/rate-limit";
import { handle, json, requireUser } from "@/server/http";
import { prisma } from "@/server/prisma";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(request);
    await assertDurableRate("payment-status", user.id, 60_000, 40);
    const { id } = await context.params;
    await expireStalePayments();
    const payment = await prisma.payment.findFirst({ where: { id, userId: user.id } });
    if (!payment) throw new AppError("NOT_FOUND", "Payment not found.", 404);
    const gate = creditFromPaymentReturn();
    const lifecycle = normalizePaymentStatus(payment.status);
    const display = lifecycle === "SUCCESS" ? "SUCCESS" : lifecycle === "PENDING" ? "VERIFYING" : lifecycle;
    return json({
      paymentId: payment.id,
      status: payment.status,
      display,
      amountPaise: payment.amountPaise.toString(),
      creditedByReturn: gate.credited,
    });
  });
}
