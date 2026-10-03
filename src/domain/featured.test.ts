import { describe, expect, it } from "vitest";
import { selectFeaturedPlayers } from "./featured";

describe("featured player rotation", () => {
  it("uses live movers and does not pin one slug", () => {
    const players = [
      { slug: "virat-kohli", changePercent: -3, rangePercent: 12 },
      { slug: "jasprit-bumrah", changePercent: 4.2, rangePercent: 18 },
      { slug: "rohit-sharma", changePercent: 1.1, rangePercent: 40 },
      { slug: "hardik-pandya", changePercent: -6, rangePercent: 9 },
    ];
    const picks = selectFeaturedPlayers(players);
    expect(picks[0]).toMatchObject({ reason: "TOP GAINER", player: { slug: "jasprit-bumrah" } });
    expect(picks[0]?.player.slug).not.toBe("virat-kohli");
    expect(new Set(picks.map((pick) => pick.player.slug)).size).toBe(picks.length);
    expect(picks.some((pick) => pick.reason === "REVERSAL" && pick.player.slug === "hardik-pandya")).toBe(true);
  });
});