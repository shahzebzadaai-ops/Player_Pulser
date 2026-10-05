export const PERMISSIONS = [
  "banner.view",
  "banner.create",
  "banner.edit",
  "banner.publish",
  "player.view",
  "player.edit",
  "player.price_override",
  "customer.view",
  "customer.edit",
  "wallet.view",
  "wallet.adjust",
  "deposit.view",
  "withdrawal.view",
  "withdrawal.manage",
  "bonus.view",
  "bonus.create",
  "bonus.disable",
  "crm.view",
  "crm.manage",
  "report.view",
  "settings.view",
  "settings.manage",
  "staff.manage",
  "audit.view",
  "content.manage",
  "task.manage",
  "feature.manage",
  "marketing.view",
  "marketing.manage",
  "utm.view",
  "utm.manage",
  "analytics.view",
  "audience.export",
  "risk.view",
  "risk.manage",
  "risk.pause",
  "feed.view",
  "feed.manage",
  "feed.mapping_manage",
  "feed.source_manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const STAFF_ROLES = [
  "SUPER_ADMIN",
  "OPERATIONS_MANAGER",
  "FINANCE",
  "CRM_MANAGER",
  "CONTENT_MANAGER",
  "SUPPORT",
  "ANALYST",
  "VIP_MANAGER",
] as const;

export const OWNER_ROLE = "OWNER" as const;

export type StaffRoleName = (typeof STAFF_ROLES)[number] | typeof OWNER_ROLE;

export function isAssignableStaffRole(value: string): value is (typeof STAFF_ROLES)[number] {
  return (STAFF_ROLES as readonly string[]).includes(value);
}

const OPERATIONS: Permission[] = PERMISSIONS.filter(
  (permission) =>
    permission !== "staff.manage" &&
    permission !== "wallet.adjust" &&
    permission !== "risk.pause" &&
    permission !== "feed.source_manage",
);

export const ROLE_PERMISSIONS: Record<StaffRoleName, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  SUPER_ADMIN: PERMISSIONS,
  OPERATIONS_MANAGER: OPERATIONS,
  FINANCE: [
    "wallet.view",
    "wallet.adjust",
    "deposit.view",
    "withdrawal.view",
    "withdrawal.manage",
    "report.view",
    "audit.view",
    "customer.view",
    "bonus.view",
    "settings.view",
    "risk.view",
  ],
  CRM_MANAGER: [
    "customer.view",
    "customer.edit",
    "crm.view",
    "crm.manage",
    "task.manage",
    "report.view",
    "bonus.view",
    "marketing.view",
    "marketing.manage",
    "utm.view",
    "utm.manage",
    "analytics.view",
    "audience.export",
  ],
  CONTENT_MANAGER: ["banner.view", "banner.create", "banner.edit", "banner.publish", "content.manage", "player.view"],
  SUPPORT: ["customer.view", "crm.view", "task.manage", "wallet.view", "deposit.view", "withdrawal.view"],
  ANALYST: [
    "report.view",
    "audit.view",
    "player.view",
    "customer.view",
    "wallet.view",
    "deposit.view",
    "withdrawal.view",
    "bonus.view",
    "marketing.view",
    "utm.view",
    "analytics.view",
    "risk.view",
    "feed.view",
  ],
  VIP_MANAGER: ["customer.view", "customer.edit", "crm.view", "crm.manage", "task.manage", "bonus.view"],
};

export function isStaffRole(value: string): value is StaffRoleName {
  return value === OWNER_ROLE || isAssignableStaffRole(value);
}

export function permissionsFor(role: StaffRoleName): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasPermission(role: StaffRoleName, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
