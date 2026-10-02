import { z } from "zod";
import { FEATURE_KEYS, isHighImpactFeature, type FeatureKey } from "@/domain/features";
import { requirePermission } from "@/server/access";
import { clientIp, requireReason, writeAudit } from "@/server/audit";
import { featureSettingKey, getFeatureFlags, invalidateFeatureFlags } from "@/server/features";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { prisma } from "@/server/prisma";

const schema = z.object({
  key: z.enum(FEATURE_KEYS),
  enabled: z.boolean(),
  reason: z.string().optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "feature.manage");
    const body = await readBody(request, schema);
    const reason = isHighImpactFeature(body.key) ? requireReason(body.reason) : body.reason?.trim() || null;
    const before = await getFeatureFlags();
    const key = featureSettingKey(body.key as FeatureKey);
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: body.enabled, updatedBy: user.id },
      update: { value: body.enabled, updatedBy: user.id },
    });
    invalidateFeatureFlags();
    await writeAudit({
      actorId: user.id,
      action: "feature.toggle",
      entityType: "AppSetting",
      entityId: key,
      before: { enabled: before[body.key] },
      after: { enabled: body.enabled },
      reason,
      ip: clientIp(request),
    });
    return json({ ok: true });
  });
}
