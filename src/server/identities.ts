import type { AuthProvider } from "@prisma/client";
import { AppError } from "@/domain/errors";
import type { Tx } from "./prisma";

export async function attachIdentity(
  tx: Tx,
  input: {
    userId: string;
    provider: AuthProvider;
    providerAccountId: string;
    normalizedPhone?: string | null;
    normalizedEmail?: string | null;
    verifiedAt: Date | null;
  },
) {
  const existing = await tx.authIdentity.findUnique({
    where: { provider_providerAccountId: { provider: input.provider, providerAccountId: input.providerAccountId } },
  });
  if (existing) {
    if (existing.userId !== input.userId) throw new AppError("EXISTS", "That identity is already connected to another account.", 409);
    if (input.verifiedAt && !existing.verifiedAt) {
      return tx.authIdentity.update({ where: { id: existing.id }, data: { verifiedAt: input.verifiedAt } });
    }
    return existing;
  }
  return tx.authIdentity.create({
    data: {
      userId: input.userId,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      normalizedPhone: input.normalizedPhone ?? null,
      normalizedEmail: input.normalizedEmail ?? null,
      verifiedAt: input.verifiedAt,
    },
  });
}
