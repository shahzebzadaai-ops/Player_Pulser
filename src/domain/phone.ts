export function normalizeIndianPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  let national = digits;
  if (national.startsWith("91") && national.length === 12) national = national.slice(2);
  if (national.startsWith("0") && national.length === 11) national = national.slice(1);
  if (!/^[6-9]\d{9}$/.test(national)) return null;
  return `+91${national}`;
}

export function passwordIssue(password: string): string | null {
  if (password.length < 6 || !/\d/.test(password)) {
    return "Must be 6+ characters with a number";
  }
  return null;
}

export function devAuthAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.DEV_AUTH_ENABLED === "true";
}
