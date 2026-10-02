import { z } from "zod";
import { assertTradingEnabled } from "@/server/features";
import { createQuote } from "@/server/trading";
import { assertSameOrigin, handle, json, readBody, requireUser } from "@/server/http";

const schema = z.object({
  playerId: z.string(),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().int().positive(),
  requestedBonusPaise: z.string().nullable().optional(),
  seenMidPaise: z.string().optional(),
  confirmPriceChange: z.boolean().optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    await assertTradingEnabled();
    const body = await readBody(request, schema);
    const quote = await createQuote({
      userId: user.id,
      playerId: body.playerId,
      side: body.side,
      quantity: body.quantity,
      requestedBonusPaise: body.requestedBonusPaise ? BigInt(body.requestedBonusPaise) : null,
      seenMidPaise: body.seenMidPaise ? BigInt(body.seenMidPaise) : null,
      confirmPriceChange: body.confirmPriceChange ?? false,
    });
    return json(quote);
  });
}
