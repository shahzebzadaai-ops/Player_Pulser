import { randomUUID } from "crypto";
import { z } from "zod";
import { devAuthAllowed } from "@/domain/phone";
import { AppError } from "@/domain/errors";
import { assertSameOrigin, handle, json, readBody, requireUser } from "@/server/http";
import { applyProviderResult, createDeposit, signWebhook, verifyWebhookSignature } from "@/server/payments";

const schema = z.object({
  outcome: z.enum(["SUCCESS", "PENDING", "FAILED", "CANCELLED"]),
});

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" || !devAuthAllowed()) {
    return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);
  }
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request, schema);
    const payment = await createDeposit({
      userId: user.id,
      amountPaise: 50_000n,
      method: "UPI",
      idempotencyKey: randomUUID(),
      simulate: "pending",
    });
    if (body.outcome === "PENDING") return json({ paymentId: payment.paymentId, status: "PENDING" });
    const status = body.outcome === "SUCCESS" ? "SETTLED" : body.outcome === "FAILED" ? "FAILED" : "CANCELLED";
    const payload = {
      eventId: `dev:${payment.paymentId}:${body.outcome}:${randomUUID()}`,
      paymentId: payment.paymentId,
      status,
      amountPaise: "50000",
      currency: "INR",
    };
    const raw = JSON.stringify(payload);
    const secret = process.env.PAYMENT_WEBHOOK_SECRET ?? "";
    const signature = signWebhook(raw, secret);
    if (!verifyWebhookSignature(raw, signature)) {
      throw new AppError("WEBHOOK", "The development webhook secret is not configured.", 401);
    }
    await applyProviderResult({
      paymentId: payment.paymentId,
      status,
      eventId: payload.eventId,
      payload,
      failureReason: status === "SETTLED" ? undefined : `Development ${body.outcome}`,
    });
    return json({ paymentId: payment.paymentId, status });
  });
}
