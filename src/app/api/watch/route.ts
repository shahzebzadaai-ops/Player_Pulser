import { z } from "zod";
import { assertSameOrigin, handle, json, readBody, requireUser } from "@/server/http";
import { prisma } from "@/server/prisma";

const schema = z.object({
  playerId: z.string().min(1),
  watching: z.boolean(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request, schema);
    const player = await prisma.player.findUnique({ where: { id: body.playerId }, select: { id: true } });
    if (!player) return json({ error: { code: "NOT_FOUND", message: "That player is not available." } }, 404);
    if (body.watching) {
      await prisma.playerWatch.upsert({
        where: { userId_playerId: { userId: user.id, playerId: player.id } },
        create: { userId: user.id, playerId: player.id },
        update: {},
      });
    } else {
      await prisma.playerWatch.deleteMany({ where: { userId: user.id, playerId: player.id } });
    }
    return json({ watching: body.watching });
  });
}
