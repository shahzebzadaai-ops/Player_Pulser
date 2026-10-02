import { z } from "zod";
import { AppError } from "@/domain/errors";
import { requirePermission } from "@/server/access";
import { clientIp, requireReason, writeAudit } from "@/server/audit";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { prisma } from "@/server/prisma";

const schema = z.object({
  paymentId: z.string(),
  reason: z.string(),
  note: z.string().max(500).optional().default(""),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "withdrawal.manage");
    const body = await readBody(request, schema);
    const reason = requireReason(body.reason);
    const payment = await prisma.payment.findUnique({ where: { id: body.paymentId } });
    if (!payment || payment.kind !== "PAYOUT") throw new AppError("NOT_FOUND", "That withdrawal was not found.", 404);
    await prisma.staffTask.create({
      data: {
        title: `Withdrawal review ${payment.id.slice(-6)}`,
        type: "WITHDRAWAL_REVIEW",
        customerId: payment.userId,
        assignedToId: user.id,
        createdById: user.id,
        priority: "HIGH",
        notes: body.note || reason,
        status: "OPEN",
      },
    });
    await writeAudit({
      actorId: user.id,
      action: "withdrawal.intervention",
      entityType: "Payment",
      entityId: payment.id,
      before: { status: payment.status },
      after: { status: payment.status, task: "WITHDRAWAL_REVIEW" },
      reason,
      ip: clientIp(request),
    });
    return json({ ok: true });
  });
}
