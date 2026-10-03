export type FeatureReason = "TOP GAINER" | "TRENDING" | "BREAKOUT" | "MOST ACTIVE" | "REVERSAL";

export function selectFeaturedPlayers<T extends { slug: string; changePercent: number; rangePercent?: number }>(
  players: T[],
  limit = 5,
): { player: T; reason: FeatureReason }[] {
  const change = (player: T) => player.changePercent;
  const activity = (player: T) => player.rangePercent ?? Math.abs(player.changePercent);
  const used = new Set<string>();
  const picks: { player: T; reason: FeatureReason }[] = [];
  const take = (reason: FeatureReason, ordered: T[]) => {
    const next = ordered.find((player) => !used.has(player.slug));
    if (!next) return;
    used.add(next.slug);
    picks.push({ player: next, reason });
  };
  take("TOP GAINER", [...players].sort((a, b) => change(b) - change(a)));
  take("MOST ACTIVE", [...players].sort((a, b) => activity(b) - activity(a)));
  take("BREAKOUT", [...players].filter((player) => change(player) > 0).sort((a, b) => activity(b) - activity(a)));
  take("TRENDING", [...players].filter((player) => change(player) > 0).sort((a, b) => change(b) - change(a)));
  take("REVERSAL", [...players].sort((a, b) => change(a) - change(b)));
  for (const player of [...players].sort((a, b) => Math.abs(change(b)) - Math.abs(change(a)))) {
    if (picks.length >= limit) break;
    if (used.has(player.slug)) continue;
    used.add(player.slug);
    picks.push({ player, reason: change(player) >= 0 ? "TRENDING" : "REVERSAL" });
  }
  return picks.slice(0, limit);
}

export function pickFeaturedPlayers<T extends { slug: string; changePercent: number; rangePercent?: number }>(players: T[], limit = 5): T[] {
  return selectFeaturedPlayers(players, limit).map((pick) => pick.player);
}
