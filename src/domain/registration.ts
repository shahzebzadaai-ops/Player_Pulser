import { normalizeEmail } from "./identities";
import { passwordIssue } from "./phone";
import { normalizeUsername } from "./username";

export const AGE_CONSENT_MESSAGE =
  "Confirm you are 18 or older and agree to the Terms of Use and Privacy Policy.";

export function ageConsentAccepted(input: { acceptedAge?: boolean; acceptedTerms?: boolean }): boolean {
  return input.acceptedAge === true && input.acceptedTerms === true;
}

export type RegistrationInput = {
  givenName: string;
  familyName: string;
  email: string;
  username: string;
  password: string;
  acceptedAge: boolean;
  acceptedTerms: boolean;
};

export function registrationIssues(input: RegistrationInput): Partial<Record<keyof RegistrationInput, string>> {
  const issues: Partial<Record<keyof RegistrationInput, string>> = {};
  if (!input.givenName.trim()) issues.givenName = "Enter your first name.";
  else if (input.givenName.trim().length > 40) issues.givenName = "Use 40 characters or fewer.";
  if (!input.familyName.trim()) issues.familyName = "Enter your last name.";
  else if (input.familyName.trim().length > 40) issues.familyName = "Use 40 characters or fewer.";
  if (!normalizeEmail(input.email)) issues.email = "Enter a valid email address.";
  if (input.username.trim() && !normalizeUsername(input.username)) {
    issues.username = "Use 3–24 letters, numbers, dots, or underscores.";
  }
  const password = passwordIssue(input.password);
  if (password) issues.password = password;
  if (!ageConsentAccepted(input)) issues.acceptedTerms = AGE_CONSENT_MESSAGE;
  return issues;
}
