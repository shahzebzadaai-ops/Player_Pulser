import { applyPriceFactorFlags } from "@/domain/pricing";
import {
  initialShowcaseState,
  MAJOR_PLAYER_SLUGS,
  SHOWCASE_SOURCE,
  showcasePricingActive,
  stepShowcase,
  type ShowcaseState,
} from "@/domain/showcase-market";
import { getFeatureFlags } from "./features";
import { applyPendingPricing } from "./pricing";
import { prisma } from "./prisma";
import { publishPriceUpdate } from "./realtime";
import { onMidPricePersisted } from "./risk";
import { writePriceCache } from "./redis";
import { publicPricePayload } from "./queries";
import { getSettings } from "./settings";

const showcaseStates = new Map<string, ShowcaseState>();

export async function maintainPrices(): Promise<"event-driven" | "showcase" | "idle"> {
  const settings = await getSettings();
  if (!showcasePricingActive(settings)) {
    if (settings.pricingMode === "paused") return "idle";
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
    const reference = player.referenceMidPaise;
    const current = latest?.midPaise ?? player.midPricePaise ?? reference;
    const state = showcaseStates.get(player.id) ?? initialShowcaseState(player.slug, reference);
    const day = await prisma.priceTick.aggregate({
      where: { playerId: player.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      _max: { midPaise: true },
      _min: { midPaise: true },
    });
    const factors = applyPriceFactorFlags(
      {
        performance: (Math.random() * 2 - 1) * (player.liveMatch ? 0.8 : 0.25),
        demand: Math.random() * 2 - 1,
        news: (Math.random() * 2 - 1) * 0.4,
      },
      flags,
    );
    const tick = stepShowcase({
      midPaise: current,
      referencePaise: reference,
      highPaise: day._max.midPaise ?? current,
      lowPaise: day._min.midPaise ?? current,
      state,
      performance: factors.performance,
      demand: factors.demand,
      news: factors.news,
      major: MAJOR_PLAYER_SLUGS.has(player.slug),
      random: Math.random,
      rangeTarget: settings.showcaseRangeTarget,
      volatilityScale: settings.showcaseVolatility,
    });
    showcaseStates.set(player.id, tick.state);
    if (!tick.moved) continue;
    const stored = await prisma.priceTick.create({
      data: {
        playerId: player.id,
        midPaise: tick.midPaise,
        previousMidPaise: current,
        source: SHOWCASE_SOURCE,
        performance: tick.performance,
        demand: tick.demand,
        news: tick.news,
        performanceBps: tick.performanceBps,
        demandBps: tick.demandBps,
        newsBps: tick.newsBps,
        reason: "Showcase market",
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
      await onMidPricePersisted(player.id, current, tick.midPaise);
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        message: error instanceof Error ? error.message : "risk evaluation failed",
        at: new Date().toISOString(),
      }));
    }
  }
  await writePriceCache(JSON.stringify(await publicPricePayload()));
  return "showcase";
}
