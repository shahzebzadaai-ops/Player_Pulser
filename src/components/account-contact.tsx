"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccountContact({
  givenName,
  familyName,
  email,
  phone,
  emailVerified,
  phoneVerified,
  marketingConsent,
}: {
  givenName: string | null;
  familyName: string | null;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  marketingConsent: boolean;
}) {
  const router = useRouter();
  const [nextEmail, setNextEmail] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [given, setGiven] = useState(givenName ?? "");
  const [family, setFamily] = useState(familyName ?? "");
  const [offers, setOffers] = useState(marketingConsent);
  const [doNotEmail, setDoNotEmail] = useState(false);
  const [doNotSms, setDoNotSms] = useState(false);
  const [doNotWhatsApp, setDoNotWhatsApp] = useState(false);
  const [doNotCall, setDoNotCall] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function sendCode() {
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "EMAIL", email: nextEmail }),
    });
    const body = (await response.json()) as { challengeId?: string; devCode?: string; error?: { message: string } };
    setPending(false);
    if (!response.ok || !body.challengeId) {
      setMessage(body.error?.message ?? "We could not send a code.");
      return;
    }
    setChallengeId(body.challengeId);
    setDevCode(body.devCode ?? null);
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!challengeId) return;
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeId, code, acceptedTerms: true }),
    });
    const body = (await response.json()) as { error?: { message: string } };
    setPending(false);
    if (!response.ok) {
      setMessage(body.error?.message ?? "That code was not accepted.");
      return;
    }
    setMessage("Email verified on this account.");
    setDevCode(null);
    router.refresh();
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/auth/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        givenName: given || "Cricket",
        familyName: family || "Fan",
        marketingConsent: offers,
        doNotEmail,
        doNotSms,
        doNotWhatsApp,
        doNotCall,
      }),
    });
    const body = (await response.json()) as { error?: { message: string } };
    setPending(false);
    if (!response.ok) {
      setMessage(body.error?.message ?? "We could not save that.");
      return;
    }
    setMessage("Account details saved.");
    router.refresh();
  }

  return (
    <section className="mt-4 rounded-3xl bg-card p-4">
      <h2 className="font-semibold">Account</h2>
      <p className="mt-1 text-sm text-muted">Phone {phone || "not added"} · {phoneVerified ? "verified" : "not verified"}</p>
      <p className="text-sm text-muted">Email {email || "not added"} · {emailVerified ? "verified" : "not verified"}</p>
      <p className="text-sm text-muted">Offers {marketingConsent ? "on" : "off"}</p>
      {!emailVerified ? (
        <form className="mt-3 grid gap-2" onSubmit={verify}>
          <label className="text-sm">
            Add email
            <input className="mt-1 min-h-11 w-full rounded-2xl bg-pitch px-3" type="email" autoComplete="email" value={nextEmail} onChange={(event) => setNextEmail(event.target.value)} />
          </label>
          <button type="button" className="btn-secondary w-full" disabled={pending} onClick={() => void sendCode()}>Send email code</button>
          {devCode ? <p className="text-sm text-muted">Development code {devCode}</p> : null}
          {challengeId ? (
            <label className="text-sm">
              Email code
              <input className="mt-1 min-h-11 w-full rounded-2xl bg-pitch px-3" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
            </label>
          ) : null}
          {challengeId ? <button className="btn-primary w-full" disabled={pending}>Verify email</button> : null}
        </form>
      ) : null}
      <form className="mt-3 grid gap-2" onSubmit={saveProfile}>
        <label className="text-sm">
          Given name
          <input className="mt-1 min-h-11 w-full rounded-2xl bg-pitch px-3" autoComplete="given-name" value={given} onChange={(event) => setGiven(event.target.value)} />
        </label>
        <label className="text-sm">
          Family name
          <input className="mt-1 min-h-11 w-full rounded-2xl bg-pitch px-3" autoComplete="family-name" value={family} onChange={(event) => setFamily(event.target.value)} />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={offers} onChange={(event) => setOffers(event.target.checked)} />
          Send me PlayerPulser offers and updates.
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={doNotEmail} onChange={(event) => setDoNotEmail(event.target.checked)} /> Do not email</label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={doNotSms} onChange={(event) => setDoNotSms(event.target.checked)} /> Do not SMS</label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={doNotWhatsApp} onChange={(event) => setDoNotWhatsApp(event.target.checked)} /> Do not WhatsApp</label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={doNotCall} onChange={(event) => setDoNotCall(event.target.checked)} /> Do not call</label>
        <button className="btn-secondary w-full" disabled={pending}>Save preferences</button>
      </form>
      <p className="mt-2 min-h-5 text-sm text-muted" aria-live="polite">{message}</p>
    </section>
  );
}
