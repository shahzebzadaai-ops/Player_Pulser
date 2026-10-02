import { describe, expect, it } from "vitest";
import { permissionsFor } from "./permissions";
import { activeAdminGroup, visibleAdminGroups } from "./admin-nav";
import {
  applyTouchDecision,
  buildCampaignUrl,
  classifyTouch,
  isTrackablePath,
  normalizeUtm,
  parseAttributionSearch,
  SOURCE_ALIASES,
  MEDIUM_ALIASES,
} from "./attribution";

describe("utm capture", () => {
  it("normalizes casing, spaces, and known aliases", () => {
    expect(normalizeUtm("Facebook", SOURCE_ALIASES)).toBe("meta");
    expect(normalizeUtm("META", SOURCE_ALIASES)).toBe("meta");
    expect(normalizeUtm("fb", SOURCE_ALIASES)).toBe("meta");
    expect(normalizeUtm("Paid Social", MEDIUM_ALIASES)).toBe("paid_social");
    expect(parseAttributionSearch("utm_source=Facebook&utm_medium=CPC&utm_campaign=IPL Final").source).toBe("meta");
    expect(parseAttributionSearch("utm_source=Facebook&utm_medium=CPC&utm_campaign=IPL Final").medium).toBe("paid_search");
    expect(parseAttributionSearch("utm_source=Facebook&utm_medium=CPC&utm_campaign=IPL Final").campaign).toBe("ipl_final");
  });

  it("builds a same-site url and rejects an outside destination", () => {
    const built = buildCampaignUrl({
      origin: "http://localhost:3000",
      destination: "/signup",
      source: "Meta",
      medium: "paid_social",
      campaign: "Opening",
    });
    expect(built).toMatchObject({ url: "http://localhost:3000/signup?utm_source=meta&utm_medium=paid_social&utm_campaign=opening" });
    expect(buildCampaignUrl({ origin: "http://localhost:3000", destination: "https://example.com", source: "meta", medium: "crm", campaign: "x" })).toEqual({
      error: "Destination must stay on this PlayerPulser site.",
    });
  });
});

describe("attribution decisions", () => {
  it("keeps the first touch and updates last touch only for a new attributed session", () => {
    const first = applyTouchDecision({ firstTouchId: null, lastTouchId: null }, { touchId: "a", attributed: true });
    const direct = applyTouchDecision(first, { touchId: "b", attributed: false });
    const next = applyTouchDecision(direct, { touchId: "c", attributed: true });
    expect(first).toEqual({ firstTouchId: "a", lastTouchId: "a" });
    expect(direct).toEqual({ firstTouchId: "a", lastTouchId: "a" });
    expect(next).toEqual({ firstTouchId: "a", lastTouchId: "c" });
  });

  it("classifies a click id without a source", () => {
    expect(classifyTouch(parseAttributionSearch("gclid=abc123"), null).source).toBe("google");
  });

  it("does not treat admin routes as marketing traffic", () => {
    expect(isTrackablePath("/admin")).toBe(false);
    expect(isTrackablePath("/admin/marketing/utm")).toBe(false);
    expect(isTrackablePath("/")).toBe(true);
    expect(isTrackablePath("/players/virat-kohli")).toBe(true);
  });
});

describe("admin navigation", () => {
  it("expands the group that contains the active page", () => {
    expect(activeAdminGroup("/admin/marketing/utm")).toBe("Marketing");
    expect(activeAdminGroup("/admin")).toBeNull();
    expect(activeAdminGroup("/admin/settings")).toBe("Settings");
    expect(activeAdminGroup("/admin/settings/trading")).toBe("Settings");
  });

  it("hides marketing links a read-only analyst cannot manage and hides empty groups", () => {
    const analyst = visibleAdminGroups(permissionsFor("ANALYST"));
    const marketing = analyst.find((group) => group.label === "Marketing");
    expect(marketing?.items.map((item) => item.label)).toContain("Attribution");
    expect(marketing?.items.map((item) => item.label)).not.toContain("Audience Export");
    expect(analyst.find((group) => group.label === "Operations")?.items.map((item) => item.label)).not.toContain("Staff");
    const crm = visibleAdminGroups(permissionsFor("CRM_MANAGER"));
    expect(crm.find((group) => group.label === "Marketing")?.items.map((item) => item.label)).toContain("Audience Export");
    expect(permissionsFor("ANALYST")).not.toContain("utm.manage");
    expect(permissionsFor("SUPER_ADMIN")).toContain("marketing.manage");
  });
});
