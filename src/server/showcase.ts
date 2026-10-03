import { buildShowcaseHistory, SHOWCASE_SOURCE } from "@/domain/showcase-market";
import { requireReason, writeAudit } from "./audit";
import { prisma } from "./prisma";
import { publishPriceUpdate } from "./realtime";

export async function generateShowcaseHistory(input: { actorId: string; reason: string; playerIds?: string[]; ip?: string | null }) {
  const reason = requireReason(input.reason);
  const players = await prisma.player.findMany({
    where: { tradable: true, ...(input.playerIds ? { id: { in: input.playerIds } } : {}) },
  });
  const now = new Date();
  let ticks = 0;
  for (const player of players) {
    const history = buildShowcaseHistory({
      slug: player.slug,
      referencePaise: player.referenceMidPaise,
      now,
    });
    await prisma.priceTick.deleteMany({
      where: { playerId: player.id, source: { in: [SHOWCASE_SOURCE, "SIMULATION_ONLY"] } },
    });
    const last = history.points[history.points.length - 1];
    let previous = player.referenceMidPaise;
    for (let offset = 0; offset < history.points.length; offset += 1000) {
      const batch = history.points.slice(offset, offset + 1000);
      await prisma.priceTick.createMany({
        data: batch.map((point) => {
          const row = {
            playerId: player.id,
            midPaise: point.midPaise,
            previousMidPaise: previous,
            source: SHOWCASE_SOURCE,
            reason: "Showcase history",
            createdAt: point.at,
          };
          previous = point.midPaise;
          return row;
        }),
      });
      ticks += batch.length;
    }
    if (last) {
      await prisma.player.update({ where: { id: player.id }, data: { midPricePaise: last.midPaise } });
      const stored = await prisma.priceTick.findFirst({
        where: { playerId: player.id, source: SHOWCASE_SOURCE },
        orderBy: { createdAt: "desc" },
      });
      if (stored) {
        await publishPriceUpdate({
          playerId: player.id,
          priceTickId: stored.id,
          publishedAt: stored.createdAt.toISOString(),
        });
      }
    }
  }
  await writeAudit({
    actorId: input.actorId,
    action: "setting.trading",
    entityType: "PriceTick",
    entityId: "showcase-history",
    before: null,
    after: { players: players.length, ticks },
    reason,
    ip: input.ip,
  });
  return { players: players.length, ticks };
}

export async function resetShowcaseHistory(input: { actorId: string; reason: string; ip?: string | null }) {
  const reason = requireReason(input.reason);
  const removed = await prisma.priceTick.deleteMany({ where: { source: SHOWCASE_SOURCE } });
  const players = await prisma.player.findMany({ where: { tradable: true }, select: { id: true, referenceMidPaise: true } });
  for (const player of players) {
    const latest = await prisma.priceTick.findFirst({
      where: { playerId: player.id },
      orderBy: { createdAt: "desc" },
      select: { midPaise: true },
    });
    await prisma.player.update({
      where: { id: player.id },
      data: { midPricePaise: latest?.midPaise ?? player.referenceMidPaise },
    });
  }
  await writeAudit({
    actorId: input.actorId,
    action: "setting.trading",
    entityType: "PriceTick",
    entityId: "showcase-history-reset",
    before: null,
    after: { removed: removed.count },
    reason,
    ip: input.ip,
  });
  return { removed: removed.count };
}
