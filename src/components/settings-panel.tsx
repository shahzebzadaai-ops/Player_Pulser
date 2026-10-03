"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogoutButton } from "./chrome";
import { Portrait } from "./visuals";

export function SettingsPanel({
  givenName,
  familyName,
  username,
  email,
  phone,
  avatarUrl,
  emailVerified,
  phoneVerified,
  googleConnected,
  googleAvailable,
  passwordAvailable,
  marketingConsent,
  doNotEmail,
  doNotSms,
  doNotWhatsApp,
  doNotCall,
}: {
  givenName: string | null;
  familyName: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  googleConnected: boolean;
  googleAvailable: boolean;
  passwordAvailable: boolean;
  marketingConsent: boolean;
  doNotEmail: boolean;
  doNotSms: boolean;
  doNotWhatsApp: boolean;
  doNotCall: boolean;
}) {
  const router = useRouter();
  const [given, setGiven] = useState(givenName ?? "");
  const [family, setFamily] = useState(familyName ?? "");
  const [name, setName] = useState(username ?? "");
  const [nextEmail, setNextEmail] = useState(email ?? "");
  const [offers, setOffers] = useState(marketingConsent);
  const [emailOffers, setEmailOffers] = useState(!doNotEmail);
  const [smsOffers, setSmsOffers] = useState(!doNotSms);
  const [whatsAppOffers, setWhatsAppOffers] = useState(!doNotWhatsApp);
  const [callOffers, setCallOffers] = useState(!doNotCall);
  const [usernameState, setUsernameState] = useState<"idle" | "available" | "taken" | "invalid">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const timer = useRef<number>(0);

  function checkUsername(next: string) {
    setName(next);
    setUsernameState("idle");
    window.clearTimeout(timer.current);
    if (!next.trim() || next.trim() === username) return;
    timer.current = window.setTimeout(() => {
      void fetch("/api/auth/username", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: next }),
      }).then(async (response) => {
        const body = (await response.json()) as { available?: boolean; valid?: boolean };
        setUsernameState(!body.valid ? "invalid" : body.available ? "available" : "taken");
      }).catch(() => setUsernameState("idle"));
    }, 300);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/auth/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        givenName: given,
        familyName: family,
        ...(name.trim() && name.trim() !== username ? { username: name } : {}),
        ...(nextEmail.trim() && nextEmail.trim() !== email ? { email: nextEmail } : {}),
        marketingConsent: offers,
        doNotEmail: !emailOffers,
        doNotSms: !smsOffers,
        doNotWhatsApp: !whatsAppOffers,
        doNotCall: !callOffers,
      }),
    });
    const body = (await response.json()) as { error?: { message: string } };
    setPending(false);
    if (!response.ok) {
      setMessage(body.error?.message ?? "We could not save that.");
      return;
    }
    setMessage("Saved.");
    router.refresh();
  }

  return (
    <form className="grid gap-4" onSubmit={save}>
      <section className="rounded-3xl bg-card p-4">
        <h2 className="font-semibold">Profile</h2>
        <div className="mt-3 flex items-center gap-3">
          {avatarUrl ? <img src={avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" /> : <Portrait name={given || "Player"} seed={username || "player"} className="h-14 w-14 rounded-full" />}
        </div>
        <label className="mt-3 block text-sm">First name<input className="mt-1 min-h-11 w-full rounded-2xl bg-pitch px-3" autoComplete="given-name" value={given} onChange={(event) => setGiven(event.target.value)} required /></label>
        <label className="mt-3 block text-sm">Last name<input className="mt-1 min-h-11 w-full rounded-2xl bg-pitch px-3" autoComplete="family-name" value={family} onChange={(event) => setFamily(event.target.value)} required /></label>
        <label className="mt-3 block text-sm">Username<input className="mt-1 min-h-11 w-full rounded-2xl bg-pitch px-3" autoComplete="username" value={name} onChange={(event) => checkUsername(event.target.value)} /></label>
        <p className="mt-1 min-h-5 text-sm text-muted">{usernameState === "available" ? "Available" : usernameState === "taken" ? "Username already taken" : usernameState === "invalid" ? "Use 3–24 letters, numbers, dots, or underscores." : ""}</p>
        <label className="mt-1 block text-sm">Email<input className="mt-1 min-h-11 w-full rounded-2xl bg-pitch px-3" type="email" autoComplete="email" value={nextEmail} onChange={(event) => setNextEmail(event.target.value)} /></label>
        <p className="mt-3 text-sm text-muted">Phone {phone || "not added"}</p>
      </section>
      <section className="rounded-3xl bg-card p-4">
        <h2 className="font-semibold">Account & security</h2>
        <p className="mt-2 text-sm">Email {emailVerified ? "verified" : "not verified"}</p>
        <p className="text-sm">Phone {phoneVerified ? "verified" : "not verified"}</p>
        <p className="text-sm">Google {googleConnected ? "connected" : "not connected"}</p>
        {passwordAvailable ? <p className="mt-2 text-sm text-muted">Password sign-in stays under Other sign-in options.</p> : null}
      </section>
      <section className="rounded-3xl bg-card p-4">
        <h2 className="font-semibold">Communication</h2>
        <label className="mt-2 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={emailOffers} onChange={(event) => setEmailOffers(event.target.checked)} /> Email offers</label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={smsOffers} onChange={(event) => setSmsOffers(event.target.checked)} /> SMS offers</label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={whatsAppOffers} onChange={(event) => setWhatsAppOffers(event.target.checked)} /> WhatsApp offers</label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={callOffers} onChange={(event) => setCallOffers(event.target.checked)} /> Calls</label>
      </section>
      <section className="rounded-3xl bg-card p-4">
        <h2 className="font-semibold">Notifications</h2>
        <Link href="/notifications" className="mt-2 inline-flex min-h-11 items-center text-sm text-india">Open notifications</Link>
      </section>
      <section className="rounded-3xl bg-card p-4">
        <h2 className="font-semibold">Privacy & legal</h2>
        <label className="mt-2 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={offers} onChange={(event) => setOffers(event.target.checked)} /> Marketing consent</label>
        <div className="mt-2 flex gap-4 text-sm">
          <Link href="/privacy" className="text-india">Privacy policy</Link>
          <Link href="/terms" className="text-india">Terms</Link>
        </div>
      </section>
      <button className="btn-primary w-full" disabled={pending || usernameState === "taken" || usernameState === "invalid"}>{pending ? "Saving…" : "Save"}</button>
      <p className="min-h-5 text-sm text-muted" aria-live="polite">{message}</p>
      <section className="rounded-3xl bg-card p-4">
        <h2 className="font-semibold">Account</h2>
        <div className="mt-3"><LogoutButton /></div>
      </section>
    </form>
  );
}
