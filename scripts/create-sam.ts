import { OWNER_ROLE } from "../src/domain/permissions";
import { SAM_DISPLAY_NAME, SAM_USERNAME } from "../src/domain/admin-access";
import { normalizeUsername } from "../src/domain/username";
import { assertAdminPassword, readSecret } from "./admin-secret";

async function main() {
  if (process.argv.includes("--owner") || process.env.ADMIN_SAM_ROLE === "OWNER") {
    throw new Error("Sam cannot be created as owner.");
  }
  const username = normalizeUsername(SAM_USERNAME);
  if (!username) throw new Error("Sam's username is not valid.");
  const password = await readSecret("Sam password: ", process.env.SAM_PASSWORD);
  assertAdminPassword(password);

  const { prisma } = await import("../src/server/prisma");
  const { hashPassword } = await import("../src/server/auth");
  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findFirst({
    where: { usernameNormalized: username },
    include: { staffAccount: true },
  });
  if (existing?.staffAccount?.staffRole === OWNER_ROLE) {
    throw new Error("This account is protected and cannot become a super admin.");
  }
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          displayName: SAM_DISPLAY_NAME,
          username: SAM_USERNAME,
          usernameNormalized: username,
          usernameCustomized: true,
          passwordHash,
          role: "ADMIN",
        },
      })
    : await prisma.user.create({
        data: {
          displayName: SAM_DISPLAY_NAME,
          username: SAM_USERNAME,
          usernameNormalized: username,
          usernameCustomized: true,
          passwordHash,
          role: "ADMIN",
          signupMethod: "PASSWORD",
          accountStatus: "PROFILE_COMPLETE",
        },
      });
  await prisma.staffAccount.upsert({
    where: { userId: user.id },
    create: { userId: user.id, staffRole: "SUPER_ADMIN", active: true },
    update: { staffRole: "SUPER_ADMIN", active: true },
  });
  await prisma.$disconnect();
  console.log("Sam super admin ready.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Could not save the super admin account.";
  console.error(message);
  process.exit(1);
});
