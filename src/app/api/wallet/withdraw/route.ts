import { noteWithdrawalRequested } from "@/server/attribution";
import { assertWithdrawalsEnabled } from "@/server/features";
import { requestWithdrawal } from "@/server/payments";
import { assertSameOrigin, handle, idempotencyKey, json, requireUser } from "@/server/http";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    await assertWithdrawalsEnabled();
    const payment = await requestWithdrawal({ userId: user.id, idempotencyKey: idempotencyKey(request) });
    await noteWithdrawalRequested(user.id, payment.paymentId);
    return json(payment);
  });
}
