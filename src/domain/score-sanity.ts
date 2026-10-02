/**
 * Optional score check. A later CricketData adapter may confirm the
 * score, wickets, and overs. It must not create ball-level pricing events.
 */

export type ScoreSanitySnapshot = {
  score: string;
  wickets: number;
  overs: string;
};

export interface ScoreSanityProvider {
  confirm(matchId: string): Promise<ScoreSanitySnapshot | null>;
}
