import { randomUUID } from "crypto";
import { expect, test } from "vitest";
import type { RealtimeNotice } from "@/domain/realtime";
import { SHOWCASE_SOURCE } from "@/domain/showcase-market";
import { maintainPrices } from "@/server/price-cycle";
import { prisma } from "@/server/prisma";
import { publicPricePayload } from "@/server/queries";
import { onRealtimeNotice, startRealtimeListener, stopRealtimeListener } from "@/server/realtime";
import { generateShowcaseHistory } from "@/server/showcase";

test("showcase prices are stored ticks, reach SSE, and history does not create money records", async () => {
  const previousMode = await prisma.appSetting.findUnique({ where: { key: "pricing.marketMode" } });
  const previousEngine = await prisma.appSetting.findUnique({ where: { key: "pricing.engineMode" } });
  await prisma.appSetting.upsert({
    where: { key: "pricing.engineMode" },
    create: { key: "pricing.engineMode", value: "SIMULATION" },
    update: { value: "SIMULATION" },
  });
  await prisma.appSetting.upsert({
    where: { key: "pricing.marketMode" },
    create: { key: "pricing.marketMode", value: "SHOWCASE" },
    update: { value: "SHOWCASE" },
  });
  const actor = await prisma.user.create({
    data: { phone: `+919${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`, displayName: "Showcase Admin", role: "ADMIN" },
  });
  const player = await prisma.player.create({
    data: {
      slug: `show-${randomUUID()}`,
      name: "Showcase Batter",
      shortName: "Show",
      role: "BATTER",
      referenceMidPaise: 10_000n,
      basePricePaise: 10_000n,
      midPricePaise: 10_000n,
      matchAnchorPaise: 10_000n,
      fictional: true,
      blurb: "Showcase test player",
      tradable: true,
    },
  });
  let stopListen = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await startRealtimeListener();
    const received = new Promise<RealtimeNotice>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("listener timeout")), 45_000);
      stopListen = onRealtimeNotice((notice) => {
        if (notice.type !== "price" || notice.playerId !== player.id) return;
        if (timer) clearTimeout(timer);
        stopListen();
        resolve(notice);
      });
    });
    received.catch(() => undefined);
    let stored = 0;
    for (let attempt = 0; attempt < 12 && stored === 0; attempt += 1) {
      expect(await maintainPrices()).toBe("showcase");
      stored = await prisma.priceTick.count({ where: { playerId: player.id, source: SHOWCASE_SOURCE } });
    }
    expect(stored).toBeGreaterThan(0);
    const notice = await received;
    const tick = await prisma.priceTick.findFirstOrThrow({ where: { playerId: player.id, source: SHOWCASE_SOURCE }, orderBy: { createdAt: "desc" } });
    expect(notice.priceTickId).toBe(tick.id);
    const before = {
      users: await prisma.user.count(),
      trades: await prisma.trade.count(),
      payments: await prisma.payment.count(),
      bonuses: await prisma.bonusGrant.count(),
    };
    const history = await generateShowcaseHistory({ actorId: actor.id, reason: "Presentation history", playerIds: [player.id] });
    expect(history.ticks).toBeGreaterThan(100);
    expect(await prisma.user.count()).toBe(before.users);
    expect(await prisma.trade.count()).toBe(before.trades);
    expect(await prisma.payment.count()).toBe(before.payments);
    expect(await prisma.bonusGrant.count()).toBe(before.bonuses);
    const bounds = await prisma.priceTick.aggregate({
      where: { playerId: player.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      _max: { midPaise: true },
      _min: { midPaise: true },
    });
    const payload = await publicPricePayload();
    const row = payload.players.find((item) => item.id === player.id);
    expect(row?.dayHighPaise).toBe(bounds._max.midPaise?.toString());
    expect(row?.dayLowPaise).toBe(bounds._min.midPaise?.toString());
    expect(payload.marketMode).toBe("SHOWCASE");

    const beforeDriven = await prisma.priceTick.count({ where: { source: SHOWCASE_SOURCE } });
    await prisma.appSetting.update({ where: { key: "pricing.marketMode" }, data: { value: "EVENT_DRIVEN" } });
    expect(await maintainPrices()).toBe("event-driven");
    expect(await prisma.priceTick.count({ where: { source: SHOWCASE_SOURCE } })).toBe(beforeDriven);
  } finally {
    if (timer) clearTimeout(timer);
    stopListen();
    await stopRealtimeListener();
    if (previousEngine) await prisma.appSetting.update({ where: { key: "pricing.engineMode" }, data: { value: previousEngine.value ?? "SIMULATION" } });
    else await prisma.appSetting.deleteMany({ where: { key: "pricing.engineMode" } });
    if (previousMode) await prisma.appSetting.update({ where: { key: "pricing.marketMode" }, data: { value: previousMode.value ?? "SHOWCASE" } });
    else await prisma.appSetting.deleteMany({ where: { key: "pricing.marketMode" } });
  }
});
