import { z } from "zod";
import { addTaxonomyValue, buildCampaignUrl } from "@/domain/attribution";
import { AppError } from "@/domain/errors";
import { requirePermission } from "@/server/access";
import { getUtmTaxonomy, saveUtmTaxonomy } from "@/server/attribution";
import { clientIp, writeAudit } from "@/server/audit";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { prisma } from "@/server/prisma";

const schema = z.object({
  id: z.string().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
  name: z.string().min(2).max(80).optional(),
  destination: z.string().optional(),
  source: z.string().optional(),
  medium: z.string().optional(),
  campaign: z.string().optional(),
  content: z.string().optional(),
  term: z.string().optional(),
  adSet: z.string().max(80).optional(),
  adName: z.string().max(80).optional(),
  creativeName: z.string().max(80).optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "utm.manage");
    const body = await readBody(request, schema);
    if (body.id && body.status) {
      const before = await prisma.campaignLink.findUnique({ where: { id: body.id } });
      const link = await prisma.campaignLink.update({ where: { id: body.id }, data: { status: body.status } });
      await writeAudit({
        actorId: user.id,
        action: "campaign_link.status",
        entityType: "CampaignLink",
        entityId: link.id,
        before: { status: before?.status },
        after: { status: link.status },
        ip: clientIp(request),
      });
      return json({ id: link.id });
    }
    const origin = new URL(request.url).origin;
    const built = buildCampaignUrl({
      origin,
      destination: body.destination ?? "",
      source: body.source ?? "",
      medium: body.medium ?? "",
      campaign: body.campaign ?? "",
      content: body.content,
      term: body.term,
    });
    if ("error" in built) throw new AppError("INVALID", built.error, 400);
    const link = await prisma.campaignLink.create({
      data: {
        name: body.name ?? built.values.campaign ?? "Campaign",
        destination: body.destination?.trim() || "/",
        utmSource: built.values.source ?? "",
        utmMedium: built.values.medium ?? "",
        utmCampaign: built.values.campaign ?? "",
        utmContent: built.values.content,
        utmTerm: built.values.term,
        adSet: body.adSet?.trim() || null,
        adName: body.adName?.trim() || null,
        creativeName: body.creativeName?.trim() || null,
        notes: body.notes?.trim() ?? "",
        createdById: user.id,
      },
    });
    const taxonomy = await getUtmTaxonomy();
    const sources = addTaxonomyValue(taxonomy.sources, built.values.source ?? "", {});
    const mediums = addTaxonomyValue(taxonomy.mediums, built.values.medium ?? "", {});
    if (sources.length !== taxonomy.sources.length || mediums.length !== taxonomy.mediums.length) {
      await saveUtmTaxonomy(sources, mediums, user.id);
      await writeAudit({
        actorId: user.id,
        action: "utm.taxonomy",
        entityType: "AppSetting",
        entityId: "marketing.utmTaxonomy",
        before: taxonomy,
        after: { sources, mediums },
        ip: clientIp(request),
      });
    }
    await writeAudit({
      actorId: user.id,
      action: "campaign_link.create",
      entityType: "CampaignLink",
      entityId: link.id,
      after: { name: link.name, utmSource: link.utmSource, utmCampaign: link.utmCampaign },
      ip: clientIp(request),
    });
    return json({ id: link.id });
  });
}
