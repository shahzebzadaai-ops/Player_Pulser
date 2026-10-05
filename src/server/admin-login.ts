import { AppError } from "@/domain/errors";
import { ADMIN_LOGIN_ERROR } from "@/domain/admin-access";
import { isInvestorDemoIdentity } from "@/domain/investor-demo";
import { normalizeUsername } from "@/domain/username";
import { clientIp, writeAudit } from "./audit";
import { verifyPassword } from "./auth";
import { prisma } from "./prisma";
import { assertDurableRate } from "./rate-limit";

const DUMMY_PASSWORD_HASH = `scrypt$${ "ab".repeat(16) }$${ "cd".repeat(32) }`;

export async function loginAdmin(username: string, password: string, request: Request) {
  const ip = clientIp(request);
  const normalized = normalizeUsername(username);
  await assertDurableRate("admin-login", `${ip ?? "unknown"}:${normalized ?? "invalid"}`, 15 * 60_000, 8);
  const user = normalized
    ? await prisma.user.findFirst({
        where: { usernameNormalized: normalized },
        include: { staffAccount: true },
      })
    : null;
  const hash = user?.passwordHash || DUMMY_PASSWORD_HASH;
  const passwordMatches = await verifyPassword(password, hash);
  const allowed =
    passwordMatches &&
    Boolean(user?.passwordHash) &&
    user?.role === "ADMIN" &&
    Boolean(user.staffAccount?.active) &&
    !isInvestorDemoIdentity(user);
  if (!user || !allowed) {
    await writeAudit({
      action: "admin.login.failed",
      entityType: "User",
      entityId: user?.id ?? null,
      metadata: { username: normalized ?? "invalid" },
      ip,
    });
    throw new AppError("INVALID_LOGIN", ADMIN_LOGIN_ERROR, 401);
  }
  await writeAudit({
    actorId: user.id,
    action: "admin.login",
    entityType: "User",
    entityId: user.id,
    metadata: { staffRole: user.staffAccount?.staffRole ?? null },
    ip,
  });
  return user;
}
