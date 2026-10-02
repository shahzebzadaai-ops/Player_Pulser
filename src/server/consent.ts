import { currentPolicyVersion } from "@/domain/policy-versions";
import type { Tx } from "./prisma";

/** Append-only. A later version inserts new rows and leaves the old evidence in place. */
export async function recordPolicyAcceptance(
  tx: Tx,
  input: { userId: string; ip?: string | null; userAgent?: string | null },
): Promise<void> {
  const terms = currentPolicyVersion("TERMS");
  const privacy = currentPolicyVersion("PRIVACY");
  const shared = {
    userId: input.userId,
    termsVersion: terms,
    privacyVersion: privacy,
    ip: input.ip ?? null,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
  };
  await tx.policyAcceptance.create({ data: { ...shared, policyType: "TERMS", version: terms } });
  await tx.policyAcceptance.create({ data: { ...shared, policyType: "PRIVACY", version: privacy } });
}
