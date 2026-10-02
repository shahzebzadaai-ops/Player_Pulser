/**
 * Plans feed-player confirmation. A new name is never confirmed by itself.
 * A previously verified provider id is reused.
 */

import { normalizePlayerName, suggestPlayerMatch } from "./cricket-feed";
import type { MatchProvider } from "./match-resolver";

export type ProviderPlayerRef = {
  source: MatchProvider;
  externalPlayerId: string;
  externalPlayerName: string;
  participationStatus: string;
  knownPlayerId: string | null;
};

export type KnownPlayer = { id: string; name: string; slug: string };

export type MappingPlanRow = {
  key: string;
  providers: Partial<Record<MatchProvider, { externalPlayerId: string; name: string }>>;
  playerId: string | null;
  playerName: string | null;
  slug: string | null;
  status: "CONFIRMED" | "SAFE" | "AMBIGUOUS" | "UNRESOLVED";
  participation: string;
};

const PARTICIPATING = new Set(["PLAYING_XI", "ACTIVE", "SUBSTITUTE"]);

export function planPlayerMappings(providers: ProviderPlayerRef[], players: KnownPlayer[]): MappingPlanRow[] {
  const byKey = new Map<string, { refs: ProviderPlayerRef[]; playerIds: Set<string> }>();
  for (const ref of providers) {
    const known = ref.knownPlayerId && players.some((player) => player.id === ref.knownPlayerId) ? ref.knownPlayerId : null;
    const suggested = known ? null : suggestPlayerMatch(ref.externalPlayerName, players);
    const playerId = known ?? suggested?.id ?? null;
    const key = playerId ?? `name:${normalizePlayerName(ref.externalPlayerName) || ref.externalPlayerId}`;
    const group = byKey.get(key) ?? { refs: [], playerIds: new Set<string>() };
    group.refs.push(ref);
    if (known) group.playerIds.add(known);
    if (suggested) group.playerIds.add(suggested.id);
    byKey.set(key, group);
  }
  return [...byKey.entries()].map(([key, group]) => {
    const ids = [...group.playerIds];
    const player = ids.length === 1 ? players.find((item) => item.id === ids[0]) ?? null : null;
    const verified = group.refs.every((ref) => ref.knownPlayerId && ref.knownPlayerId === player?.id);
    const conflict = ids.length > 1 || group.refs.some((ref) => ref.knownPlayerId && player && ref.knownPlayerId !== player.id);
    const status: MappingPlanRow["status"] = conflict || !player
      ? conflict ? "AMBIGUOUS" : "UNRESOLVED"
      : verified ? "CONFIRMED" : "SAFE";
    const providersForRow: MappingPlanRow["providers"] = {};
    for (const ref of group.refs) {
      providersForRow[ref.source] = { externalPlayerId: ref.externalPlayerId, name: ref.externalPlayerName };
    }
    const participation = group.refs.some((ref) => PARTICIPATING.has(ref.participationStatus))
      ? group.refs.find((ref) => PARTICIPATING.has(ref.participationStatus))?.participationStatus ?? "UNKNOWN"
      : group.refs[0]?.participationStatus ?? "UNKNOWN";
    return {
      key,
      providers: providersForRow,
      playerId: conflict ? null : player?.id ?? null,
      playerName: conflict ? null : player?.name ?? null,
      slug: conflict ? null : player?.slug ?? null,
      status,
      participation,
    };
  }).map((row, _index, rows) => {
    const names = Object.values(row.providers).map((provider) => normalizePlayerName(provider?.name ?? "")).filter(Boolean);
    const ids = new Set(rows.flatMap((item) => names.some((name) => Object.values(item.providers).some((provider) => normalizePlayerName(provider?.name ?? "") === name)) && item.playerId ? [item.playerId] : []));
    if (ids.size > 1) return { ...row, status: "AMBIGUOUS" as const, playerId: null, playerName: null, slug: null };
    return row;
  });
}

export function safeMappings(rows: MappingPlanRow[]): MappingPlanRow[] {
  return rows.filter((row) => row.status === "SAFE" && row.playerId);
}

export function participatingUnresolved(rows: MappingPlanRow[]): MappingPlanRow[] {
  return rows.filter((row) => row.status !== "CONFIRMED" && PARTICIPATING.has(row.participation));
}
