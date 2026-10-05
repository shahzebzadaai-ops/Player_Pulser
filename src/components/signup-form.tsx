"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { normalizeEmail, normalizeInternationalPhone } from "@/domain/identities";
import { registrationIssues } from "@/domain/registration";

export function WelcomeAuth({
  pending,
  notice,
  phoneEnabled,
  passkeyReady,
  onGoogle,
  onApple,
  onEmail,
  onPhone,
  onPasskey,
}: {
  pending: boolean;
  notice: string | null;
  phoneEnabled: boolean;
  passkeyReady: boolean;
  onGoogle: () => void;
  onApple: () => void;
  onEmail: (email: string) => Promise<void>;
  onPhone: (phone: string) => void;
  onPasskey: () => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [phone, setPhone] = useState("");

  async function continueEmail(event: React.FormEvent) {
    event.preventDefault();
    if (!normalizeEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    await onEmail(email.trim());
  }

  function sendPhone() {
    const normalized = normalizeInternationalPhone("IN", phone);
    if (!normalized) {
      setError("Enter a valid mobile number.");
      return;
    }
    setError(null);
    onPhone(normalized);
  }

  return (
    <form className="grid gap-3" onSubmit={(event) => void continueEmail(event)} noValidate>
      <h2 id="auth-sheet-title" className="text-2xl font-bold">Welcome to PlayerPulser</h2>
      <p className="text-sm text-muted">Log in or create an account to trade the players you follow.</p>
      <button type="button" className="btn-secondary w-full" onClick={onGoogle}>
        <GoogleMark /> Continue with Google
      </button>
      <button type="button" className="btn-secondary w-full" onClick={onApple}>
        <AppleMark /> Continue with Apple
      </button>
      <p className="text-center text-xs text-muted">Or</p>
      <label className="text-sm">
        <span className="sr-only">Email</span>
        <input
          className="auth-input"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Enter your email"
          aria-label="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      {error ? <p className="text-sm text-loss">{error}</p> : null}
      <button className="btn-primary w-full" type="submit" disabled={pending}>{pending ? "Continuing…" : "Continue"}</button>
      <p className="text-center text-xs text-muted">
        <Link className="underline" href="/terms">Terms of Use</Link>
        {" and "}
        <Link className="underline" href="/privacy">Privacy Policy</Link>
      </p>
      {notice ? <p className="text-sm text-loss" aria-live="polite">{notice}</p> : null}
      {phoneEnabled || passkeyReady ? (
        <div className="grid gap-2">
          <button type="button" className="min-h-11 text-xs text-muted" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}>
            Phone or passkey
          </button>
          {moreOpen ? (
            <div className="grid gap-2">
              {phoneEnabled ? (
                <>
                  <label className="text-sm">
                    Mobile number
                    <span className="mt-1 flex min-h-12 overflow-hidden rounded-2xl bg-pitch">
                      <span className="flex items-center px-3 text-sm text-muted">+91</span>
                      <input className="min-h-12 w-full bg-transparent px-2 outline-none" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
                    </span>
                  </label>
                  <button type="button" className="btn-secondary w-full" disabled={pending} onClick={sendPhone}>Continue with phone</button>
                </>
              ) : null}
              {passkeyReady ? (
                <button type="button" className="btn-secondary w-full" disabled={pending} onClick={onPasskey}>Sign in with Face ID / Touch ID</button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

export function SignupForm({
  email,
  pending,
  onCreate,
}: {
  email: string;
  pending: boolean;
  onCreate: (values: { givenName: string; familyName: string; username: string; password: string; referral: string }) => Promise<void>;
}) {
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [referral, setReferral] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const issues = registrationIssues({
      givenName,
      familyName,
      email,
      username,
      password,
      acceptedAge: agreed,
      acceptedTerms: agreed,
    });
    setErrors(issues);
    if (Object.keys(issues).length > 0) return;
    await onCreate({ givenName, familyName, username, password, referral });
  }

  return (
    <form className="mt-2 grid gap-3" onSubmit={(event) => void create(event)} noValidate>
      <p className="text-sm text-muted">Create your account for {email}.</p>
      <Field label="First name" error={errors.givenName} required>
        <input className="auth-input" autoComplete="given-name" value={givenName} onChange={(event) => setGivenName(event.target.value)} />
      </Field>
      <Field label="Last name" error={errors.familyName} required>
        <input className="auth-input" autoComplete="family-name" value={familyName} onChange={(event) => setFamilyName(event.target.value)} />
      </Field>
      <Field label="Username" hint="Optional" error={errors.username}>
        <input className="auth-input" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
      </Field>
      <Field label="Password" error={errors.password} required>
        <span className="mt-1 flex rounded-2xl bg-pitch">
          <input className="auth-input mt-0 min-h-12 flex-1 bg-transparent" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button type="button" className="min-h-12 px-3 text-xs text-muted" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
            {showPassword ? "Hide" : "Show"}
          </button>
        </span>
      </Field>
      <label className="text-sm">
        Referral code (optional)
        <input className="auth-input" autoComplete="off" value={referral} onChange={(event) => setReferral(event.target.value)} />
      </label>
      <Consent agreed={agreed} onChange={setAgreed} />
      {errors.acceptedTerms ? <p className="text-sm text-loss">{errors.acceptedTerms}</p> : null}
      <button className="btn-primary w-full" type="submit" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
    </form>
  );
}

export function GoogleFinishForm({
  provider = "Google",
  email,
  initialGivenName,
  initialFamilyName,
  pending,
  onSubmit,
}: {
  provider?: "Google" | "Apple";
  email: string;
  initialGivenName: string;
  initialFamilyName: string;
  pending: boolean;
  onSubmit: (values: { givenName: string; familyName: string; username: string; referral: string }) => Promise<void>;
}) {
  const [givenName, setGivenName] = useState(initialGivenName);
  const [familyName, setFamilyName] = useState(initialFamilyName);
  const [username, setUsername] = useState("");
  const [referral, setReferral] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  useEffect(() => {
    setGivenName((current) => current || initialGivenName);
    setFamilyName((current) => current || initialFamilyName);
  }, [initialGivenName, initialFamilyName]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const issues = registrationIssues({
      givenName: givenName || initialGivenName,
      familyName: familyName || initialFamilyName,
      email: email || "held@example.com",
      username,
      password: "held00",
      acceptedAge: agreed,
      acceptedTerms: agreed,
    });
    const kept = { givenName: issues.givenName, familyName: issues.familyName, username: issues.username, acceptedTerms: issues.acceptedTerms };
    setErrors(kept);
    if (Object.values(kept).some(Boolean)) return;
    await onSubmit({ givenName: givenName || initialGivenName, familyName: familyName || initialFamilyName, username, referral });
  }

  return (
    <form className="grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
      <p className="text-sm text-muted">{provider} confirmed {email || "your account"}. Add any missing details before the account is created. This checkbox is your declaration, not a verified age check.</p>
      {initialGivenName ? null : (
        <Field label="First name" error={errors.givenName} required>
          <input className="auth-input" autoComplete="given-name" value={givenName} onChange={(event) => setGivenName(event.target.value)} />
        </Field>
      )}
      {initialFamilyName ? null : (
        <Field label="Last name" error={errors.familyName} required>
          <input className="auth-input" autoComplete="family-name" value={familyName} onChange={(event) => setFamilyName(event.target.value)} />
        </Field>
      )}
      <Field label="Username" hint="Optional" error={errors.username}>
        <input className="auth-input" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
      </Field>
      <label className="text-sm">
        Referral code (optional)
        <input className="auth-input" autoComplete="off" value={referral} onChange={(event) => setReferral(event.target.value)} />
      </label>
      <Consent agreed={agreed} onChange={setAgreed} />
      {errors.acceptedTerms ? <p className="text-sm text-loss">{errors.acceptedTerms}</p> : null}
      <button className="btn-primary w-full" type="submit" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
    </form>
  );
}

function Field({ label, hint, error, required, children }: { label: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="text-sm">
      {label} {required ? <span className="text-loss">*</span> : null} {hint ? <span className="text-muted">{hint}</span> : null}
      {children}
      {error ? <span className="mt-1 block text-loss">{error}</span> : null}
    </label>
  );
}

function Consent({ agreed, onChange }: { agreed: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input className="mt-1" type="checkbox" checked={agreed} onChange={(event) => onChange(event.target.checked)} />
      <span>
        I am 18 or older and agree to the <Link className="text-india underline" href="/terms">Terms of Use</Link> and <Link className="text-india underline" href="/privacy">Privacy Policy</Link>.
      </span>
    </label>
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

function AppleMark() {
  return (
    <svg viewBox="0 0 18 18" className="mr-2 h-4 w-4" aria-hidden>
      <path fill="currentColor" d="M13.4 9.5c0-1.8 1.5-2.7 1.6-2.8-0.9-1.3-2.2-1.4-2.7-1.5-1.1-.1-2.2.7-2.8.7s-1.5-.7-2.4-.6c-1.2 0-2.4.7-3 1.9-1.3 2.2-.3 5.5.9 7.3.6.9 1.3 1.9 2.3 1.8.9 0 1.2-.6 2.3-.6s1.4.6 2.4.6 1.6-.9 2.2-1.8c.7-1 1-2 1-2.1-.1 0-1.8-.7-1.8-2.9zM11.8 4.1c.5-.6.8-1.4.7-2.2-.7 0-1.5.5-2 .1-.5.6-.9 1.4-.8 2.2.8.1 1.6-.4 2.1-1z" />
    </svg>
  );
}
