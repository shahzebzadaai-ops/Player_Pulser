"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { visibleAuthParts } from "@/domain/auth-surface";
import { AuthSheet } from "./auth-sheet";

type Flags = {
  googleEnabled: boolean;
  phoneOtpEnabled: boolean;
  emailOtpEnabled: boolean;
  legacyPasswordEnabled: boolean;
};

export function AuthOverlay({ flags }: { flags: Flags }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const mode = params.get("auth");
  const open = (mode === "login" || mode === "signup") && !pathname.startsWith("/admin") && !pathname.startsWith("/dev");
  if (!open || !visibleAuthParts(true).includes("sheet")) return null;
  const notice = params.get("link") === "1"
    ? "This Google account matches an existing email. Sign in with your current method to link it."
    : params.get("error") === "demo"
      ? "That Google account cannot be used here."
      : params.get("error") === "google"
        ? "We couldn't sign you in. Please try again."
        : null;

  function close() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.replace("/");
  }

  function switchMode(next: "login" | "signup") {
    const query = new URLSearchParams(params.toString());
    query.set("auth", next);
    query.delete("profile");
    router.replace(`${pathname}?${query.toString()}`);
  }

  return (
    <AuthSheet
      mode={mode}
      flags={flags}
      open
      notice={notice}
      initialStep={params.get("profile") === "1" ? "profile" : params.get("passkey") === "1" ? "passkey" : undefined}
      onClose={close}
      onSwitchMode={switchMode}
    />
  );
}