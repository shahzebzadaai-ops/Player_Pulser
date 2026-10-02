import type { Permission } from "./permissions";

export type NavItem = { label: string; href: string; permission?: Permission | Permission[] };
export type NavGroup = { label: string; items: NavItem[] };

export const ADMIN_GROUPS: NavGroup[] = [
  {
    label: "Market",
    items: [
      { label: "Players", href: "/admin/players", permission: "player.view" },
      { label: "Live Matches", href: "/admin/market/live", permission: "feed.view" },
      { label: "Price Control", href: "/admin/market/prices", permission: "player.edit" },
      { label: "Price Events", href: "/admin/market/events", permission: "player.view" },
      { label: "Risk & Exposure", href: "/admin/market/risk", permission: "risk.view" },
      { label: "Simulation preview", href: "/admin/market/pulse", permission: "player.view" },
    ],
  },
  {
    label: "Customers",
    items: [
      { label: "Users", href: "/admin/users", permission: "customer.view" },
      { label: "CRM", href: "/admin/customers/crm", permission: "crm.view" },
      { label: "Segments", href: "/admin/customers/segments", permission: "crm.view" },
      { label: "Call Tasks", href: "/admin/customers/tasks", permission: "task.manage" },
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Wallets", href: "/admin/wallets", permission: "wallet.view" },
      { label: "Deposits", href: "/admin/payments?kind=DEPOSIT", permission: "deposit.view" },
      { label: "Withdrawals", href: "/admin/money/withdrawals", permission: "withdrawal.view" },
      { label: "Trades", href: "/admin/trades", permission: "report.view" },
      { label: "Reconciliation", href: "/admin/payments", permission: "deposit.view" },
      { label: "Banking Gateways", href: "/admin/money/gateways/banking", permission: "settings.manage" },
      { label: "Crypto Gateways", href: "/admin/money/gateways/crypto", permission: "settings.manage" },
    ],
  },
  {
    label: "Promotions",
    items: [
      { label: "Bonuses", href: "/admin/bonuses", permission: "bonus.view" },
      { label: "Loyalty", href: "/admin/promotions/loyalty", permission: "bonus.view" },
      { label: "Referrals", href: "/admin/promotions/referrals", permission: "crm.view" },
      { label: "Campaigns", href: "/admin/promotions/campaigns", permission: ["bonus.view", "content.manage"] },
    ],
  },
  {
    label: "Marketing",
    items: [
      { label: "Attribution", href: "/admin/marketing/attribution", permission: ["analytics.view", "marketing.view"] },
      { label: "UTM Builder", href: "/admin/marketing/utm", permission: ["utm.view", "marketing.view"] },
      { label: "Campaign Links", href: "/admin/marketing/links", permission: ["utm.view", "marketing.view"] },
      { label: "Traffic Sources", href: "/admin/marketing/sources", permission: ["analytics.view", "marketing.view"] },
      { label: "Funnel", href: "/admin/marketing/funnel", permission: ["analytics.view", "marketing.view"] },
      { label: "Audience Export", href: "/admin/marketing/export", permission: "audience.export" },
    ],
  },
  {
    label: "Content",
    items: [
      { label: "Banners", href: "/admin/content/banners", permission: "banner.view" },
      { label: "Announcements", href: "/admin/content/announcements", permission: "content.manage" },
      { label: "Media Library", href: "/admin/content/media", permission: "content.manage" },
      { label: "SEO", href: "/admin/content/seo", permission: "content.manage" },
    ],
  },
  {
    label: "Communication",
    items: [
      { label: "WhatsApp", href: "/admin/communication/whatsapp", permission: "content.manage" },
      { label: "Push", href: "/admin/communication/push", permission: "content.manage" },
    ],
  },
  {
    label: "Reporting",
    items: [
      { label: "Revenue", href: "/admin/reporting/revenue", permission: "report.view" },
      { label: "Player Performance", href: "/admin/reporting/players", permission: "report.view" },
      { label: "Bonus Analytics", href: "/admin/reporting/bonuses", permission: "report.view" },
      { label: "Retention", href: "/admin/reporting/retention", permission: "report.view" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Staff", href: "/admin/operations/staff", permission: "staff.manage" },
      { label: "Roles & Permissions", href: "/admin/operations/roles", permission: "staff.manage" },
      { label: "Audit Log", href: "/admin/operations/audit", permission: "audit.view" },
      { label: "Feature Controls", href: "/admin/operations/features", permission: "feature.manage" },
      { label: "System Health", href: "/admin/operations/health", permission: "settings.view" },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Trading", href: "/admin/settings/trading", permission: "settings.view" },
      { label: "Wallet", href: "/admin/settings/wallet", permission: "settings.view" },
      { label: "Payments", href: "/admin/settings/payments", permission: "settings.view" },
      { label: "Brand", href: "/admin/settings/brand", permission: "content.manage" },
      { label: "General", href: "/admin/settings", permission: "settings.view" },
    ],
  },
];

export function canSee(permission: Permission | Permission[] | undefined, allowed: ReadonlySet<Permission>): boolean {
  if (!permission) return true;
  const required = Array.isArray(permission) ? permission : [permission];
  return required.some((item) => allowed.has(item));
}

export function visibleAdminGroups(permissions: readonly Permission[]): NavGroup[] {
  const allowed = new Set(permissions);
  return ADMIN_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSee(item.permission, allowed)),
  })).filter((group) => group.items.length > 0);
}

export function navItemActive(pathname: string, href: string): boolean {
  const path = href.split("?")[0] ?? href;
  if (path === "/admin") return pathname === "/admin";
  if (path === "/admin/settings") return pathname === "/admin/settings";
  if (path === "/admin/payments") return pathname === "/admin/payments" && !href.includes("?");
  if (href.includes("?")) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function activeAdminGroup(pathname: string, groups: NavGroup[] = ADMIN_GROUPS): string | null {
  for (const group of groups) {
    if (group.items.some((item) => navItemActive(pathname, item.href))) return group.label;
  }
  return null;
}
