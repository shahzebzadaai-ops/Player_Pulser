"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Permission } from "@/domain/permissions";
import { AdminNav } from "./admin-nav";

const COLLAPSED_KEY = "pp_admin_collapsed";

export function AdminFrame({
  permissions,
  role,
  children,
}: {
  permissions: Permission[];
  role: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(sessionStorage.getItem(COLLAPSED_KEY) === "1");
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    sessionStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
  }

  return (
    <div className={`min-h-dvh bg-pitch ${collapsed ? "md:grid md:grid-cols-[84px_1fr]" : "md:grid md:grid-cols-[280px_1fr]"}`}>
      <aside className="border-b border-line bg-pitch-2 px-3 py-4 md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 px-1">
          {collapsed ? <span className="px-2 text-sm font-bold">PP</span> : <div><p className="text-xs uppercase tracking-wide text-india">Operations</p><h1 className="text-lg font-bold">PlayerPulser</h1><p className="text-xs text-muted">{role}</p></div>}
          <button type="button" className="hidden h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-card md:flex" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? "»" : "«"}
          </button>
        </div>
        <div className="mt-4">
          <AdminNav permissions={permissions} collapsed={collapsed} />
        </div>
        <Link href="/home" className="press mt-4 inline-flex min-h-11 items-center px-3 text-sm text-muted" title="Customer app">
          {collapsed ? "App" : "Customer app"}
        </Link>
      </aside>
      <div className="px-4 py-5 md:px-8 md:py-6">{children}</div>
    </div>
  );
}
