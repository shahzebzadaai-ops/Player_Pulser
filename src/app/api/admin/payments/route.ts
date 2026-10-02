import { z } from "zod";
import { AppError } from "@/domain/errors";
import { hasPermission } from "@/domain/permissions";
import { requirePermission } from "@/server/access";
import { clientIp, requireReason, writeAudit } from "@/server/audit";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { reconcilePayment } from "@/server/payments";
import { prisma } from "@/server/prisma";

const schema = z.object({ paymentId: z.string(), reason: z.string().optional() });

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readBody(request, schema);
    const current = await prisma.payment.findUnique({ where: { id: body.paymentId } });
    if (!current) throw new AppError("NOT_FOUND", "That payment was not found.", 404);
    const permission = current.kind === "PAYOUT" ? "withdrawal.manage" : "deposit.view";
    const { user, access } = await requirePermission(request, permission);
    if (
      current.kind === "DEPOSIT" &&
      !hasPermission(access.staffRole, "wallet.adjust") &&
      !hasPermission(access.staffRole, "settings.manage")
    ) {
      throw new AppError("FORBIDDEN", "You do not have permission for this action.", 403);
    }
    const reason = current.kind === "PAYOUT" ? requireReason(body.reason) : body.reason?.trim() || null;
    const payment = await reconcilePayment(body.paymentId, user.id);
    await writeAudit({
      actorId: user.id,
      action: current.kind === "PAYOUT" ? "withdrawal.intervention" : "payment.reconcile",
      entityType: "Payment",
      entityId: body.paymentId,
      before: { status: current.status },
      after: { status: payment.status },
      reason,
      ip: clientIp(request),
    });
    return json(payment);
  });
}
