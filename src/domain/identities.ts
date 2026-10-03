import { INVESTOR_DEMO_EMAIL } from "./investor-demo";

export type GoogleDecision = "SIGN_IN" | "CREATE" | "LINK_REQUIRED" | "REJECTED";

export function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  if (!email || email.length > 200 || !email.includes("@") || email.includes(" ")) return null;
  return email;
}

export function googleAccountDecision(input: {
  email: string | null;
  existingBySubjectUserId: string | null;
  existingByEmailUserId: string | null;
}): GoogleDecision {
  if (input.email === INVESTOR_DEMO_EMAIL) return "REJECTED";
  if (input.existingBySubjectUserId) return "SIGN_IN";
  if (input.existingByEmailUserId) return "LINK_REQUIRED";
  return "CREATE";
}

export function shouldGrantWelcomeBonus(createdNewUser: boolean): boolean {
  return createdNewUser;
}

export type DialCountry = { code: "IN" | "US" | "GB" | "AE" | "SG"; dial: string; label: string };

export const DIAL_COUNTRIES: DialCountry[] = [
  { code: "IN", dial: "91", label: "India" },
  { code: "US", dial: "1", label: "United States" },
  { code: "GB", dial: "44", label: "United Kingdom" },
  { code: "AE", dial: "971", label: "United Arab Emirates" },
  { code: "SG", dial: "65", label: "Singapore" },
];

export function normalizeInternationalPhone(country: string, national: string): string | null {
  const selected = DIAL_COUNTRIES.find((item) => item.code === country);
  if (!selected) return null;
  let digits = national.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (selected.code === "IN") {
    if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
    if (!/^[6-9]\d{9}$/.test(digits)) return null;
    return `+91${digits}`;
  }
  if (digits.startsWith(selected.dial)) digits = digits.slice(selected.dial.length);
  if (digits.length < 6 || digits.length > 12) return null;
  return `+${selected.dial}${digits}`;
}
