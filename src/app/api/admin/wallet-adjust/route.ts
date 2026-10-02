import { randomUUID } from "crypto";
import { z } from "zod";
import { AppError } from "@/domain/errors";
import { requirePermission } from "@/server/access";
import { clientIp, requireReason, writeAudit } from "@/server/audit";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { accountBalance, postJournal, withUserLock } from "@/server/ledger";

const schema = z.object({
  userId: z.string(),
  direction: z.enum(["credit", "debit"]),
  rupees: z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter a rupee amount with at most 2 decimal places."),
  reason: z.string(),
});

function rupeesToPaise(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "wallet.adjust");
    const body = await readBody(request, schema);
    const reason = requireReason(body.reason);
    const amount = rupeesToPaise(body.rupees);
    if (amount < 100n) throw new AppError("INVALID", "The adjustment must be at least ₹1.", 400);
    const delta = body.direction === "credit" ? amount : -amount;
    const id = randomUUID();
    const ip = clientIp(request);
    await withUserLock(body.userId, async (tx) => {
      const before = await accountBalance(tx, body.userId, "USER_CASH");
      await postJournal(tx, {
        entryType: "ADMIN_ADJUSTMENT",
        description: `Manual adjustment: ${reason}`,
        referenceType: "AdminAdjustment",
        referenceId: id,
        lines: [
          { userId: body.userId, account: "USER_CASH", amountPaise: delta, lineKey: `adjust:${id}:USER_CASH` },
          { userId: null, account: "OFFSET_CASH", amountPaise: -delta, lineKey: `adjust:${id}:OFFSET_CASH` },
        ],
      });
      const after = await accountBalance(tx, body.userId, "USER_CASH");
      await writeAudit(
        {
          actorId: user.id,
          action: "wallet.adjust",
          entityType: "User",
          entityId: body.userId,
          before: { cashPaise: before.toString() },
          after: { cashPaise: after.toString(), deltaPaise: delta.toString() },
          reason,
          ip,
        },
        tx,
      );
    });
    return json({ ok: true });
  });
}
