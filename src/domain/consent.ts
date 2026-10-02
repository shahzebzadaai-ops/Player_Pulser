import { currentPolicyVersion, type PolicyType } from "./policy-versions";

export type ConsentRow = {
  policyType: string | null;
  version: string | null;
  termsVersion: string;
  privacyVersion: string;
};

export function consentMatches(row: ConsentRow, type: PolicyType, version: string): boolean {
  if (row.policyType === type && row.version === version) return true;
  if (row.policyType) return false;
  if (type === "TERMS") return row.termsVersion === version;
  if (type === "PRIVACY") return row.privacyVersion === version;
  return false;
}

export function needsPolicyReacceptance(rows: ConsentRow[], type: "TERMS" | "PRIVACY", version = currentPolicyVersion(type)): boolean {
  return !rows.some((row) => consentMatches(row, type, version));
}

/** Terms acceptance does not grant marketing tags. */
export function marketingTagsAllowed(input: { termsAccepted: boolean; marketingConsent: string | null }): boolean {
  return input.marketingConsent === "granted";
}
