export type AuthFlags = {
  googleEnabled: boolean;
  appleEnabled: boolean;
  phoneOtpEnabled: boolean;
  emailOtpEnabled: boolean;
  legacyPasswordEnabled: boolean;
};

export function authFlags(env: NodeJS.ProcessEnv = process.env): AuthFlags {
  const devOtp = env.NODE_ENV !== "production" && env.DEV_AUTH_ENABLED === "true";
  const googleConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const appleConfigured = Boolean(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);
  const httpOtp = env.OTP_PROVIDER === "http" && Boolean(env.OTP_HTTP_URL);
  return {
    googleEnabled: googleConfigured && env.AUTH_GOOGLE_ENABLED !== "false",
    appleEnabled: appleConfigured && env.AUTH_APPLE_ENABLED !== "false",
    phoneOtpEnabled: devOtp || (env.AUTH_PHONE_OTP_ENABLED === "true" && httpOtp),
    emailOtpEnabled: devOtp || (env.AUTH_EMAIL_OTP_ENABLED === "true" && httpOtp),
    legacyPasswordEnabled: env.AUTH_LEGACY_PASSWORD_ENABLED !== "false",
  };
}

export const CUSTOMER_LOGO_HREF = "/#top";

const PRIVATE_PREFIXES = ["/home", "/portfolio", "/wallet", "/rewards", "/notifications", "/settings"];

export function customerRouteAccess(pathname: string): "public" | "private" {
  if (pathname === "/" || pathname === "/market" || pathname.startsWith("/market/") || pathname.startsWith("/players/") || pathname.startsWith("/p/")) {
    return "public";
  }
  if (PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return "private";
  return "public";
}
