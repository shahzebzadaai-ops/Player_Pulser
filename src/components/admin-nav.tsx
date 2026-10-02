"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { activeAdminGroup, navItemActive, visibleAdminGroups } from "@/domain/admin-nav";
import type { Permission } from "@/domain/permissions";

const OPEN_KEY = "pp_admin_section";

export function AdminNav({ permissions, collapsed }: { permissions: Permission[]; collapsed: boolean }) {
  const pathname = usePathname();
  const groups = visibleAdminGroups(permissions);
  const current = activeAdminGroup(pathname, groups);
  const [open, setOpen] = useState<string | null>(current);
  const overview = pathname === "/admin";

  useEffect(() => {
    const stored = sessionStorage.getItem(OPEN_KEY);
    setOpen(current ?? stored);
  }, [current]);

  function toggle(label: string) {
    const next = open === label ? null : label;
    setOpen(next);
    if (next) sessionStorage.setItem(OPEN_KEY, next);
    else sessionStorage.removeItem(OPEN_KEY);
  }

  return (
    <nav className="space-y-1" aria-label="Admin">
      <Link
        href="/admin"
        title="Overview"
        aria-current={overview ? "page" : undefined}
        className={`press flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm ${overview ? "bg-india text-white" : "text-ink hover:bg-card"}`}
      >
        <NavIcon name="Overview" active={overview} />
        {collapsed ? <span className="sr-only">Overview</span> : "Overview"}
      </Link>
      {groups.map((group) => {
        const expanded = open === group.label;
        return (
          <div key={group.label}>
            <button
              type="button"
              className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm ${current === group.label ? "bg-india text-white" : "text-muted hover:bg-card"}`}
              aria-expanded={expanded}
              title={group.label}
              onClick={() => toggle(group.label)}
            >
              <NavIcon name={group.label} active={current === group.label} />
              {collapsed ? <span className="sr-only">{group.label}</span> : <span className="flex-1 font-medium">{group.label}</span>}
              {collapsed ? null : (
                <svg viewBox="0 0 20 20" className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} aria-hidden="true">
                  <path d="M7 5l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              )}
            </button>
            {expanded && !collapsed ? (
              <div className="ml-4 space-y-0.5 border-l border-line pl-2">
                {group.items.map((item) => {
                  const on = navItemActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={on ? "page" : undefined}
                      className={`press flex min-h-10 items-center rounded-lg px-3 text-sm ${on ? "bg-india text-white" : "text-ink hover:bg-card"}`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

const ICONS: Record<string, string> = {
  Overview: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  Market: "M4 16l5-6 4 3 7-8",
  Customers: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 18c.5-2.5 2.4-4 5-4s4.5 1.5 5 4M16 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM16 10c2 0 3.8 1 4.5 3",
  Money: "M3 7h18v10H3zM3 10h18M7 14h4",
  Promotions: "M4 10h16v8H4zM12 10v8M4 13c2-2 4-2 6 0 2-2 4-2 6 0",
  Marketing: "M4 10v4l12 5V5zM16 9.5a4 4 0 0 1 0 5",
  Content: "M4 6h16v12H4zM8 6l2-3h4l2 3",
  Communication: "M4 6h16v9H7l-3 3z",
  Reporting: "M5 16V9M10 16V5M15 16v-6M20 16V8",
  Operations: "M12 4v2M12 18v2M4 12H2M22 12h-2M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18",
  Settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 3v2M12 19v2M3 12h2M19 12h2",
};

function NavIcon({ name, active }: { name: string; active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-india"}`} aria-hidden="true">
      <path d={ICONS[name] ?? ICONS.Overview} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
