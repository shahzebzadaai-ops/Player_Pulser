import { createSign, createVerify, generateKeyPairSync } from "crypto";
import { expect, test } from "vitest";
import { appleClientSecret, readAppleIdentity } from "./apple-token";

test("Apple client secret is a signed ES256 JWT", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const token = appleClientSecret({
    APPLE_TEAM_ID: "TEAMID123",
    APPLE_CLIENT_ID: "com.playerpulser.web",
    APPLE_KEY_ID: "KEYID12345",
    APPLE_PRIVATE_KEY: pem,
  } as unknown as NodeJS.ProcessEnv, 1_700_000_000_000);
  const [headerPart, payloadPart, signaturePart] = token.split(".");
  const header = JSON.parse(Buffer.from(headerPart ?? "", "base64url").toString("utf8")) as { alg: string; kid: string };
  const payload = JSON.parse(Buffer.from(payloadPart ?? "", "base64url").toString("utf8")) as { iss: string; aud: string; sub: string };
  expect(header).toMatchObject({ alg: "ES256", kid: "KEYID12345" });
  expect(payload).toMatchObject({ iss: "TEAMID123", aud: "https://appleid.apple.com", sub: "com.playerpulser.web" });
  const verified = createVerify("SHA256")
    .update(`${headerPart}.${payloadPart}`)
    .verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signaturePart ?? "", "base64url"));
  expect(verified).toBe(true);
});

test("Apple identity tokens are checked against the signature, issuer, and audience", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const now = 1_700_000_000_000;
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: "key" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: "https://appleid.apple.com",
    aud: "com.playerpulser.web",
    exp: Math.floor(now / 1000) + 120,
    sub: "001234.abcdef",
    email: "fan@example.com",
    email_verified: "true",
  })).toString("base64url");
  const data = `${header}.${payload}`;
  const signed = createSign("SHA256").update(data).sign({ key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  const jwk = publicKey.export({ format: "jwk" });
  expect(readAppleIdentity(`${data}.${signed}`, jwk, "com.playerpulser.web", now)).toEqual({
    sub: "001234.abcdef",
    email: "fan@example.com",
  });
  expect(readAppleIdentity(`${data}.${signed}`, jwk, "com.other", now)).toBeNull();
});
