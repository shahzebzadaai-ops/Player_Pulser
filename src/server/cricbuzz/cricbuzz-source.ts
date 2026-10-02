/**
 * Cricbuzz adapter. It returns only normalized cricket events.
 */

import type { FeedRecoveryCursor, LiveCricketSource, NormalizedCricketEvent, PollMatch } from "@/domain/cricket-feed";
import { boundRecovery } from "@/domain/feed-continuity";
import { cricbuzzClient, type CricbuzzTransport } from "./cricbuzz-client";
import { partitionCommentary, type UnclassifiedProviderEvent } from "./cricbuzz-normalizer";
import { parseCommentary, parseMatchList, type DiscoveredMatchDraft, type ParsedScore } from "./cricbuzz-parser";

export class CricbuzzLiveSource implements LiveCricketSource {
  readonly source = "Cricbuzz" as const;
  private unclassified: UnclassifiedProviderEvent[] = [];

  constructor(private readonly transport: CricbuzzTransport = cricbuzzClient) {}

  drainUnclassified(): UnclassifiedProviderEvent[] {
    const rows = this.unclassified;
    this.unclassified = [];
    return rows;
  }

  private retain(matchId: string, payload: unknown, externalMatchId: string, now: Date): NormalizedCricketEvent[] {
    const split = partitionCommentary(matchId, parseCommentary(payload, externalMatchId), now);
    this.unclassified.push(...split.unclassified);
    return split.events;
  }

  async poll(input: { matches: PollMatch[]; now: Date }): Promise<NormalizedCricketEvent[]> {
    if (input.matches.length === 0) return [];
    const events: NormalizedCricketEvent[] = [];
    for (const match of input.matches) {
      if (!match.externalMatchId) continue;
      const payload = await this.transport.getCommentary(match.externalMatchId);
      events.push(...this.retain(match.matchId, payload, match.externalMatchId, input.now));
    }
    return events;
  }

  async discover(): Promise<DiscoveredMatchDraft[]> {
    return parseMatchList(await this.transport.getMatchList());
  }

  async recoverEvents(input: { match: PollMatch; cursor: FeedRecoveryCursor | null; now: Date }): Promise<NormalizedCricketEvent[]> {
    if (!input.match.externalMatchId || !input.cursor) return [];
    const payload = await this.transport.getCommentary(input.match.externalMatchId);
    const events = this.retain(input.match.matchId, payload, input.match.externalMatchId, input.now);
    return boundRecovery(events, input.cursor);
  }

  async readScore(externalMatchId: string): Promise<{ status: string; innings: number | null; score: ParsedScore | null }> {
    const parsed = parseCommentary(await this.transport.getCommentary(externalMatchId), externalMatchId);
    return { status: parsed.providerStatus, innings: parsed.innings, score: parsed.score };
  }
}
