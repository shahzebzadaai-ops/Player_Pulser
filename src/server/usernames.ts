import type { Prisma, PrismaClient } from "@prisma/client";
import { temporaryUsername } from "@/domain/username";

export async function assignTemporaryUsername(db: Prisma.TransactionClient | PrismaClient, userId: string) {
  const username = temporaryUsername(userId);
  await db.user.update({
    where: { id: userId },
    data: { username, usernameNormalized: username, usernameCustomized: false },
  });
}