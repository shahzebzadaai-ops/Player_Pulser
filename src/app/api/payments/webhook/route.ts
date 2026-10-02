import { AppError } from "@/domain/errors";
import { handle, json } from "@/server/http";
import { applyProviderResult, verifyWebhookSignature } from "@/server/payments";

export async function POST(request: Request) {
  return handle(async () => {
    const raw = await request.text();
    if (!verifyWebhookSignature(raw, request.headers.get("x-playerpulser-signature"))) {
      throw new AppError("WEBHOOK", "Webhook signature was rejected.", 401);
    }
    const body = JSON.parse(raw) as {
      eventId?: string;
      paymentId?: string;
      status?: "SETTLED" | "FAILED" | "CANCELLED";
      failureReason?: string;
    };
    if (!body.eventId || !body.paymentId || (body.status !== "SETTLED" && body.status !== "FAILED" && body.status !== "CANCELLED")) {
      throw new AppError("WEBHOOK", "Webhook payload is incomplete.", 400);
    }
    const result = await applyProviderResult({
      paymentId: body.paymentId,
      status: body.status,
      eventId: body.eventId,
      payload: body,
      failureReason: body.failureReason,
    });
    return json({ ok: true, duplicate: result.duplicate });
  });
}
