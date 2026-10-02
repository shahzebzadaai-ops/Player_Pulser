import { describe, expect, it } from "vitest";
import { nextIndiaMatch, providerAvailability, resolveCrossSourceMatches, type ProviderMatchRecord } from "./match-resolver";

const start = "2026-10-02T14:00:00.000Z";

function record(patch: Partial<ProviderMatchRecord> & Pick<ProviderMatchRecord, "source" | "externalId" | "homeTeam" | "awayTeam">): ProviderMatchRecord {
  return {
    competition: "India tour of Australia 2026",
    scheduledAt: start,
    matchFormat: "T20",
    venue: "Melbourne Cricket Ground",
    providerStatus: "upcoming",
    ...patch,
  };
}

describe("cross-source match resolver", () => {
  it("resolves three differently named provider records to one match", () => {
    const [match] = resolveCrossSourceMatches([
      record({ source: "CREX", externalId: "crex-1", homeTeam: "IND", awayTeam: "AUS" }),
      record({ source: "Sportskeeda", externalId: "sk-1", homeTeam: "India Men", awayTeam: "Australia", matchFormat: "Twenty20" }),
      record({ source: "Cricbuzz", externalId: "cb-1", homeTeam: "Australia", awayTeam: "India", venue: "Melbourne" }),
    ]);
    expect(match?.foundCount).toBe(3);
    expect(match?.providers.CREX?.externalId).toBe("crex-1");
    expect(match?.providers.Sportskeeda?.externalId).toBe("sk-1");
    expect(match?.providers.Cricbuzz?.externalId).toBe("cb-1");
    expect(match?.homeTeam).toBe("India Men");
    expect(match?.monitoring).toBe("READY");
  });

  it("does not link a different opponent or a different start", () => {
    const matches = resolveCrossSourceMatches([
      record({ source: "CREX", externalId: "aus", homeTeam: "India", awayTeam: "Australia" }),
      record({ source: "Sportskeeda", externalId: "eng", homeTeam: "India", awayTeam: "England" }),
      record({ source: "Cricbuzz", externalId: "later", homeTeam: "India", awayTeam: "Australia", scheduledAt: "2026-10-03T14:00:00.000Z" }),
    ]);
    expect(matches).toHaveLength(3);
  });

  it("keeps a two-source match ready and a one-source match degraded", () => {
    const [two] = resolveCrossSourceMatches([
      record({ source: "Sportskeeda", externalId: "sk-2", homeTeam: "India", awayTeam: "Australia" }),
      record({ source: "Cricbuzz", externalId: "cb-2", homeTeam: "India", awayTeam: "Australia" }),
    ]);
    const [one] = resolveCrossSourceMatches([
      record({ source: "CREX", externalId: "crex-only", homeTeam: "India", awayTeam: "Australia" }),
    ]);
    expect(two?.monitoring).toBe("READY");
    expect(providerAvailability(two ?? null).CREX).toBe("NOT FOUND");
    expect(one?.monitoring).toBe("DEGRADED");
    expect(nextIndiaMatch([
      record({ source: "CREX", externalId: "crex-only", homeTeam: "India", awayTeam: "Australia" }),
    ], Date.parse(start))?.monitoring).toBe("DEGRADED");
  });
});
