/**
 * CREX adapter. It polls the public pages and returns normalized events.
 */

import type { LiveCricketSource, NormalizedCricketEvent, PollMatch } from "@/domain/cricket-feed";
import { createCrexClient } from "./crex-client";
import { BALL_FEED_URL, crexMatchPaths, extractEmbeddedJson, parseCrexBalls } from "./crex-parser";
import { normalizeCrexBalls } from "./crex-normalizer";

export class CrexLiveSource implements LiveCricketSource {
  readonly source = "CREX" as const;

  constructor(private readonly client = createCrexClient()) {}

  async poll(input: { matches: PollMatch[]; now: Date }): Promise<NormalizedCricketEvent[]> {
    const events: NormalizedCricketEvent[] = [];
    if (input.matches.length === 0) return events;
    const list = await this.client.getLivePage();
    const paths = crexMatchPaths(list);
    for (const match of input.matches) {
      const key = match.externalMatchId ?? "";
      const path = paths.find((item) => item.key === key)?.path;
      if (!path) continue;
      const page = await this.client.getMatchPage(path);
      const payload = extractEmbeddedJson(page, BALL_FEED_URL);
      events.push(...normalizeCrexBalls(match.matchId, parseCrexBalls(payload), input.now));
    }
    return events;
  }
}
