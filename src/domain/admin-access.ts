import { OWNER_ROLE } from "./permissions";

export const ADMIN_LOGIN_PATH = "/admin/login";
export const ADMIN_LOGIN_ERROR = "Invalid login details.";
export const OWNER_PROTECTED_ERROR = "The owner account is protected.";
export const OWNER_ASSIGN_ERROR = "Owner role cannot be assigned.";

export const OWNER_USERNAME = "11SHAHzeb22";
export const OWNER_USERNAME_NORMALIZED = "11shahzeb22";
export const OWNER_DISPLAY_NAME = "Floki";
export const SAM_USERNAME = "sam";
export const SAM_DISPLAY_NAME = "Sam";

export function unsignedAdminRedirect(pathname: string, signedIn: boolean): string | null {
  if (pathname === ADMIN_LOGIN_PATH || pathname.startsWith(`${ADMIN_LOGIN_PATH}/`)) return null;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!signedIn) return ADMIN_LOGIN_PATH;
  }
  return null;
}

export function staffChangeDenial(input: {
  actorUserId: string;
  actorRole: string;
  targetUserId: string;
  targetRole: string | null;
  nextRole?: string;
  nextActive?: boolean;
}): string | null {
  if (input.nextRole === OWNER_ROLE && input.targetRole !== OWNER_ROLE) return OWNER_ASSIGN_ERROR;
  if (input.actorUserId === input.targetUserId && input.nextRole === OWNER_ROLE && input.actorRole !== OWNER_ROLE) {
    return OWNER_ASSIGN_ERROR;
  }
  if (input.targetRole === OWNER_ROLE && (input.nextRole !== undefined || input.nextActive !== undefined)) {
    return OWNER_PROTECTED_ERROR;
  }
  return null;
}

export function ownerAccountChangeDenied(targetRole: string | null | undefined): string | null {
  if (targetRole === OWNER_ROLE) return OWNER_PROTECTED_ERROR;
  return null;
}

export function staffRoleLabel(role: string): string {
  if (role === "SUPER_ADMIN") return "SUPER ADMIN";
  if (role === OWNER_ROLE) return "OWNER";
  return role.replaceAll("_", " ");
}
