/**
 * Current policy versions. Signup and reacceptance read only this object.
 * Older acceptances stay stored with the version the customer agreed to.
 */
export const POLICY_VERSIONS = {
  terms: "terms-draft-2026-10-02",
  privacy: "privacy-draft-2026-10-02",
} as const;

export type PolicyType = "TERMS" | "PRIVACY" | "MARKETING";

export function currentPolicyVersion(type: "TERMS" | "PRIVACY"): string {
  return type === "TERMS" ? POLICY_VERSIONS.terms : POLICY_VERSIONS.privacy;
}
