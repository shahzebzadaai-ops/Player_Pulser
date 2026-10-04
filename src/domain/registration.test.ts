import { expect, test } from "vitest";
import { ageConsentAccepted, registrationIssues } from "./registration";

test("registration requires names, email, password, and an explicit age and policy declaration", () => {
  const issues = registrationIssues({
    givenName: "",
    familyName: " ",
    email: "not-an-email",
    username: "ab",
    password: "short",
    acceptedAge: false,
    acceptedTerms: false,
  });
  expect(issues.givenName).toBe("Enter your first name.");
  expect(issues.familyName).toBe("Enter your last name.");
  expect(issues.email).toBe("Enter a valid email address.");
  expect(issues.username).toBe("Use 3–24 letters, numbers, dots, or underscores.");
  expect(issues.password).toBe("Must be 6+ characters with a number");
  expect(issues.acceptedTerms).toMatch(/18 or older/);
  expect(ageConsentAccepted({ acceptedAge: true, acceptedTerms: false })).toBe(false);
  expect(ageConsentAccepted({ acceptedAge: false, acceptedTerms: true })).toBe(false);
});

test("a complete declaration has no field issues and an optional username may be blank", () => {
  expect(
    registrationIssues({
      givenName: "Sam",
      familyName: "Kohli",
      email: "sam@example.com",
      username: "",
      password: "secret1",
      acceptedAge: true,
      acceptedTerms: true,
    }),
  ).toEqual({});
  expect(ageConsentAccepted({ acceptedAge: true, acceptedTerms: true })).toBe(true);
});
