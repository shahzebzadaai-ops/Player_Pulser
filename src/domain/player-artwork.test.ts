import { describe, expect, it } from "vitest";
import { DEFAULT_SEO, playerPublicSeo } from "./seo";
import { playerArtworkAlt, playerArtworkSrc, publicPlayerPaths } from "./player-artwork";

describe("player artwork", () => {
  it("resolves a matched slug to one public webp path", () => {
    expect(playerArtworkSrc("virat-kohli")).toBe("/assets/players/virat-kohli.webp");
    expect(playerArtworkSrc("jasprit-bumrah")).toBe("/assets/players/jasprit-bumrah.webp");
    expect(playerArtworkAlt("Virat Kohli")).toBe("Virat Kohli cricket caricature on PlayerPulser");
  });

  it("leaves an unknown slug without artwork", () => {
    expect(playerArtworkSrc("india-hero")).toBeNull();
    expect(playerArtworkSrc("not-a-player")).toBeNull();
  });

  it("lists only public player paths", () => {
    const paths = publicPlayerPaths();
    expect(paths).toContain("/p/virat-kohli");
    expect(paths).toContain("/p/abhishek-sharma");
    expect(paths.some((path) => path.startsWith("/admin"))).toBe(false);
    expect(paths).toHaveLength(24);
  });

  it("builds public player metadata from stored name and artwork", () => {
    const copy = playerPublicSeo({ name: "Jasprit Bumrah", slug: "jasprit-bumrah", role: "BOWLER" }, DEFAULT_SEO);
    expect(copy.title).toBe("Jasprit Bumrah Player Price & Performance | PlayerPulser");
    expect(copy.description).toBe("Follow Jasprit Bumrah on PlayerPulser with player price movement, cricket performance and market activity.");
    expect(copy.imagePath).toBe("/assets/players/jasprit-bumrah.webp");
    expect(copy.imageAlt).toBe("Jasprit Bumrah cricket caricature on PlayerPulser");
    expect(copy.imageWidth).toBe(1024);
    expect(copy.imageHeight).toBe(1024);
  });
});
