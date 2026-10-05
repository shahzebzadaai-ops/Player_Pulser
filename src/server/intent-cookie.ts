import { cookies } from "next/headers";
import { AUTH_INTENT_COOKIE, AUTH_LINK_COOKIE, readAuthIntent, signAuthIntent, type AuthIntent } from "@/domain/auth-intent";
import { readGoogleLink, signGoogleLink, type GoogleLink } from "@/domain/google-link";
import { readProviderProfile, signProviderProfile, type ProviderProfile } from "@/domain/provider-profile";
import { authSecret } from "./auth";

const options = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 60,
};

export async function saveIntent(intent: AuthIntent): Promise<void> {
  const jar = await cookies();
  jar.set(AUTH_INTENT_COOKIE, signAuthIntent(intent, authSecret()), options);
}

export async function currentIntent(): Promise<AuthIntent | null> {
  const jar = await cookies();
  return readAuthIntent(jar.get(AUTH_INTENT_COOKIE)?.value, authSecret());
}

export async function clearIntent(): Promise<void> {
  const jar = await cookies();
  jar.delete(AUTH_INTENT_COOKIE);
}

export async function saveGoogleLink(link: GoogleLink): Promise<void> {
  const jar = await cookies();
  jar.set(AUTH_LINK_COOKIE, signGoogleLink(link, authSecret()), options);
}

export async function currentGoogleLink(): Promise<GoogleLink | null> {
  const jar = await cookies();
  return readGoogleLink(jar.get(AUTH_LINK_COOKIE)?.value, authSecret());
}

export async function clearGoogleLink(): Promise<void> {
  const jar = await cookies();
  jar.delete(AUTH_LINK_COOKIE);
}

const SIGNUP_COOKIE = "pp_google_signup";

export async function saveGoogleSignup(link: GoogleLink): Promise<void> {
  const jar = await cookies();
  jar.set(SIGNUP_COOKIE, signGoogleLink(link, authSecret()), options);
}

export async function currentGoogleSignup(): Promise<GoogleLink | null> {
  const jar = await cookies();
  return readGoogleLink(jar.get(SIGNUP_COOKIE)?.value, authSecret());
}

export async function clearGoogleSignup(): Promise<void> {
  const jar = await cookies();
  jar.delete(SIGNUP_COOKIE);
}

const APPLE_SIGNUP_COOKIE = "pp_apple_signup";

export async function saveAppleSignup(link: ProviderProfile): Promise<void> {
  const jar = await cookies();
  jar.set(APPLE_SIGNUP_COOKIE, signProviderProfile(link, authSecret()), options);
}

export async function currentAppleSignup(): Promise<ProviderProfile | null> {
  const jar = await cookies();
  return readProviderProfile(jar.get(APPLE_SIGNUP_COOKIE)?.value, authSecret());
}

export async function clearAppleSignup(): Promise<void> {
  const jar = await cookies();
  jar.delete(APPLE_SIGNUP_COOKIE);
}
