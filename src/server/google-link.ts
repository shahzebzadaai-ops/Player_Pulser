import { Prisma } from "@prisma/client";
import { AppError } from "@/domain/errors";
import { normalizeEmail } from "@/domain/identities";
import { isInvestorDemoIdentity } from "@/domain/investor-demo";
import { clearGoogleLink, currentGoogleLink } from "./intent-cookie";
import { attachIdentity } from "./identities";
import { prisma } from "./prisma";

export async function consumeGoogleLink(userId: string): Promise<boolean> {
  const link = await currentGoogleLink();
  if (!link) return false;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || isInvestorDemoIdentity(user)) {
    await clearGoogleLink();
    return false;
  }
  if (normalizeEmail(user.email) !== link.email) return false;
  try {
    await attachIdentity(prisma, {
      userId,
      provider: "GOOGLE",
      providerAccountId: link.sub,
      normalizedEmail: link.email,
      verifiedAt: new Date(),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    if (error instanceof AppError) return false;
    throw error;
  }
  await clearGoogleLink();
  return true;
}
