import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  OWNER_ASSIGN_ERROR,
  OWNER_PROTECTED_ERROR,
  ownerAccountChangeDenied,
  staffChangeDenial,
  unsignedAdminRedirect,
} from "./admin-access";
import { permissionsFor } from "./permissions";
import { proxy } from "@/proxy";

describe("admin entry", () => {
  it("sends a signed-out visitor from any admin page to the admin login", () => {
    expect(unsignedAdminRedirect("/admin", false)).toBe("/admin/login");
    expect(unsignedAdminRedirect("/admin/operations/staff", false)).toBe("/admin/login");
    expect(unsignedAdminRedirect("/admin/login", false)).toBeNull();
    const response = proxy(new NextRequest("http://localhost:3001/admin/customers"));
    expect(response.headers.get("location")).toBe("http://localhost:3001/admin/login");
  });

  it("leaves a signed-in visitor on the admin login page for the server to route", () => {
    const request = new NextRequest("http://localhost:3001/admin/login", {
      headers: { cookie: "pp_session=present" },
    });
    expect(proxy(request).headers.get("location")).toBeNull();
  });
});

describe("owner protection", () => {
  it("gives the owner every operational permission and blocks owner changes", () => {
    expect(permissionsFor("OWNER")).toEqual(permissionsFor("SUPER_ADMIN"));
    expect(permissionsFor("OWNER")).toContain("staff.manage");
    expect(
      staffChangeDenial({
        actorUserId: "sam",
        actorRole: "SUPER_ADMIN",
        targetUserId: "floki",
        targetRole: "OWNER",
        nextRole: "SUPPORT",
        nextActive: true,
      }),
    ).toBe(OWNER_PROTECTED_ERROR);
    expect(
      staffChangeDenial({
        actorUserId: "sam",
        actorRole: "SUPER_ADMIN",
        targetUserId: "floki",
        targetRole: "OWNER",
        nextActive: false,
      }),
    ).toBe(OWNER_PROTECTED_ERROR);
    expect(
      staffChangeDenial({
        actorUserId: "sam",
        actorRole: "SUPER_ADMIN",
        targetUserId: "sam",
        targetRole: "SUPER_ADMIN",
        nextRole: "OWNER",
      }),
    ).toBe(OWNER_ASSIGN_ERROR);
    expect(ownerAccountChangeDenied("OWNER")).toBe(OWNER_PROTECTED_ERROR);
    expect(ownerAccountChangeDenied("SUPER_ADMIN")).toBeNull();
  });
});
