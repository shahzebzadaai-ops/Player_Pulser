import { z } from "zod";
import { AppError } from "@/domain/errors";
import { hasPermission } from "@/domain/permissions";
import { loadStaffAccess } from "@/server/access";
import { clientIp, writeAudit } from "@/server/audit";
import { assertFeatureEnabled } from "@/server/features";
import { assertSameOrigin, handle, json, readBody, requireAdminUser } from "@/server/http";
import { prisma } from "@/server/prisma";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(120),
  channel: z.enum(["WHATSAPP", "PUSH", "IN_APP"]),
  status: z.enum(["DRAFT", "DISABLED"]),
  body: z.string().max(1000),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireAdminUser(request);
    const access = await loadStaffAccess(user.id);
    if (!access.active || (!hasPermission(access.staffRole, "bonus.create") && !hasPermission(access.staffRole, "content.manage"))) {
      throw new AppError("FORBIDDEN", "You do not have permission for this action.", 403);
    }
    const body = await readBody(request, schema);
    const ip = clientIp(request);
    if (!body.id && body.channel === "WHATSAPP") await assertFeatureEnabled("whatsappEnabled");
    if (!body.id && body.channel === "PUSH") await assertFeatureEnabled("pushEnabled");
    if (body.id) {
      const current = await prisma.campaign.findUnique({ where: { id: body.id } });
      if (!current) return json({ error: { code: "NOT_FOUND", message: "That campaign was not found." } }, 404);
      const campaign = await prisma.campaign.update({
        where: { id: body.id },
        data: { name: body.name.trim(), channel: body.channel, status: body.status, body: body.body, updatedById: user.id },
      });
      await writeAudit({
        actorId: user.id,
        action: "campaign.update",
        entityType: "Campaign",
        entityId: campaign.id,
        before: { name: current.name, status: current.status, body: current.body, channel: current.channel },
        after: { name: campaign.name, status: campaign.status, body: campaign.body, channel: campaign.channel },
        ip,
      });
      return json({ id: campaign.id });
    }
    const campaign = await prisma.campaign.create({
      data: {
        name: body.name.trim(),
        channel: body.channel,
        status: body.status,
        body: body.body,
        createdById: user.id,
        updatedById: user.id,
      },
    });
    await writeAudit({
      actorId: user.id,
      action: "campaign.create",
      entityType: "Campaign",
      entityId: campaign.id,
      after: { name: campaign.name, channel: campaign.channel, status: campaign.status },
      ip,
    });
    return json({ id: campaign.id });
  });
}
