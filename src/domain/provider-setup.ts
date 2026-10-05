const PRODUCTION_ORIGIN = "https://playerpulser.com";

export function googleSetupMessage(env: NodeJS.ProcessEnv = process.env, localOrigin = "http://localhost:3001"): string | null {
  if (env.AUTH_GOOGLE_ENABLED === "false") {
    return "Google sign-in is switched off. Remove AUTH_GOOGLE_ENABLED=false on the server.";
  }
  const missing = [
    env.GOOGLE_CLIENT_ID ? null : "GOOGLE_CLIENT_ID",
    env.GOOGLE_CLIENT_SECRET ? null : "GOOGLE_CLIENT_SECRET",
  ].filter((item): item is string => Boolean(item));
  if (missing.length === 0) return null;
  return `Google sign-in needs ${missing.join(" and ")} on the server. Register ${localOrigin}/api/auth/google/callback and ${PRODUCTION_ORIGIN}/api/auth/google/callback.`;
}

export function appleSetupMessage(env: NodeJS.ProcessEnv = process.env, localOrigin = "http://localhost:3001"): string | null {
  if (env.AUTH_APPLE_ENABLED === "false") {
    return "Apple sign-in is switched off. Remove AUTH_APPLE_ENABLED=false on the server.";
  }
  const missing = [
    env.APPLE_CLIENT_ID ? null : "APPLE_CLIENT_ID",
    env.APPLE_TEAM_ID ? null : "APPLE_TEAM_ID",
    env.APPLE_KEY_ID ? null : "APPLE_KEY_ID",
    env.APPLE_PRIVATE_KEY ? null : "APPLE_PRIVATE_KEY",
  ].filter((item): item is string => Boolean(item));
  if (missing.length === 0) return null;
  return `Apple sign-in needs ${missing.join(", ")} on the server. Register ${localOrigin}/api/auth/apple/callback and ${PRODUCTION_ORIGIN}/api/auth/apple/callback.`;
}

export type EmailContinueNext = "register" | "login" | "google" | "apple" | "phone";

export function emailAccountNext(user: { passwordHash: string | null; providers: string[] } | null): EmailContinueNext {
  if (!user) return "register";
  if (user.passwordHash) return "login";
  if (user.providers.includes("GOOGLE")) return "google";
  if (user.providers.includes("APPLE")) return "apple";
  if (user.providers.includes("PHONE")) return "phone";
  return "login";
}
