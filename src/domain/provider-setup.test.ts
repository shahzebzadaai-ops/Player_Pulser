import { describe, expect, test } from "vitest";
import { appleSetupMessage, emailAccountNext, googleSetupMessage } from "./provider-setup";

describe("provider setup", () => {
  test("names the missing Google and Apple credentials", () => {
    const empty = {} as unknown as NodeJS.ProcessEnv;
    expect(googleSetupMessage(empty, "http://localhost:3001")).toContain("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
    expect(googleSetupMessage(empty, "http://localhost:3001")).toContain("http://localhost:3001/api/auth/google/callback");
    expect(appleSetupMessage(empty, "http://localhost:3001")).toContain("APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY");
    expect(appleSetupMessage(empty, "http://localhost:3001")).toContain("https://playerpulser.com/api/auth/apple/callback");
    expect(googleSetupMessage({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(appleSetupMessage({ AUTH_APPLE_ENABLED: "false", APPLE_CLIENT_ID: "id" } as unknown as NodeJS.ProcessEnv)).toContain("AUTH_APPLE_ENABLED=false");
  });

  test("email continue chooses login, register, or the existing provider", () => {
    expect(emailAccountNext(null)).toBe("register");
    expect(emailAccountNext({ passwordHash: "scrypt$a$b", providers: ["EMAIL"] })).toBe("login");
    expect(emailAccountNext({ passwordHash: null, providers: ["GOOGLE"] })).toBe("google");
    expect(emailAccountNext({ passwordHash: null, providers: ["APPLE"] })).toBe("apple");
    expect(emailAccountNext({ passwordHash: null, providers: ["PHONE"] })).toBe("phone");
  });
});
