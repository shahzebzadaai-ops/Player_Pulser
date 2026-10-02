/**
 * Sportskeeda adapter. It returns normalized events only.
 */

import type { LiveCricketSource, NormalizedCricketEvent, PollMatch } from "@/domain/cricket-feed";
import { createSportskeedaClient } from "./sportskeeda-client";
import { parseSportskeedaCommentary } from "./sportskeeda-parser";
import { normalizeSportskeedaDeliveries } from "./sportskeeda-normalizer";

export class SportskeedaLiveSource implements LiveCricketSource {
  readonly source = "Sportskeeda" as const;

  constructor(private readonly client = createSportskeedaClient()) {}

  async poll(input: { matches: PollMatch[]; now: Date }): Promise<NormalizedCricketEvent[]> {
    const events: NormalizedCricketEvent[] = [];
    for (const match of input.matches) {
      if (!match.externalMatchId) continue;
      const payload = await this.client.getCommentary(match.externalMatchId);
      events.push(...normalizeSportskeedaDeliveries(match.matchId, parseSportskeedaCommentary(payload), input.now));
    }
    return events;
  }
}
