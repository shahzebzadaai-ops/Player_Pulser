import { OWNER_DISPLAY_NAME, OWNER_USERNAME, OWNER_USERNAME_NORMALIZED } from "../src/domain/admin-access";
import { assertAdminPassword, readSecret } from "./admin-secret";

async function main() {
  const password = await readSecret("Owner password: ", process.env.FLOKI_PASSWORD);
  assertAdminPassword(password);

  const { prisma } = await import("../src/server/prisma");
  const { hashPassword } = await import("../src/server/auth");
  const passwordHash = await hashPassword(password);
  const existingOwner = await prisma.staffAccount.findFirst({
    where: { staffRole: "OWNER" },
    include: { user: true },
  });
  if (existingOwner && existingOwner.user.usernameNormalized !== OWNER_USERNAME_NORMALIZED) {
    throw new Error("An owner account already exists.");
  }
  const existing = await prisma.user.findFirst({ where: { usernameNormalized: OWNER_USERNAME_NORMALIZED } });
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          displayName: OWNER_DISPLAY_NAME,
          username: OWNER_USERNAME,
          usernameNormalized: OWNER_USERNAME_NORMALIZED,
          usernameCustomized: true,
          passwordHash,
          role: "ADMIN",
          signupMethod: existing.signupMethod ?? "PASSWORD",
        },
      })
    : await prisma.user.create({
        data: {
          displayName: OWNER_DISPLAY_NAME,
          username: OWNER_USERNAME,
          usernameNormalized: OWNER_USERNAME_NORMALIZED,
          usernameCustomized: true,
          passwordHash,
          role: "ADMIN",
          signupMethod: "PASSWORD",
          accountStatus: "PROFILE_COMPLETE",
        },
      });
  await prisma.staffAccount.upsert({
    where: { userId: user.id },
    create: { userId: user.id, staffRole: "OWNER", active: true },
    update: { staffRole: "OWNER", active: true },
  });
  await prisma.$disconnect();
  console.log("Owner account ready.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Could not save the owner account.";
  console.error(message);
  process.exit(1);
});
