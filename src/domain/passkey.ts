/** Relying party id for WebAuthn. IP addresses cannot host passkeys. */
export function passkeyRelyingParty(host: string | null | undefined, configured?: string | null): string | null {
  const explicit = configured?.trim().toLowerCase();
  if (explicit) return explicit === "localhost" || explicit.includes(".") ? explicit : null;
  const hostname = host?.split(":")[0]?.trim().toLowerCase() ?? "";
  if (!hostname) return null;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return "localhost";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":")) return null;
  return hostname;
}

/** The device button is shown only when this browser already registered a passkey. */
export function passkeyButtonVisible(input: { webAuthn: boolean; platform: boolean; registeredHere: boolean }): boolean {
  return input.webAuthn && input.platform && input.registeredHere;
}
