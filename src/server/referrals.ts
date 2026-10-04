import { AppError } from "@/domain/errors";
import type { Tx } from "./prisma";

/** Records a valid optional referral. An unknown code is rejected and nothing is created. */
export async function rememberReferral(tx: Tx, userId: string, code: string | null | undefined): Promise<void> {
  const trimmed = code?.trim();
  if (!trimmed) return;
  const row = await tx.referralCode.findFirst({
    where: { code: { equals: trimmed, mode: "insensitive" }, active: true },
    select: { id: true },
  });
  if (!row) throw new AppError("INVALID", "That referral code was not recognised.", 400);
  await tx.analyticsEvent.create({
    data: {
      userId,
      eventName: "REFERRAL_APPLIED",
      dedupeKey: `referral-apply:${userId}`,
      metadata: { codeId: row.id },
    },
  });
}
