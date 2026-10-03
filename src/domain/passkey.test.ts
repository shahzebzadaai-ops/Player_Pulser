import { expect, test } from "vitest";
import { passkeyButtonVisible, passkeyRelyingParty } from "./passkey";

test("passkeys use localhost or a real hostname", () => {
  expect(passkeyRelyingParty("localhost:3001")).toBe("localhost");
  expect(passkeyRelyingParty("playerpulser.com")).toBe("playerpulser.com");
  expect(passkeyRelyingParty("127.0.0.1:3001")).toBeNull();
  expect(passkeyRelyingParty("localhost:3001", "playerpulser.com")).toBe("playerpulser.com");
});

test("the device sign-in button waits for a passkey on this browser", () => {
  expect(passkeyButtonVisible({ webAuthn: true, platform: true, registeredHere: true })).toBe(true);
  expect(passkeyButtonVisible({ webAuthn: true, platform: true, registeredHere: false })).toBe(false);
  expect(passkeyButtonVisible({ webAuthn: false, platform: true, registeredHere: true })).toBe(false);
});
