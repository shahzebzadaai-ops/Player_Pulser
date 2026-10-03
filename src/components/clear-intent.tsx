"use client";

import { useEffect } from "react";

export function ClearIntent() {
  useEffect(() => {
    void fetch("/api/auth/intent", { method: "DELETE", keepalive: true });
  }, []);
  return null;
}
