import { z } from "zod";
import { addTaxonomyValue, MEDIUM_ALIASES, SOURCE_ALIASES } from "@/domain/attribution";
import { requirePermission } from "@/server/access";
import { getUtmTaxonomy, saveUtmTaxonomy } from "@/server/attribution";
import { clientIp, writeAudit } from "@/server/audit";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";

const schema = z.object({
  source: z.string().optional(),
  medium: z.string().optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "utm.manage");
    const body = await readBody(request, schema);
    const before = await getUtmTaxonomy();
    const sources = body.source ? addTaxonomyValue(before.sources, body.source, SOURCE_ALIASES) : before.sources;
    const mediums = body.medium ? addTaxonomyValue(before.mediums, body.medium, MEDIUM_ALIASES) : before.mediums;
    await saveUtmTaxonomy(sources, mediums, user.id);
    await writeAudit({
      actorId: user.id,
      action: "utm.taxonomy",
      entityType: "AppSetting",
      entityId: "marketing.utmTaxonomy",
      before,
      after: { sources, mediums },
      ip: clientIp(request),
    });
    return json({ ok: true });
  });
}
