import { describe, expect, it } from "vitest";
import { planPlayerMappings, safeMappings } from "./player-mapping-plan";

const virat = { id: "player-virat", name: "Virat Kohli", slug: "virat-kohli" };
const other = { id: "player-other", name: "Virat Kohli", slug: "virat-kohli-2" };

describe("player mapping plan", () => {
  it("reuses a previously verified provider id", () => {
    const [row] = planPlayerMappings([
      { source: "CREX", externalPlayerId: "12345", externalPlayerName: "Virat Kohli", participationStatus: "PLAYING_XI", knownPlayerId: virat.id },
    ], [virat]);
    expect(row?.status).toBe("CONFIRMED");
    expect(safeMappings([row!])).toHaveLength(0);
  });

  it("suggests one safe row when every source names the same known player", () => {
    const rows = planPlayerMappings([
      { source: "CREX", externalPlayerId: "12345", externalPlayerName: "Virat Kohli", participationStatus: "PLAYING_XI", knownPlayerId: null },
      { source: "Sportskeeda", externalPlayerId: "9832", externalPlayerName: "Virat Kohli", participationStatus: "PLAYING_XI", knownPlayerId: null },
      { source: "Cricbuzz", externalPlayerId: "1413", externalPlayerName: "Virat Kohli", participationStatus: "SQUAD", knownPlayerId: null },
    ], [virat]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("SAFE");
    expect(rows[0]?.slug).toBe("virat-kohli");
    expect(safeMappings(rows)).toHaveLength(1);
  });

  it("does not auto-confirm an ambiguous name", () => {
    const rows = planPlayerMappings([
      { source: "CREX", externalPlayerId: "1", externalPlayerName: "Virat Kohli", participationStatus: "PLAYING_XI", knownPlayerId: null },
      { source: "Cricbuzz", externalPlayerId: "2", externalPlayerName: "Virat Kohli", participationStatus: "PLAYING_XI", knownPlayerId: null },
    ], [virat, other]);
    expect(rows.every((row) => row.status !== "SAFE" && row.status !== "CONFIRMED")).toBe(true);
    expect(safeMappings(rows)).toHaveLength(0);
  });

  it("leaves a squad-only unknown player unresolved", () => {
    const [row] = planPlayerMappings([
      { source: "CREX", externalPlayerId: "99", externalPlayerName: "New Squad Player", participationStatus: "SQUAD", knownPlayerId: null },
    ], [virat]);
    expect(row?.status).toBe("UNRESOLVED");
  });
});
