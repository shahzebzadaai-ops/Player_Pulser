import { z } from "zod";
import { AppError } from "@/domain/errors";
import { customerDepositAllowed } from "@/domain/growth";
import { noteDepositStarted } from "@/server/attribution";
import { assertDepositsEnabled } from "@/server/features";
import { createDeposit } from "@/server/payments";
import { assertSameOrigin, handle, idempotencyKey, json, readBody, requireUser } from "@/server/http";
import { assertDurableRate } from "@/server/rate-limit";

const schema = z.object({
  amountPaise: z.string().regex(/^\d+$/, "Enter an amount in paise."),
  method: z.enum(["UPI", "BANK", "CRYPTO"]),
  simulate: z.enum(["settle", "fail", "pending"]).optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    await assertDurableRate("deposit", user.id, 10 * 60_000, 8);
    await assertDepositsEnabled();
    const body = await readBody(request, schema);
    if (!customerDepositAllowed(BigInt(body.amountPaise))) throw new AppError("AMOUNT", "The minimum deposit is ₹500.", 400);
    const payment = await createDeposit({
      userId: user.id,
      amountPaise: BigInt(body.amountPaise),
      method: body.method,
      idempotencyKey: idempotencyKey(request),
      simulate: body.simulate,
    });
    await noteDepositStarted(user.id, payment.paymentId);
    return json(payment);
  });
}
