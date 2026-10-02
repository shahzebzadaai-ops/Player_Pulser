import { z } from "zod";
import { AppError } from "@/domain/errors";
import { requirePermission } from "@/server/access";
import { clientIp, writeAudit } from "@/server/audit";
import { noteReferralCreated } from "@/server/attribution";
import { assertFeatureEnabled } from "@/server/features";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { prisma } from "@/server/prisma";

const schema = z.object({
  userId: z.string(),
  code: z.string().min(4).max(24).regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, _ or -."),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "crm.manage");
    await assertFeatureEnabled("referralsEnabled");
    const body = await readBody(request, schema);
    const code = await prisma.referralCode.create({
      data: { userId: body.userId, code: body.code.trim(), createdById: user.id },
    });
    await writeAudit({
      actorId: user.id,
      action: "referral.create",
      entityType: "ReferralCode",
      entityId: code.id,
      after: { code: code.code, userId: code.userId },
      ip: clientIp(request),
    });
    await noteReferralCreated(body.userId, code.id);
    return json({ id: code.id });
  });
}
