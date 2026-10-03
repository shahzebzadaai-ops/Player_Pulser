import type { LifecycleStage } from "@/domain/growth";

export function CrmFacts({
  givenName,
  familyName,
  email,
  phone,
  emailVerified,
  phoneVerified,
  signupMethod,
  createdAt,
  lastLoginAt,
  accountStatus,
  lifecycle,
  firstTouch,
  lastTouch,
  marketingConsent,
  marketingConsentAt,
  marketingConsentSource,
  marketingConsentVersion,
  doNotEmail,
  doNotSms,
  doNotWhatsApp,
  doNotCall,
}: {
  givenName: string | null;
  familyName: string | null;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  signupMethod: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  accountStatus: string;
  lifecycle: LifecycleStage;
  firstTouch: string;
  lastTouch: string;
  marketingConsent: boolean;
  marketingConsentAt: Date | null;
  marketingConsentSource: string | null;
  marketingConsentVersion: string | null;
  doNotEmail: boolean;
  doNotSms: boolean;
  doNotWhatsApp: boolean;
  doNotCall: boolean;
}) {
  const when = (value: Date | null) => (value ? value.toLocaleString("en-IN", { hour12: false }) : "Not recorded");
  return (
    <dl className="mt-2 grid gap-1 text-xs text-muted">
      <div>First name: {givenName || "Not recorded"}</div>
      <div>Last name: {familyName || "Not recorded"}</div>
      <div>Email: {email || "Not recorded"} · {emailVerified ? "verified" : "not verified"}</div>
      <div>Phone: {phone || "Not recorded"} · {phoneVerified ? "verified" : "not verified"}</div>
      <div>Signup method: {signupMethod || "Not recorded"}</div>
      <div>Created: {when(createdAt)}</div>
      <div>Last login: {when(lastLoginAt)}</div>
      <div>Account status: {accountStatus}</div>
      <div>Lifecycle: {lifecycle}</div>
      <div>First touch: {firstTouch}</div>
      <div>Last touch: {lastTouch}</div>
      <div>
        Marketing consent: {marketingConsent ? "yes" : "no"}
        {marketingConsent ? ` · ${when(marketingConsentAt)} · ${marketingConsentSource || "unknown source"} · ${marketingConsentVersion || "unversioned"}` : ""}
      </div>
      <div>Suppression: email {doNotEmail ? "off" : "allowed"}, SMS {doNotSms ? "off" : "allowed"}, WhatsApp {doNotWhatsApp ? "off" : "allowed"}, call {doNotCall ? "off" : "allowed"}</div>
    </dl>
  );
}
