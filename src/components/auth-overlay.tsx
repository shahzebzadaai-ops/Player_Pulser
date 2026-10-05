"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { authSheetOpen, visibleAuthParts, withoutAuthMode, withAuthMode } from "@/domain/auth-surface";
import { AuthSheet } from "./auth-sheet";

type Flags = {
  googleEnabled: boolean;
  appleEnabled: boolean;
  googleSetupMessage: string | null;
  appleSetupMessage: string | null;
  phoneOtpEnabled: boolean;
  emailOtpEnabled: boolean;
  legacyPasswordEnabled: boolean;
};

export function AuthOverlay({ flags }: { flags: Flags }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const mode = params.get("auth");
  const open = authSheetOpen(pathname, params.toString()) && (mode === "login" || mode === "signup");
  if (!open || !visibleAuthParts(open).includes("sheet")) return null;
  const notice = params.get("link") === "1"
    ? "This Google account matches an existing email. Sign in with your current method to link it."
    : params.get("link") === "apple"
      ? "This Apple account matches an existing email. Sign in with your current method to link it."
    : params.get("error") === "demo"
      ? "That account cannot be used here."
    : params.get("error") === "cancelled"
      ? "Sign-in was cancelled."
      : params.get("error") === "google" || params.get("error") === "apple"
        ? "We couldn't sign you in. Please try again."
        : null;

  function close() {
    router.replace(withoutAuthMode(`${pathname}?${params.toString()}`));
  }

  function switchMode(next: "login" | "signup") {
    router.replace(withAuthMode(`${pathname}?${params.toString()}`, next));
  }

  return (
    <AuthSheet
      mode={mode}
      flags={flags}
      open
      notice={notice}
      initialStep={params.get("passkey") === "1" ? "passkey" : params.get("google") === "1" ? "google" : params.get("apple") === "1" ? "apple" : params.get("profile") === "1" ? "profile" : undefined}
      onClose={close}
      onSwitchMode={switchMode}
    />
  );
}