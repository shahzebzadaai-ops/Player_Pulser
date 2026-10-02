import { z } from "zod";
import { AppError } from "@/domain/errors";
import { requirePermission } from "@/server/access";
import { clientIp, requireReason, writeAudit } from "@/server/audit";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { prisma } from "@/server/prisma";
import { onMidPricePersisted } from "@/server/risk";

const schema = z.object({
  playerId: z.string(),
  tradable: z.boolean(),
  liveMatch: z.boolean(),
  midRupees: z.string(),
  reason: z.string().optional(),
});

function rupeesToPaise(value: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new AppError("INVALID", "Enter a rupee amount with at most 2 decimal places.", 400);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readBody(request, schema);
    const midPaise = rupeesToPaise(body.midRupees);
    if (midPaise < 100n) throw new AppError("INVALID", "The mid price must be at least ₹1.", 400);
    const before = await prisma.player.findUnique({ where: { id: body.playerId } });
    if (!before) throw new AppError("NOT_FOUND", "That player was not found.", 404);
    const priceChanged = before.midPricePaise !== midPaise;
    const { user } = await requirePermission(request, priceChanged ? "player.price_override" : "player.edit");
    const reason = priceChanged ? requireReason(body.reason) : body.reason?.trim() || null;
    const turningLive = !before.liveMatch && body.liveMatch;
    const turningOff = before.liveMatch && !body.liveMatch;
    const player = await prisma.player.update({
      where: { id: body.playerId },
      data: {
        tradable: body.tradable,
        liveMatch: body.liveMatch,
        referenceMidPaise: midPaise,
        midPricePaise: midPaise,
        ...(turningLive ? { matchAnchorPaise: midPaise, performanceMatchBps: 0 } : {}),
        ...(turningOff ? { performanceMatchBps: 0 } : {}),
      },
    });
    await prisma.priceTick.create({
      data: {
        playerId: player.id,
        midPaise,
        previousMidPaise: before.midPricePaise,
        source: "admin",
        performance: 0,
        demand: 0,
        news: 0,
        wasClamped: false,
        reason: priceChanged ? "Staff price override" : "Staff trading status update",
      },
    });
    await writeAudit({
      actorId: user.id,
      action: priceChanged ? "player.price_override" : "player.update",
      entityType: "Player",
      entityId: player.id,
      before: {
        tradable: before.tradable,
        liveMatch: before.liveMatch,
        midPaise: before.midPricePaise.toString(),
      },
      after: { tradable: body.tradable, liveMatch: body.liveMatch, midPaise: midPaise.toString() },
      reason,
      ip: clientIp(request),
    });
    await onMidPricePersisted(player.id, before.midPricePaise, midPaise);
    return json({ ok: true });
  });
}
