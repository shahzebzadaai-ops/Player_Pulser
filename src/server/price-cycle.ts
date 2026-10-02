import { directSimulatedPricingEnabled } from "@/domain/pricing-engine";
import { prepareSimulatedTick } from "@/domain/pricing";
import { getFeatureFlags } from "./features";
import { applyPendingPricing } from "./pricing";
import { prisma } from "./prisma";
import { publishPriceUpdate } from "./realtime";
import { onMidPricePersisted } from "./risk";
import { writePriceCache } from "./redis";
import { publicPricePayload } from "./queries";
import { getSettings } from "./settings";

const EVENTS = [
  { kind: "4", summary: "Guided to the boundary in the simulation." },
  { kind: "6", summary: "Clears the rope in the simulation." },
  { kind: "1", summary: "Rotates the strike." },
  { kind: "W", summary: "A wicket changes the simulated demand." },
];

export async function maintainPrices(): Promise<"event-driven" | "simulation" | "idle"> {
  const settings = await getSettings();
  if (settings.pricingMode !== "simulation") return "idle";
  if (!directSimulatedPricingEnabled(settings.engineMode)) {
    await applyPendingPricing();
    await writePriceCache(JSON.stringify(await publicPricePayload()));
    return "event-driven";
  }
  const flags = await getFeatureFlags();
  const players = await prisma.player.findMany({ where: { tradable: true } });
  for (const player of players) {
    const latest = await prisma.priceTick.findFirst({
      where: { playerId: player.id },
      orderBy: { createdAt: "desc" },
    });
    const tick = prepareSimulatedTick({
      previousMidPaise: latest?.midPaise ?? player.referenceMidPaise,
      performance: (Math.random() * 2 - 1) * (player.liveMatch ? 1 : 0.45),
      demand: Math.random() * 2 - 1,
      news: (Math.random() * 2 - 1) * 0.6,
      capBps: settings.pricingSimulationCapBps,
      newsPriceMovementEnabled: flags.newsPriceMovementEnabled,
      demandPriceMovementEnabled: flags.demandPriceMovementEnabled,
    });
    const stored = await prisma.priceTick.create({
      data: {
        playerId: player.id,
        midPaise: tick.midPaise,
        previousMidPaise: tick.previousMidPaise,
        source: tick.source,
        performance: tick.performance,
        demand: tick.demand,
        news: tick.news,
        performanceBps: tick.performanceBps,
        demandBps: tick.demandBps,
        newsBps: tick.newsBps,
        reason: tick.reason,
      },
    });
    await prisma.player.update({
      where: { id: player.id },
      data: { midPricePaise: tick.midPaise },
    });
    await publishPriceUpdate({
      playerId: player.id,
      priceTickId: stored.id,
      publishedAt: stored.createdAt.toISOString(),
    });
    try {
      await onMidPricePersisted(player.id, tick.previousMidPaise, tick.midPaise);
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        message: error instanceof Error ? error.message : "risk evaluation failed",
        at: new Date().toISOString(),
      }));
    }
    if (player.liveMatch && Math.random() < 0.15) {
      const event = EVENTS[Math.floor(Math.random() * EVENTS.length)];
      if (!event) continue;
      const over = `${Math.floor(Math.random() * 20)}.${Math.floor(Math.random() * 6)}`;
      await prisma.matchEvent.create({
        data: {
          playerId: player.id,
          overLabel: over,
          kind: event.kind,
          summary: `${player.shortName}: ${event.summary}`,
          simulated: true,
        },
      });
    }
  }
  await writePriceCache(JSON.stringify(await publicPricePayload()));
  return "simulation";
}
