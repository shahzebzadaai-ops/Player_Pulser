"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { visibleAuthParts } from "@/domain/auth-surface";
import { normalizeInternationalPhone } from "@/domain/identities";
import { passkeyButtonVisible } from "@/domain/passkey";
import { Logo } from "./visuals";
import { GoogleFinishForm, SignupForm } from "./signup-form";

type Flags = {
  googleEnabled: boolean;
  phoneOtpEnabled: boolean;
  emailOtpEnabled: boolean;
  legacyPasswordEnabled: boolean;
};

type Step = "register" | "google" | "methods" | "phone" | "email" | "code" | "profile" | "password" | "passkey";

export function AuthSheet({
  mode,
  flags,
  open,
  onClose,
  onSwitchMode,
  notice,
  initialStep,
}: {
  mode: "login" | "signup";
  flags: Flags;
  open: boolean;
  onClose?: () => void;
  onSwitchMode?: (mode: "login" | "signup") => void;
  notice?: string | null;
  initialStep?: Step;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const ignoreClose = useRef(true);
  const modern = flags.googleEnabled || flags.phoneOtpEnabled || flags.emailOtpEnabled;
  const [step, setStep] = useState<Step>(initialStep ?? (mode === "signup" ? "register" : modern ? "methods" : "password"));
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<"PHONE" | "EMAIL">("PHONE");
  const [destination, setDestination] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [message, setMessage] = useState<string | null>(notice ?? null);
  const [pending, setPending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameState, setUsernameState] = useState<"idle" | "available" | "taken" | "invalid">("idle");
  const [contact, setContact] = useState<"email" | "phone">("email");
  const [passkeyReady, setPasskeyReady] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [googleEmail, setGoogleEmail] = useState("");
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const usernameTimer = useRef<number>(0);

  useEffect(() => {
    const node = dialog.current;
    if (!node || !open) return;
    ignoreClose.current = true;
    if (!node.open) node.showModal();
    const allowUserClose = window.setTimeout(() => {
      ignoreClose.current = false;
    }, 0);
    return () => {
      window.clearTimeout(allowUserClose);
      ignoreClose.current = true;
      if (!node.open) return;
      node.close();
    };
  }, [open]);

  useEffect(() => {
    if (step !== "profile") return;
    void fetch("/api/auth/profile").then(async (response) => {
      if (!response.ok) return;
      const body = (await response.json()) as { givenName?: string | null; familyName?: string | null; suggestion?: string | null };
      setGivenName((current) => current || body.givenName || "");
      setFamilyName((current) => current || body.familyName || "");
      const suggested = body.suggestion ?? "";
      setUsername((current) => current || suggested);
      if (!suggested) return;
      const check = await fetch("/api/auth/username", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: suggested }),
      });
      const availability = (await check.json()) as { available?: boolean; valid?: boolean };
      setUsernameState(!availability.valid ? "invalid" : availability.available ? "available" : "taken");
    }).catch(() => undefined);
  }, [step]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!browserSupportsWebAuthn() || !document.cookie.includes("pp_pk=1")) return;
      const platform = await platformAuthenticatorIsAvailable().catch(() => false);
      if (!cancelled) setPasskeyReady(passkeyButtonVisible({ webAuthn: true, platform, registeredHere: true }));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  function track(eventName: string) {
    void fetch("/api/analytics/funnel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventName, dedupeKey: `${eventName}:${new Date().toISOString().slice(0, 16)}` }),
    });
  }

  async function requestCode(nextChannel: "PHONE" | "EMAIL", nextDestination: string) {
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nextChannel === "PHONE" ? { channel: "PHONE", phone: nextDestination } : { channel: "EMAIL", email: nextDestination }),
    });
    const body = (await response.json()) as { challengeId?: string; devCode?: string; error?: { message: string } };
    setPending(false);
    if (!response.ok || !body.challengeId) {
      setMessage(body.error?.message ?? "We could not send a code.");
      return;
    }
    setDevCode(body.devCode ?? null);
    setChannel(nextChannel);
    setDestination(nextDestination);
    setChallengeId(body.challengeId);
    setDigits(["", "", "", "", "", ""]);
    setResendIn(30);
    setStep("code");
    track("otp_requested");
  }

  async function verify(code: string) {
    if (!challengeId || code.length !== 6) return;
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId,
          code,
          acceptedTerms: agreed,
          acceptedAge: agreed,
          displayName: [givenName, familyName].filter(Boolean).join(" ") || undefined,
          givenName,
          familyName,
        }),
    });
    const body = (await response.json()) as { error?: { message: string }; needsProfile?: boolean };
    setPending(false);
    if (!response.ok) {
      setMessage(body.error?.message ?? "That code was not accepted.");
      return;
    }
    if (body.needsProfile) {
      setStep("profile");
      return;
    }
    await offerPasskeyOrContinue();
  }

  function fillDigits(value: string, index: number) {
    const clean = value.replace(/\D/g, "");
    if (clean.length > 1) {
      const next = clean.slice(0, 6).split("");
      const filled = [0, 1, 2, 3, 4, 5].map((slot) => next[slot] ?? "");
      setDigits(filled);
      if (filled.every(Boolean)) void verify(filled.join(""));
      return;
    }
    const next = [...digits];
    next[index] = clean.slice(-1);
    setDigits(next);
    if (clean && index < 5) inputs.current[index + 1]?.focus();
    if (next.every(Boolean)) void verify(next.join(""));
  }

  function onDigitKey(event: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const response = await fetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        mode === "signup"
          ? { method: identifier.includes("@") ? "email" : "phone", phone: identifier, email: identifier, password, displayName: [givenName, familyName].filter(Boolean).join(" ") || "Cricket Fan", givenName, familyName, acceptedTerms: agreed, acceptedAge: agreed }
          : { identifier, password },
      ),
    });
    const body = (await response.json()) as { error?: { message: string } };
    setPending(false);
    if (!response.ok) {
      setMessage(body.error?.message ?? "We couldn't sign you in. Please try again.");
      return;
    }
    await offerPasskeyOrContinue();
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/auth/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        givenName,
        familyName,
        ...(username.trim() ? { username } : {}),
      }),
    });
    const body = (await response.json()) as { error?: { message: string } };
    setPending(false);
    if (!response.ok) {
      setMessage(body.error?.message ?? "We could not save your profile.");
      return;
    }
    await offerPasskeyOrContinue();
  }

  async function offerPasskeyOrContinue() {
    setMessage("Signing you in…");
    const platform = browserSupportsWebAuthn() ? await platformAuthenticatorIsAvailable().catch(() => false) : false;
    if (!platform || document.cookie.includes("pp_passkey_skipped=1")) {
      window.location.assign("/continue");
      return;
    }
    const response = await fetch("/api/auth/passkey/status");
    const body = (await response.json().catch(() => null)) as { eligible?: boolean } | null;
    if (!response.ok || !body?.eligible) {
      window.location.assign("/continue");
      return;
    }
    setPending(false);
    setMessage(null);
    setStep("passkey");
  }

  async function enablePasskey() {
    setPending(true);
    setMessage(null);
    try {
      const optionsResponse = await fetch("/api/auth/passkey/register/options", { method: "POST" });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) {
        setMessage(options.error?.message ?? "We couldn't set up device sign-in. Please try again.");
        setPending(false);
        return;
      }
      const attestation = await startRegistration({ optionsJSON: options });
      const verifyResponse = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(attestation),
      });
      if (!verifyResponse.ok) {
        const body = (await verifyResponse.json().catch(() => null)) as { error?: { message: string } } | null;
        setMessage(body?.error?.message ?? "We couldn't set up device sign-in. Please try again.");
        setPending(false);
        return;
      }
      window.location.assign("/continue");
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      setPending(false);
      setMessage(name === "NotAllowedError" || name === "AbortError" ? "Device sign-in was cancelled." : "We couldn't set up device sign-in. You can continue without it.");
    }
  }

  async function signInWithPasskey() {
    setPending(true);
    setMessage("Signing you in…");
    try {
      const optionsResponse = await fetch("/api/auth/passkey/login/options", { method: "POST" });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) {
        setMessage("We couldn't sign you in. Please try again.");
        setPending(false);
        return;
      }
      const assertion = await startAuthentication({ optionsJSON: options });
      const verifyResponse = await fetch("/api/auth/passkey/login/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(assertion),
      });
      if (!verifyResponse.ok) {
        setMessage("We couldn't sign you in. Please try again.");
        setPending(false);
        return;
      }
      window.location.assign("/continue");
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      setPending(false);
      setMessage(name === "NotAllowedError" || name === "AbortError" ? "Device sign-in was cancelled." : "We couldn't sign you in. Please try again.");
    }
  }

  async function skipPasskey() {
    await fetch("/api/auth/passkey/skip", { method: "POST" });
    window.location.assign("/continue");
  }

  useEffect(() => {
    if (step !== "google") return;
    void fetch("/api/auth/google/pending").then(async (response) => {
      if (!response.ok) return;
      const body = (await response.json()) as { pending?: boolean; email?: string; givenName?: string | null; familyName?: string | null };
      if (!body.pending) {
        setMessage("Google sign-in expired. Start again.");
        return;
      }
      setGoogleEmail(body.email ?? "");
      setGivenName((current) => current || body.givenName || "");
      setFamilyName((current) => current || body.familyName || "");
    }).catch(() => setMessage("Google sign-in expired. Start again."));
  }, [step]);

  if (!visibleAuthParts(open).includes("sheet")) return null;
  const title = step === "passkey" ? "Sign in faster next time" : step === "google" ? "Finish Google sign-up" : step === "profile" ? "Complete your PlayerPulser profile" : mode === "signup" ? "Create an account" : "Sign in";
  const copy = step === "passkey" ? "Use Face ID, Touch ID, or your device unlock on this phone or computer." : step === "google" ? "Your declaration is recorded with the account. It is not a verified age check." : step === "profile" ? "Let's finish setting up your PlayerPulser account." : mode === "signup" ? "Welcome to PlayerPulser" : "Trade the players you follow.";

  return (
    <dialog
      ref={dialog}
      className="auth-dialog"
      aria-labelledby="auth-sheet-title"
      onCancel={(event) => {
        event.preventDefault();
        if (ignoreClose.current || !onClose) return;
        onClose();
      }}
      onClose={() => {
        const node = dialog.current;
        if (ignoreClose.current || !node || !open || node.open) return;
        node.showModal();
      }}
    >
      <div className="auth-sheet-bar">
        {step !== "methods" && step !== "register" && step !== "google" && step !== "passkey" && !(step === "password" && !modern) ? (
          <button type="button" className="min-h-11 min-w-11 rounded-full bg-pitch text-sm" aria-label="Back" onClick={() => setStep("methods")}>
            Back
          </button>
        ) : null}
        <Logo />
        <button
          type="button"
          className="ml-auto min-h-11 min-w-11 rounded-full bg-pitch text-sm"
          onClick={() => {
            if (step === "passkey") { void skipPasskey(); return; }
            if (step === "profile") { window.location.assign("/continue"); return; }
            onClose?.();
          }}
          aria-label="Close"
        >
          Close
        </button>
      </div>
      <div className="auth-sheet-body">
      <h2 id="auth-sheet-title" className="text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-sm text-muted">{copy}</p>
      <p className="mt-3 min-h-5 text-sm text-loss" aria-live="polite">{message}</p>
      {step === "register" ? (
        <SignupForm
          googleEnabled={flags.googleEnabled}
          phoneEnabled={flags.phoneOtpEnabled}
          passkeyReady={passkeyReady}
          pending={pending}
          onCreate={async (values) => {
            setPending(true);
            setMessage(null);
            setGivenName(values.givenName);
            setFamilyName(values.familyName);
            setAgreed(true);
            const response = await fetch("/api/auth/signup", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                method: "email",
                email: values.email,
                password: values.password,
                givenName: values.givenName.trim(),
                familyName: values.familyName.trim(),
                username: values.username.trim() || undefined,
                referralCode: values.referral.trim() || undefined,
                acceptedAge: true,
                acceptedTerms: true,
              }),
            });
            const body = (await response.json()) as { error?: { message: string } };
            setPending(false);
            if (!response.ok) {
              setMessage(body.error?.message ?? "We couldn't create that account.");
              return;
            }
            await offerPasskeyOrContinue();
          }}
          onPhone={(phoneNumber) => {
            setAgreed(true);
            void requestCode("PHONE", phoneNumber);
          }}
          onPasskey={() => void signInWithPasskey()}
          onLogin={() => onSwitchMode?.("login")}
        />
      ) : null}
      {step === "google" ? (
        <GoogleFinishForm
          email={googleEmail}
          initialGivenName={givenName}
          initialFamilyName={familyName}
          pending={pending}
          onSubmit={async (values) => {
            setPending(true);
            setMessage(null);
            const response = await fetch("/api/auth/google/complete", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                givenName: values.givenName.trim(),
                familyName: values.familyName.trim(),
                username: values.username.trim() || undefined,
                referralCode: values.referral.trim() || undefined,
                acceptedAge: true,
                acceptedTerms: true,
              }),
            });
            const body = (await response.json()) as { error?: { message: string } };
            setPending(false);
            if (!response.ok) {
              setMessage(body.error?.message ?? "We couldn't finish Google sign-up.");
              return;
            }
            await offerPasskeyOrContinue();
          }}
        />
      ) : null}
      {step === "methods" ? (
        <div className="mt-2 grid gap-3">
          {mode === "login" && flags.googleEnabled ? (
            <a className="btn-primary w-full whitespace-nowrap" href="/api/auth/google/start" onClick={() => track("auth_google_selected")}>
              <GoogleMark /> Continue with Google
            </a>
          ) : null}
          {mode === "login" && passkeyReady ? (
            <button type="button" className="btn-secondary w-full whitespace-nowrap" disabled={pending} onClick={() => void signInWithPasskey()}>
              Sign in with Face ID / Touch ID
            </button>
          ) : null}
          <div className="grid grid-cols-2 rounded-full bg-pitch p-1" role="tablist" aria-label="Sign-in method">
            <button type="button" role="tab" aria-selected={contact === "email"} className={`min-h-11 rounded-full text-sm font-semibold ${contact === "email" ? "bg-card text-ink" : "text-muted"}`} onClick={() => setContact("email")}>Email</button>
            <button type="button" role="tab" aria-selected={contact === "phone"} className={`min-h-11 rounded-full text-sm font-semibold ${contact === "phone" ? "bg-card text-ink" : "text-muted"}`} onClick={() => setContact("phone")}>Phone</button>
          </div>
          {contact === "email" ? (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!flags.emailOtpEnabled) return;
                void requestCode("EMAIL", email.trim().toLowerCase());
              }}
            >
              {flags.googleEnabled && mode === "signup" ? (
                <a className="btn-primary w-full whitespace-nowrap" href="/api/auth/google/start" onClick={() => track("auth_google_selected")}>
                  <GoogleMark /> Continue with Google
                </a>
              ) : null}
              {flags.googleEnabled && mode === "signup" && flags.emailOtpEnabled ? <p className="text-center text-xs text-muted">OR</p> : null}
              {flags.emailOtpEnabled ? (
                <>
                  <label className="text-sm">
                    Email
                    <input className="mt-1 min-h-12 w-full rounded-2xl bg-pitch px-3" type="email" autoComplete="email" placeholder="email@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
                  </label>
                  <button className="btn-primary w-full whitespace-nowrap" type="submit" disabled={pending}>{pending ? "Sending code…" : "Continue"}</button>
                </>
              ) : <p className="text-sm text-muted">Email codes are not available right now.</p>}
            </form>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!flags.phoneOtpEnabled) return;
                const normalized = normalizeInternationalPhone("IN", phone);
                if (!normalized) {
                  setMessage("Enter a valid mobile number.");
                  return;
                }
                void requestCode("PHONE", normalized);
              }}
            >
              {flags.phoneOtpEnabled ? (
                <>
                  <label className="text-sm">
                    Mobile number
                    <span className="mt-1 flex min-h-12 overflow-hidden rounded-2xl bg-pitch">
                      <span className="flex items-center px-3 text-sm text-muted">+91</span>
                      <input className="min-h-12 w-full bg-transparent px-2" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(event) => setPhone(event.target.value)} required />
                    </span>
                  </label>
                  <button className="btn-primary w-full whitespace-nowrap" type="submit" disabled={pending}>{pending ? "Sending code…" : "Continue"}</button>
                </>
              ) : <p className="text-sm text-muted">Mobile codes are not available right now.</p>}
            </form>
          )}
          <p className="text-center text-xs text-muted">By continuing you agree to the Terms of Use and Privacy Policy.</p>
          {modern && flags.legacyPasswordEnabled ? (
            <button type="button" className="min-h-11 text-sm text-muted" onClick={() => setStep("password")}>Other sign-in options</button>
          ) : null}
          {mode === "signup" ? (
            <button type="button" className="min-h-11 text-center text-sm text-india" onClick={() => onSwitchMode?.("login")}>Already have an account? Sign in</button>
          ) : (
            <button type="button" className="min-h-11 text-center text-sm text-india" onClick={() => onSwitchMode?.("signup")}>New here? Join PlayerPulser</button>
          )}
        </div>
      ) : null}
      {step === "code" ? (
        <form
          className="mt-2 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void verify(digits.join(""));
          }}
        >
          <p className="text-sm text-muted">Enter the 6 digit code sent to {destination}.</p>
          {devCode ? <p className="text-sm text-muted">Development code {devCode}</p> : null}
          <div className="grid grid-cols-6 gap-2">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(node) => { inputs.current[index] = node; }}
                className="min-h-11 rounded-xl bg-pitch text-center text-lg"
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                maxLength={index === 0 ? 6 : 1}
                value={digit}
                aria-label={`Digit ${index + 1}`}
                onChange={(event) => fillDigits(event.target.value, index)}
                onKeyDown={(event) => onDigitKey(event, index)}
              />
            ))}
          </div>
          <button className="btn-primary" type="submit" disabled={pending}>{pending ? "Verifying…" : "Continue"}</button>
          <button
            className="btn-secondary"
            type="button"
            disabled={resendIn > 0 || pending}
            onClick={() => void requestCode(channel, destination)}
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
          </button>
        </form>
      ) : null}
      {step === "password" ? (
        <form className="mt-2 grid gap-3" onSubmit={submitPassword}>
          <label className="text-sm">
            Mobile or email
            <input className="mt-1 min-h-11 w-full rounded-2xl bg-pitch px-3" autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
          </label>
          <label className="text-sm">
            Password
            <input className="mt-1 min-h-11 w-full rounded-2xl bg-pitch px-3" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {mode === "signup" ? <Consent agreed={agreed} onChange={setAgreed} /> : null}
          <button className="btn-primary w-full whitespace-nowrap" type="submit" disabled={pending}>{mode === "signup" ? "Create account" : "Sign in"}</button>
          {modern ? <button className="btn-secondary w-full" type="button" onClick={() => setStep("methods")}>Back</button> : null}
        </form>
      ) : null}
      {step === "profile" ? (
        <form className="mt-2 grid gap-3" onSubmit={saveProfile}>
          <label className="text-sm">
            First name
            <input className="mt-1 min-h-11 w-full rounded-2xl bg-pitch px-3" autoComplete="given-name" value={givenName} onChange={(event) => setGivenName(event.target.value)} required />
          </label>
          <label className="text-sm">
            Last name
            <input className="mt-1 min-h-11 w-full rounded-2xl bg-pitch px-3" autoComplete="family-name" value={familyName} onChange={(event) => setFamilyName(event.target.value)} required />
          </label>
          <label className="text-sm">
            Username <span className="text-muted">optional</span>
            <input
              className="mt-1 min-h-11 w-full rounded-2xl bg-pitch px-3"
              autoComplete="username"
              value={username}
              onChange={(event) => {
                const next = event.target.value;
                setUsername(next);
                setUsernameState("idle");
                window.clearTimeout(usernameTimer.current);
                if (!next.trim()) return;
                usernameTimer.current = window.setTimeout(() => {
                  void fetch("/api/auth/username", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ username: next }),
                  }).then(async (response) => {
                    const body = (await response.json()) as { available?: boolean; valid?: boolean };
                    setUsernameState(!body.valid ? "invalid" : body.available ? "available" : "taken");
                  }).catch(() => setUsernameState("idle"));
                }, 300);
              }}
            />
          </label>
          <p className="min-h-5 text-sm text-muted">
            {usernameState === "available" ? "Available" : usernameState === "taken" ? "Username already taken" : usernameState === "invalid" ? "Use 3–24 letters, numbers, dots, or underscores." : "Optional. You can add one later in Settings."}
          </p>
          <button className="btn-primary w-full whitespace-nowrap" type="submit" disabled={pending || usernameState === "taken" || usernameState === "invalid"}>{pending ? "Setting up your account…" : "Continue"}</button>
        </form>
      ) : null}
      {step === "passkey" ? (
        <div className="mt-2 grid gap-3">
          <button type="button" className="btn-primary w-full whitespace-nowrap" disabled={pending} onClick={() => void enablePasskey()}>
            {pending ? "Setting up your device…" : "Enable Face ID / Touch ID"}
          </button>
          <button type="button" className="min-h-11 text-sm text-india" onClick={() => void skipPasskey()}>Not now</button>
        </div>
      ) : null}
      </div>
    </dialog>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="mr-2 h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.9 10.7A5.4 5.4 0 0 1 3.6 9c0-.6.1-1.2.3-1.7V5H.9a9 9 0 0 0 0 8l3-2.3z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z" />
    </svg>
  );
}

function Consent({ agreed, onChange }: { agreed: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-start gap-3 text-sm">
      <input className="mt-1" type="checkbox" checked={agreed} onChange={(event) => onChange(event.target.checked)} />
      <span>
        I am 18 or older and agree to the <Link className="text-india underline" href="/terms">Terms of Use</Link> and <Link className="text-india underline" href="/privacy">Privacy Policy</Link>.
      </span>
    </label>
  );
}
