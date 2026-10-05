import { expect, test } from "vitest";
import { POST as loginPost } from "@/app/api/admin/login/route";
import { POST as staffPost } from "@/app/api/admin/staff/route";
import { POST as usersPost } from "@/app/api/admin/users/route";
import { ADMIN_LOGIN_ERROR, OWNER_ASSIGN_ERROR, OWNER_PROTECTED_ERROR, OWNER_USERNAME, OWNER_USERNAME_NORMALIZED, SAM_USERNAME } from "@/domain/admin-access";
import { INVESTOR_DEMO_EMAIL } from "@/domain/investor-demo";
import { loginAdmin } from "@/server/admin-login";
import { hashPassword, issueSession } from "@/server/auth";
import { loadStaffAccess } from "@/server/access";
import { prisma } from "@/server/prisma";

const password = "Harbour-Light-19";

function request(path: string, body: unknown, token?: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      host: "localhost",
      ...(token ? { cookie: `pp_session=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function removeUsername(username: string) {
  const user = await prisma.user.findFirst({ where: { usernameNormalized: username } });
  if (!user) return;
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: user.id }, { entityId: user.id }] } });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.staffAccount.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

test("admin username login and owner protection", async () => {
  await removeUsername(OWNER_USERNAME_NORMALIZED);
  await removeUsername(SAM_USERNAME);
  await prisma.user.deleteMany({ where: { email: INVESTOR_DEMO_EMAIL } });
  const passwordHash = await hashPassword(password);
  const floki = await prisma.user.create({
    data: {
      displayName: "Floki",
      username: OWNER_USERNAME,
      usernameNormalized: OWNER_USERNAME_NORMALIZED,
      usernameCustomized: true,
      passwordHash,
      role: "ADMIN",
      signupMethod: "PASSWORD",
      staffAccount: { create: { staffRole: "OWNER", active: true } },
    },
  });
  const sam = await prisma.user.create({
    data: {
      displayName: "Sam",
      username: SAM_USERNAME,
      usernameNormalized: SAM_USERNAME,
      usernameCustomized: true,
      passwordHash,
      role: "ADMIN",
      signupMethod: "PASSWORD",
      staffAccount: { create: { staffRole: "SUPER_ADMIN", active: true } },
    },
  });
  const customer = await prisma.user.create({
    data: {
      displayName: "Fan",
      username: "matchfan",
      usernameNormalized: "matchfan",
      usernameCustomized: true,
      passwordHash,
      role: "CUSTOMER",
      signupMethod: "PASSWORD",
    },
  });
  const demo = await prisma.user.create({
    data: { displayName: "Investor Demo", email: INVESTOR_DEMO_EMAIL, role: "CUSTOMER" },
  });

  try {
    const owner = await loginAdmin(OWNER_USERNAME, password, request("/api/admin/login", {}));
    expect(owner.id).toBe(floki.id);
    expect((await loadStaffAccess(owner.id)).staffRole).toBe("OWNER");
    expect((await loadStaffAccess(owner.id)).permissions).toContain("customer.view");

    const superAdmin = await loginAdmin("Sam", password, request("/api/admin/login", {}));
    expect(superAdmin.id).toBe(sam.id);
    const access = await loadStaffAccess(superAdmin.id);
    expect(access.staffRole).toBe("SUPER_ADMIN");
    expect(access.permissions).toEqual(expect.arrayContaining(["customer.view", "wallet.view", "staff.manage", "feature.manage", "settings.manage"]));

    const invalid = await loginPost(request("/api/admin/login", { username: OWNER_USERNAME, password: "wrong-password-19" }));
    const invalidBody = (await invalid.json()) as { error?: { message?: string } };
    expect(invalid.status).toBe(401);
    expect(invalidBody.error?.message).toBe(ADMIN_LOGIN_ERROR);
    expect(JSON.stringify(invalidBody)).not.toMatch(/prisma|sql|not found|floki/i);

    const missing = await loginPost(request("/api/admin/login", { username: "nobody-here", password: "wrong-password-19" }));
    expect(((await missing.json()) as { error?: { message?: string } }).error?.message).toBe(ADMIN_LOGIN_ERROR);

    const customerLogin = await loginPost(request("/api/admin/login", { username: "matchfan", password }));
    expect(((await customerLogin.json()) as { error?: { message?: string } }).error?.message).toBe(ADMIN_LOGIN_ERROR);

    const customerToken = (await issueSession(customer.id)).token;
    const customerStaff = await staffPost(request("/api/admin/staff", { action: "role", userId: floki.id, staffRole: "SUPPORT", active: true, reason: "customer attempt" }, customerToken));
    expect(customerStaff.status).toBe(403);

    const demoToken = (await issueSession(demo.id)).token;
    const demoStaff = await staffPost(request("/api/admin/staff", { action: "role", userId: floki.id, staffRole: "SUPPORT", active: true, reason: "demo attempt" }, demoToken));
    expect(demoStaff.status).toBe(403);

    const anonymous = await staffPost(request("/api/admin/staff", { action: "role", userId: floki.id, staffRole: "SUPPORT", active: true, reason: "signed out" }));
    expect(anonymous.status).toBe(401);

    const samToken = (await issueSession(sam.id)).token;
    const allowed = await staffPost(request("/api/admin/staff", { action: "role", userId: "missing-staff", staffRole: "SUPPORT", active: true, reason: "sam can open staff" }, samToken));
    expect(allowed.status).toBe(404);

    const demote = await staffPost(request("/api/admin/staff", { action: "role", userId: floki.id, staffRole: "SUPPORT", active: true, reason: "demote owner" }, samToken));
    expect(demote.status).toBe(403);
    expect(((await demote.json()) as { error: { message: string } }).error.message).toBe(OWNER_PROTECTED_ERROR);

    const disable = await staffPost(request("/api/admin/staff", { action: "role", userId: floki.id, staffRole: "OWNER", active: false, reason: "disable owner" }, samToken));
    expect(disable.status).toBe(403);

    const selfOwner = await staffPost(request("/api/admin/staff", { action: "role", userId: sam.id, staffRole: "OWNER", active: true, reason: "become owner" }, samToken));
    expect(selfOwner.status).toBe(403);
    expect(((await selfOwner.json()) as { error: { message: string } }).error.message).toBe(OWNER_ASSIGN_ERROR);

    const createOwner = await staffPost(request("/api/admin/staff", {
      action: "create",
      displayName: "Second",
      phone: "9000000099",
      password: "Harbour-Light-19",
      staffRole: "OWNER",
      reason: "second owner",
    }, samToken));
    expect(createOwner.status).toBe(403);

    const userDemote = await usersPost(request("/api/admin/users", { userId: floki.id, role: "CUSTOMER", reason: "remove owner" }, samToken));
    expect(userDemote.status).toBe(403);

    const protectedOwner = await prisma.staffAccount.findUniqueOrThrow({ where: { userId: floki.id } });
    expect(protectedOwner.staffRole).toBe("OWNER");
    expect(protectedOwner.active).toBe(true);
    const stillSam = await prisma.staffAccount.findUniqueOrThrow({ where: { userId: sam.id } });
    expect(stillSam.staffRole).toBe("SUPER_ADMIN");
  } finally {
    await removeUsername(OWNER_USERNAME_NORMALIZED);
    await removeUsername(SAM_USERNAME);
    await removeUsername("matchfan");
    await prisma.auditLog.deleteMany({ where: { actorId: demo.id } });
    await prisma.session.deleteMany({ where: { userId: demo.id } });
    await prisma.user.delete({ where: { id: demo.id } }).catch(() => undefined);
  }
});
