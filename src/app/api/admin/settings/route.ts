import { z } from "zod";
import { AppError } from "@/domain/errors";
import { requirePermission } from "@/server/access";
import { clientIp, requireReason, writeAudit } from "@/server/audit";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { prisma } from "@/server/prisma";
import { RISK_SETTING_KEYS } from "@/domain/risk";
import { queueRiskRefresh } from "@/server/risk";
import { invalidateSettingsCache, setRealSourcePricingEnabled, SETTING_DEFAULT_ROWS } from "@/server/settings";

const schema = z.object({
  key: z.string(),
  value: z.string(),
  reason: z.string().optional(),
});

const SENSITIVE = new Set([
  "spread.normalPpm",
  "spread.livePpm",
  "bonus.welcomePaise",
  "bonus.wageringMultiplier",
  "bonus.validityDays",
  "bonus.minQualifyingDepositPaise",
  "bonus.minCashPortionBps",
  "crm.highValueDepositThresholdPaise",
  "crm.churnRiskInactiveDays",
  "quote.ttlSeconds",
  "quote.ttlLiveSeconds",
  "pricing.engineMode",
  "pricing.marketMode",
  "pricing.showcaseRangeTarget",
  "pricing.showcaseVolatility",
  "pricing.performanceMatchCapBps",
  "pricing.circuitBreakerBps",
  "pricing.demandWindowSeconds",
  "pricing.demandMaxBps",
  "pricing.demandDayCapBps",
  "pricing.demandMinTrades",
  "pricing.newsEventCapBps",
  "feed.realSourcePricingEnabled",
  ...RISK_SETTING_KEYS,
]);

const KNOWN = new Set(SETTING_DEFAULT_ROWS.map((row) => row.key));

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "settings.manage");
    const body = await readBody(request, schema);
    if (!KNOWN.has(body.key) || body.key.startsWith("feature.") || body.key === "seo") {
      throw new AppError("INVALID", "That setting is not recognised.", 400);
    }
    if (body.key === "feed.realSourcePricingEnabled") {
      await setRealSourcePricingEnabled({
        enabled: body.value === "true",
        actorId: user.id,
        reason: body.reason ?? "",
        ip: clientIp(request),
      });
      return json({ ok: true });
    }
    const reason = SENSITIVE.has(body.key) ? requireReason(body.reason) : body.reason?.trim() || null;
    const numeric = !body.key.endsWith("Paise") && body.key !== "pricing.mode" && body.key !== "pricing.engineMode" && body.key !== "pricing.marketMode";
    const value = body.key === "pricing.mode"
      ? body.value === "paused" ? "paused" : "simulation"
      : body.key === "pricing.engineMode"
        ? body.value === "EVENT_DRIVEN" ? "EVENT_DRIVEN" : "SIMULATION"
      : body.key === "pricing.marketMode"
        ? body.value === "EVENT_DRIVEN" ? "EVENT_DRIVEN" : "SHOWCASE"
      : numeric
        ? Number(body.value)
        : body.value;
    if (numeric && !Number.isFinite(value as number)) throw new AppError("INVALID", "Enter a number.", 400);
    if (body.key.endsWith("Paise") && !/^\d+$/.test(body.value)) throw new AppError("INVALID", "Enter whole paise.", 400);
    const previous = await prisma.appSetting.findUnique({ where: { key: body.key } });
    await prisma.appSetting.upsert({
      where: { key: body.key },
      create: { key: body.key, value, updatedBy: user.id },
      update: { value, updatedBy: user.id },
    });
    const action = body.key.startsWith("spread.")
      ? "setting.spread"
      : body.key.startsWith("bonus.")
        ? "setting.bonus_rule"
        : body.key.startsWith("quote.") || body.key.startsWith("feed.") || body.key.startsWith("pricing.") || body.key.startsWith("trade.")
          ? "setting.trading"
          : "setting.update";
    await writeAudit({
      actorId: user.id,
      action,
      entityType: "AppSetting",
      entityId: body.key,
      before: { value: previous?.value ?? null },
      after: { value },
      reason,
      ip: clientIp(request),
    });
    invalidateSettingsCache();
    queueRiskRefresh(body.key);
    return json({ ok: true });
  });
}
