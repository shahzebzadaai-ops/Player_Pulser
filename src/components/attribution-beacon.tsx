"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { isTrackablePath } from "@/domain/attribution";

const sentPaths = new Set<string>();

export function AttributionBeacon() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (!isTrackablePath(pathname)) return;
    if (sentPaths.has(pathname)) return;
    sentPaths.add(pathname);
    void fetch("/api/attribution/collect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pathname, search: search.toString(), referrer: document.referrer }),
      keepalive: true,
    });
  }, [pathname, search]);

  return null;
}
