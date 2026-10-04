import { expect, test } from "vitest";
import {
  authSheetOpen,
  directLoginTarget,
  directSignupTarget,
  visibleAuthParts,
  withAuthMode,
  withoutAuthMode,
} from "./auth-surface";

test("the sheet stays mounted only while the auth query is present", () => {
  expect(authSheetOpen("/players/virat-kohli", "auth=login")).toBe(true);
  expect(authSheetOpen("/market", "auth=signup&profile=1")).toBe(true);
  expect(authSheetOpen("/", "")).toBe(false);
  expect(authSheetOpen("/home", "auth=other")).toBe(false);
  expect(authSheetOpen("/admin", "auth=login")).toBe(false);
  expect(authSheetOpen("/dev/auth", "auth=signup")).toBe(false);
  expect(visibleAuthParts(true)).toEqual(["sheet"]);
  expect(visibleAuthParts(false)).toEqual([]);
});

test("closing removes only the auth query and stays on the current page", () => {
  expect(withoutAuthMode("/players/virat-kohli?auth=login&resume=1")).toBe("/players/virat-kohli?resume=1");
  expect(withoutAuthMode("/?auth=signup&profile=1&passkey=1")).toBe("/");
  expect(withoutAuthMode("/market?auth=login")).toBe("/market");
});

test("switching mode keeps the page and drops profile or passkey substeps", () => {
  expect(withAuthMode("/players/virat-kohli?auth=login&profile=1&resume=1", "signup")).toBe(
    "/players/virat-kohli?auth=signup&resume=1",
  );
  expect(withAuthMode("/?auth=signup&passkey=1", "login")).toBe("/?auth=login");
});

test("direct login and signup routes open the overlay instead of a blank page", () => {
  expect(directLoginTarget({}, false)).toBe("/?auth=login");
  expect(directLoginTarget({ link: "1", error: "google" }, false)).toBe("/?auth=login&link=1&error=google");
  expect(directLoginTarget({ error: "demo" }, false)).toBe("/?auth=login&error=demo");
  expect(directLoginTarget({ error: "other" }, false)).toBe("/?auth=login");
  expect(directLoginTarget({}, true)).toBe("/continue");
  expect(directSignupTarget(false)).toBe("/?auth=signup");
  expect(directSignupTarget(true)).toBe("/continue");
});
