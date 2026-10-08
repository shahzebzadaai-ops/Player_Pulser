import { z } from "zod";
import { noteWithdrawalRequested } from "@/server/attribution";
import { assertWithdrawalsEnabled } from "@/server/features";
import { requestWithdrawal } from "@/server/payments";
import { assertDemoPaymentsBlocked } from "@/server/investor-demo";
import { assertSameOrigin, handle, idempotencyKey, json, readBody, requireUser } from "@/server/http";

const schema = z.object({
  amountPaise: z.string().regex(/^\d+$/, "Enter an amount in paise."),
  method: z.enum(["UPI", "BANK", "WALLET"]),
  destination: z.string().trim().min(3, "Enter the account, UPI ID, or wallet details.").max(120),
  note: z.string().trim().max(280).optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    assertDemoPaymentsBlocked(user);
    await assertWithdrawalsEnabled();
    const body = await readBody(request, schema);
    const payment = await requestWithdrawal({
      userId: user.id,
      idempotencyKey: idempotencyKey(request),
      amountPaise: BigInt(body.amountPaise),
      method: body.method,
      destination: body.destination,
      note: body.note,
    });
    await noteWithdrawalRequested(user.id, payment.paymentId);
    return json(payment);
  });
}
