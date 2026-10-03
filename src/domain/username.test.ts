import { expect, test } from "vitest";
import { normalizeUsername, suggestUsernames, temporaryUsername } from "./username";

test("usernames are normalized and reserved names are rejected", () => {
  expect(normalizeUsername(" RahulSharma ")).toBe("rahulsharma");
  expect(normalizeUsername("admin")).toBeNull();
  expect(normalizeUsername("playerpulser")).toBeNull();
  expect(normalizeUsername("ab")).toBeNull();
  expect(normalizeUsername("has space")).toBeNull();
  expect(normalizeUsername(".hidden")).toBeNull();
});

test("name suggestions and temporary usernames stay unique-shaped", () => {
  expect(suggestUsernames("Rahul", "Sharma")[0]).toBe("rahulsharma");
  expect(suggestUsernames("Rahul", "Sharma")).toContain("rahulsharma7");
  expect(temporaryUsername("User_ABC")).toMatch(/^player_[a-z0-9]+$/);
  expect(temporaryUsername("User_ABC")).toBe(temporaryUsername("user-abc"));
});
