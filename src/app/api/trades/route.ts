import { z } from "zod";
import { noteTrade } from "@/server/attribution";
import { assertTradingEnabled } from "@/server/features";
import { executeTrade } from "@/server/trading";
import { assertSameOrigin, handle, idempotencyKey, json, readBody, requireUser } from "@/server/http";

const schema = z.object({ quoteId: z.string() });

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    await assertTradingEnabled();
    const body = await readBody(request, schema);
    const trade = await executeTrade({
      userId: user.id,
      quoteId: body.quoteId,
      idempotencyKey: idempotencyKey(request),
    });
    await noteTrade(user.id, trade);
    return json(trade);
  });
}
