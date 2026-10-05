import { authFlags } from "@/domain/auth-flags";
import { appleSetupMessage, googleSetupMessage } from "@/domain/provider-setup";
import { devAuthAllowed } from "@/domain/phone";
import { AuthScreen } from "./auth-screen";
import { AuthSheet } from "./auth-sheet";

export function AuthGate({ mode, notice }: { mode: "login" | "signup"; notice?: string | null }) {
  const flags = authFlags();
  return (
    <main id="top" className="mx-auto min-h-dvh w-full max-w-[430px] px-4 py-6">
      <AuthSheet mode={mode} flags={{ ...flags, googleSetupMessage: googleSetupMessage(), appleSetupMessage: appleSetupMessage() }} open notice={notice} />
      {flags.legacyPasswordEnabled ? (
        <details className="rounded-2xl bg-card p-4">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Other sign-in options</summary>
          <AuthScreen mode={mode} devAuth={devAuthAllowed()} embedded />
        </details>
      ) : null}
    </main>
  );
}
