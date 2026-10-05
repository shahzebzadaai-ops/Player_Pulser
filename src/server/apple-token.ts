import { createPrivateKey, createPublicKey, createSign, createVerify, type JsonWebKey } from "crypto";
import { normalizeEmail } from "@/domain/identities";

function b64url(value: Buffer | string): string {
  const buffer = typeof value === "string" ? Buffer.from(value) : value;
  return buffer.toString("base64url");
}

export function appleClientSecret(env: NodeJS.ProcessEnv, now = Date.now()): string {
  const teamId = env.APPLE_TEAM_ID ?? "";
  const clientId = env.APPLE_CLIENT_ID ?? "";
  const keyId = env.APPLE_KEY_ID ?? "";
  const pem = (env.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  if (!teamId || !clientId || !keyId || !pem) throw new Error("Apple sign-in is not configured.");
  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const iat = Math.floor(now / 1000);
  const payload = b64url(JSON.stringify({
    iss: teamId,
    iat,
    exp: iat + 60 * 60 * 24 * 150,
    aud: "https://appleid.apple.com",
    sub: clientId,
  }));
  const data = `${header}.${payload}`;
  const signature = createSign("SHA256").update(data).sign({ key: createPrivateKey(pem), dsaEncoding: "ieee-p1363" });
  return `${data}.${b64url(signature)}`;
}

export type AppleIdentity = { sub: string; email: string | null };

export function readAppleIdentity(idToken: string, jwk: object, clientId: string, now = Date.now()): AppleIdentity | null {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;
  let header: { alg?: string };
  let claims: { iss?: string; aud?: string | string[]; exp?: number; sub?: string; email?: string; email_verified?: boolean | string };
  try {
    header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as { alg?: string };
    claims = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as typeof claims;
  } catch {
    return null;
  }
  if (header.alg !== "ES256") return null;
  const verified = createVerify("SHA256")
    .update(`${encodedHeader}.${encodedPayload}`)
    .verify({ key: createPublicKey({ key: jwk as JsonWebKey, format: "jwk" }), dsaEncoding: "ieee-p1363" }, Buffer.from(encodedSignature, "base64url"));
  if (!verified) return null;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== "https://appleid.apple.com" || !audiences.includes(clientId)) return null;
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now || typeof claims.sub !== "string") return null;
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";
  return { sub: claims.sub, email: emailVerified ? normalizeEmail(claims.email) : null };
}

export function appleTokenKid(idToken: string): string | null {
  const encoded = idToken.split(".")[0];
  if (!encoded) return null;
  try {
    const header = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { kid?: string };
    return typeof header.kid === "string" ? header.kid : null;
  } catch {
    return null;
  }
}
