import { z } from "zod";
import { parseAuthIntent } from "@/domain/auth-intent";
import { AppError } from "@/domain/errors";
import { recordEvent } from "@/server/attribution";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { clearIntent, saveIntent } from "@/server/intent-cookie";

const schema = z.object({
  type: z.enum(["BUY", "DEPOSIT", "PORTFOLIO", "REWARDS", "WATCHLIST", "REFERRAL", "HOME", "WALLET", "NOTIFICATIONS"]),
  playerId: z.string().optional(),
  slug: z.string().optional(),
  quantity: z.number().int().optional(),
  side: z.enum(["BUY", "SELL"]).optional(),
  displayedIndicativePrice: z.string().optional(),
  seenPricePaise: z.string().optional(),
  returnUrl: z.string().optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readBody(request, schema);
    if (body.returnUrl) throw new AppError("INVALID", "That continuation is not available.", 400);
    const intent = parseAuthIntent(body.type === "BUY" ? { ...body, createdAt: Date.now() } : body);
    if (!intent) throw new AppError("INVALID", "That continuation is not available.", 400);
    await saveIntent(intent);
    if (intent.type === "BUY") {
      await recordEvent({ eventName: "buy_intent_created", dedupeKey: `buy-intent:${intent.playerId}:${Date.now()}` });
    }
    if (intent.type === "DEPOSIT") {
      await recordEvent({ eventName: "deposit_intent_created", dedupeKey: `deposit-intent:${Date.now()}` });
    }
    return json({ ok: true });
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    await clearIntent();
    return json({ ok: true });
  });
}
