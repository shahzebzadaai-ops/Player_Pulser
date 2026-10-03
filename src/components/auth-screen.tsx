"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "./visuals";

export function AuthScreen({ mode, devAuth }: { mode: "login" | "signup"; devAuth: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<"phone" | "email">("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [otp, setOtp] = useState<{ challengeId: string; devCode: string } | null>(null);
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [done, setDone] = useState<{ bonusStatus: string | null } | null>(null);

  useEffect(() => {
    if (mode !== "signup") return;
    void fetch("/api/analytics/funnel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventName: "SIGNUP_STARTED", dedupeKey: `signup-start:${new Date().toISOString().slice(0, 10)}` }),
    });
  }, [mode]);

  async function submitAccount(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const path = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        mode === "signup"
          ? { method: tab, phone, email, password, displayName: displayName || "Cricket Fan", acceptedTerms: agreed }
          : { identifier: tab === "phone" ? phone : email, password },
      ),
    });
    const body = (await response.json()) as { error?: { message: string }; bonusStatus?: string | null };
    setPending(false);
    if (!response.ok) {
      setMessage(body.error?.message ?? "That did not work.");
      return;
    }
    if (mode === "signup") {
      setDone({ bonusStatus: body.bonusStatus ?? null });
      return;
    }
    router.push("/home");
    router.refresh();
  }

  async function dev(phoneNumber: string) {
    const response = await fetch("/api/auth/dev-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: phoneNumber }),
    });
    if (!response.ok) {
      setMessage("Development login is not available.");
      return;
    }
    router.push("/home");
    router.refresh();
  }

  async function sendOtp() {
    const response = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const body = (await response.json()) as { challengeId?: string; devCode?: string; error?: { message: string } };
    if (!response.ok || !body.challengeId || !body.devCode) {
      setMessage(body.error?.message ?? "OTP is not available.");
      return;
    }
    setOtp({ challengeId: body.challengeId, devCode: body.devCode });
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    if (!otp) return;
    const response = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeId: otp.challengeId, code, acceptedTerms: agreed, displayName }),
    });
    const body = (await response.json()) as { error?: { message: string }; created?: boolean; bonusStatus?: string | null };
    if (!response.ok) {
      setMessage(body.error?.message ?? "That code was not accepted.");
      return;
    }
    if (body.created) {
      setDone({ bonusStatus: body.bonusStatus ?? null });
      return;
    }
    router.push("/home");
    router.refresh();
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[430px] px-4 py-6">
      <div className="mb-6 flex min-w-0 items-start justify-between gap-3">
        <Logo />
        <p className="max-w-28 text-right text-[11px] text-muted">India&apos;s first player trading platform</p>
      </div>
      {done ? (
        <section className="mt-6 rounded-3xl border border-line bg-card p-5">
          <h1 className="text-3xl font-bold">You&apos;re in.</h1>
          <p className="mt-2 text-sm">
            {done.bonusStatus === "ACTIVE" ? "₹200 Welcome Bonus added" : "Your account is ready. The welcome bonus is being checked."}
          </p>
          <Link href="/wallet/deposit" className="btn-primary mt-4 w-full">
            DEPOSIT NOW
          </Link>
          <Link href="/home" className="btn-secondary mt-2 w-full">
            EXPLORE PLAYERS
          </Link>
        </section>
      ) : null}
      {done ? null : <h1 className="text-[clamp(1.75rem,8vw,2.25rem)] font-bold leading-tight">
        {mode === "signup" ? "Create your PlayerPulser account" : "Log in"}
      </h1>}
      {done ? null : <p className="mt-2 text-sm text-muted">{mode === "signup" ? "Get ₹200 Welcome Bonus" : "Trade the pulse of cricket."}</p>}
      {mode === "signup" && !done ? (
        <section className="mt-4 rounded-3xl border border-india/40 bg-card p-4">
          <p className="text-xs font-semibold tracking-wide text-gain">WELCOME BONUS</p>
          <p className="mt-1 text-4xl font-bold text-gain">₹200</p>
          <p className="font-semibold">Welcome Bonus</p>
          <ul className="mt-3 grid gap-1 text-sm text-muted">
            <li>Use on any player</li>
            <li>Bonus must be paired with real cash</li>
            <li>14 day validity</li>
          </ul>
        </section>
      ) : null}
      {done ? null : <div className="mt-4 grid grid-cols-2 gap-2 rounded-full bg-card p-1">
        <button type="button" className={`min-h-11 rounded-full ${tab === "phone" ? "bg-india" : ""}`} onClick={() => setTab("phone")}>
          Mobile number
        </button>
        <button type="button" className={`min-h-11 rounded-full ${tab === "email" ? "bg-india" : ""}`} onClick={() => setTab("email")}>
          Email
        </button>
      </div>}
      {done ? null : <form onSubmit={submitAccount} className="mt-4 space-y-3">
        {tab === "phone" ? (
          <label className="block text-sm">
            Mobile number
            <span className="mt-1 flex overflow-hidden rounded-2xl border border-line bg-pitch">
              <span className="flex items-center px-3 text-muted">+91</span>
              <input className="min-h-12 w-full bg-transparent px-2 outline-none" inputMode="numeric" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Enter mobile number" />
            </span>
          </label>
        ) : (
          <label className="block text-sm">
            Email
            <input className="mt-1 min-h-12 w-full rounded-2xl border border-line bg-pitch px-3 outline-none" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@email.com" />
          </label>
        )}
        <label className="block text-sm">
          {mode === "signup" ? "Create a password" : "Password"}
          <span className="mt-1 flex rounded-2xl border border-line bg-pitch">
            <input className="min-h-12 w-full bg-transparent px-3 outline-none" type={show ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} />
            <button type="button" className="px-3 text-xs text-muted" onClick={() => setShow((value) => !value)}>
              {show ? "Hide" : "Show"}
            </button>
          </span>
        </label>
        {mode === "signup" ? (
          <>
            <label className="block text-sm">
              Display name
              <input className="mt-1 min-h-12 w-full rounded-2xl border border-line bg-pitch px-3" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Optional" />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
              <span>
                I agree to the <Link className="text-india" href="/terms" target="_blank">Terms of Use</Link> and <Link className="text-india" href="/privacy" target="_blank">Privacy Policy</Link>
              </span>
            </label>
            <p className="text-xs text-muted">We use security controls to protect your account and personal information.</p>
          </>
        ) : null}
        {message ? (
          <p role="alert" className="text-sm text-loss">
            {message}
          </p>
        ) : null}
        <button type="submit" disabled={pending || (mode === "signup" && !agreed)} className="btn-primary w-full text-base">
          {mode === "signup" ? "Create Account" : "Log in"}
        </button>
      </form>}
      {done ? null : <div className="my-4 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        OR
        <span className="h-px flex-1 bg-line" />
      </div>}
      {done ? null : otp ? (
        <form onSubmit={verifyOtp} className="space-y-2">
          <p className="rounded-xl bg-card p-3 text-sm">
            Development OTP: <strong className="num">{otp.devCode}</strong>. This code is shown only while development authentication is on.
          </p>
          <input className="min-h-12 w-full rounded-2xl border border-line bg-pitch px-3" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Enter the code" />
          <button className="btn-secondary w-full" type="submit" disabled={mode === "signup" && !agreed}>
            Verify code
          </button>
        </form>
      ) : (
        <button type="button" className="btn-secondary w-full" onClick={sendOtp}>
          Continue with OTP
        </button>
      )}
      {done || !devAuth ? null : (
        <section className="mt-4 rounded-2xl border border-dashed border-line p-3 text-sm">
          <p className="font-semibold">Development login</p>
          <p className="mt-1 text-muted">Passwordless entry for seeded accounts. It returns not found in production.</p>
          <div className="mt-2 grid gap-2">
            <button type="button" className="btn-secondary w-full" onClick={() => dev("9876543210")}>
              Continue as Cricket Fan
            </button>
            <button type="button" className="btn-secondary w-full" onClick={() => dev("9000000001")}>
              Continue as admin
            </button>
          </div>
        </section>
      )}
      <p className="mt-6 text-center text-sm text-muted">
        {mode === "signup" ? (
          <>
            Already have an account? <Link className="text-india" href="/login">Log in</Link>
          </>
        ) : (
          <>
            New here? <Link className="text-india" href="/signup">Create an account</Link>
          </>
        )}
      </p>
    </main>
  );
}
