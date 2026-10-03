const RESERVED = new Set([
  "admin",
  "administrator",
  "support",
  "playerpulser",
  "player-pulser",
  "player_pulser",
  "staff",
  "official",
  "system",
  "root",
  "help",
]);

export function normalizeUsername(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (!/^[a-z0-9._]{3,24}$/.test(value)) return null;
  if (value.startsWith(".") || value.endsWith(".") || value.includes("..")) return null;
  if (RESERVED.has(value)) return null;
  return value;
}

export function temporaryUsername(userId: string): string {
  const stem = userId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  return `player_${stem || "fan"}`.slice(0, 24);
}

export function suggestUsernames(givenName: string, familyName: string): string[] {
  const stem = `${givenName}${familyName}`.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  const base = stem.length >= 3 ? stem : "player";
  return [base, `${base}7`.slice(0, 24), `${base}18`.slice(0, 24)];
}