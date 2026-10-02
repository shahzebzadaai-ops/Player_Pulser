import { Prisma } from "@prisma/client";
import { z } from "zod";
import { NEWS_CATEGORIES, isMatchContext } from "@/domain/pricing-engine";
import { AppError } from "@/domain/errors";
import { requirePermission } from "@/server/access";
import { clientIp, writeAudit } from "@/server/audit";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { applyPendingPricing } from "@/server/pricing";
import { prisma } from "@/server/prisma";
import { getSettings } from "@/server/settings";

const schema = z.object({
  playerId: z.string(),
  kind: z.enum(["match", "news"]),
  eventType: z.string().min(1),
  context: z.string().optional(),
  headline: z.string().min(3),
  severity: z.number().int().min(1).max(5).optional(),
  direction: z.enum(["POSITIVE", "NEGATIVE"]).optional(),
  verified: z.boolean().optional(),
  idempotencyKey: z.string().min(8).max(120),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "player.edit");
    const body = await readBody(request, schema);
    const player = await prisma.player.findUnique({ where: { id: body.playerId } });
    if (!player) throw new AppError("NOT_FOUND", "That player was not found.", 404);
    try {
    if (body.kind === "match") {
      const context = body.context && isMatchContext(body.context) ? body.context : "NORMAL";
      await prisma.matchEvent.create({
        data: {
          playerId: player.id,
          overLabel: "staff",
          kind: body.eventType.trim().toUpperCase(),
          summary: body.headline,
          simulated: false,
          context,
          idempotencyKey: body.idempotencyKey,
        },
      });
    } else {
      const category = body.eventType.trim().toUpperCase();
      if (!(NEWS_CATEGORIES as readonly string[]).includes(category)) {
        throw new AppError("INVALID", "That news category is not recognised.", 400);
      }
      await prisma.playerNewsEvent.create({
        data: {
          playerId: player.id,
          category,
          direction: body.direction ?? "NEGATIVE",
          severity: body.severity ?? 3,
          confidence: 100,
          source: "staff",
          headline: body.headline,
          occurredAt: new Date(),
          verifiedAt: body.verified ? new Date() : null,
          createdBy: user.id,
          sourceAgent: "staff",
          idempotencyKey: body.idempotencyKey,
        },
      });
    }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError("DUPLICATE", "That event id was already recorded.", 409);
      }
      throw error;
    }
    await writeAudit({
      actorId: user.id,
      action: "pricing.event",
      entityType: body.kind === "match" ? "MatchEvent" : "PlayerNewsEvent",
      entityId: body.idempotencyKey,
      after: { playerId: player.id, eventType: body.eventType, verified: body.verified ?? false },
      reason: body.headline,
      ip: clientIp(request),
    });
    const settings = await getSettings();
    const applied = settings.engineMode === "EVENT_DRIVEN" ? await applyPendingPricing(player.id) : 0;
    return json({ ok: true, applied: applied > 0 });
  });
}
