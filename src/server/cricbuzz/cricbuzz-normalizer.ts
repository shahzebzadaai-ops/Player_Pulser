/**
 * Parsed Cricbuzz deliveries become the existing normalized event schema.
 * Pricing never sees the provider payload.
 */

import type { FeedEventType, NormalizedCricketEvent } from "@/domain/cricket-feed";
import type { ParsedCommentary, ParsedDelivery } from "./cricbuzz-parser";

const CODE: Record<string, FeedEventType> = {
  "0": "DOT_BALL",
  DOT: "DOT_BALL",
  NONE: "DOT_BALL",
  "1": "SINGLE",
  ONE: "SINGLE",
  SINGLE: "SINGLE",
  "2": "DOUBLE",
  "3": "TRIPLE",
  "4": "FOUR",
  FOUR: "FOUR",
  "6": "SIX",
  SIX: "SIX",
  W: "WICKET",
  WICKET: "WICKET",
  FIFTY: "FIFTY",
  "50": "FIFTY",
  CENTURY: "CENTURY",
  "100": "CENTURY",
  WIDE: "WIDE",
  NOBALL: "NO_BALL",
  NO_BALL: "NO_BALL",
  BYE: "BYE",
  LEGBYE: "LEG_BYE",
  LEG_BYE: "LEG_BYE",
};

function eventTypeOf(delivery: ParsedDelivery): FeedEventType | null {
  const coded = CODE[delivery.eventCode];
  if (coded) return coded;
  const text = delivery.text.toLowerCase();
  if (text.includes("run out")) return "WICKET";
  if (/\bsix\b/.test(text)) return "SIX";
  if (/\bfour\b/.test(text)) return "FOUR";
  if (text.includes("fifty") || text.includes("half-century")) return "FIFTY";
  if (/\bcentury\b/.test(text) || text.includes("hundred")) return "CENTURY";
  if (text.includes("wicket") || text.startsWith("out")) return "WICKET";
  return null;
}

function wicketTypeOf(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("run out")) return "RUN_OUT";
  if (lower.includes("caught") || lower.includes("catch")) return "CAUGHT";
  if (lower.includes("lbw")) return "LBW";
  if (lower.includes("stumped")) return "STUMPED";
  return "BOWLED";
}

function deliverySourceId(externalMatchId: string, delivery: ParsedDelivery, eventType: FeedEventType): string {
  const ballKey = `${delivery.innings}:${delivery.over}.${delivery.ball}`;
  if (eventType === "FIFTY" || eventType === "CENTURY") {
    return `cb:${externalMatchId}:${ballKey}:${eventType}:${delivery.batterId ?? "player"}`;
  }
  return `cb:${externalMatchId}:${ballKey}`;
}

export type UnclassifiedProviderEvent = {
  matchId: string;
  source: "Cricbuzz";
  innings: number;
  over: number;
  ball: number;
  sequence: number;
  providerCode: string;
  rawDescription: string;
  sourceEventId: string;
  sourceTimestamp: string | null;
};

export function partitionCommentary(matchId: string, parsed: ParsedCommentary, now: Date): {
  events: NormalizedCricketEvent[];
  unclassified: UnclassifiedProviderEvent[];
} {
  const events: NormalizedCricketEvent[] = [];
  const unclassified: UnclassifiedProviderEvent[] = [];
  for (const delivery of parsed.deliveries) {
    const eventType = eventTypeOf(delivery);
    if (!eventType) {
      const providerCode = delivery.eventCode || "UNCLASSIFIED";
      unclassified.push({
        matchId,
        source: "Cricbuzz",
        innings: delivery.innings,
        over: delivery.over,
        ball: delivery.ball,
        sequence: delivery.sequence,
        providerCode,
        rawDescription: delivery.text.slice(0, 500),
        sourceEventId: `cb:${parsed.externalMatchId}:${delivery.innings}:${delivery.over}.${delivery.ball}:unclassified:${delivery.sequence}:${providerCode}`,
        sourceTimestamp: delivery.timestamp,
      });
      continue;
    }
    const wicketType = eventType === "WICKET" ? wicketTypeOf(delivery.text) : null;
    const runsBatter = eventType === "SINGLE" ? 1 : eventType === "DOUBLE" ? 2 : eventType === "TRIPLE" ? 3 : eventType === "FOUR" ? 4 : eventType === "SIX" ? 6 : 0;
    const runsExtras = eventType === "WIDE" || eventType === "NO_BALL" || eventType === "BYE" || eventType === "LEG_BYE" ? 1 : 0;
    const occurredAt = delivery.timestamp ?? now.toISOString();
    events.push({
      matchId,
      innings: delivery.innings,
      over: delivery.over,
      ball: delivery.ball,
      sequence: delivery.sequence,
      occurredAt,
      eventType,
      battingPlayerId: null,
      bowlingPlayerId: null,
      fielderPlayerIds: [],
      battingExternalId: delivery.batterId,
      bowlingExternalId: delivery.bowlerId,
      fielderExternalIds: [],
      battingName: delivery.batterName,
      bowlingName: delivery.bowlerName,
      runsBatter,
      runsExtras,
      runsTotal: runsBatter + runsExtras,
      wicketType,
      isBoundary: eventType === "FOUR" || eventType === "SIX",
      isSix: eventType === "SIX",
      isFour: eventType === "FOUR",
      rawDescription: delivery.text.slice(0, 500),
      normalizedDescription: `${eventType.replaceAll("_", " ").toLowerCase()} at ${delivery.over}.${delivery.ball}`,
      source: "Cricbuzz",
      sourceEventId: deliverySourceId(parsed.externalMatchId, delivery, eventType),
      sourceTimestamp: delivery.timestamp,
      confidence: delivery.eventCode ? 90 : 60,
    });
  }
  return { events, unclassified };
}

export function normalizeCommentary(matchId: string, parsed: ParsedCommentary, now: Date): NormalizedCricketEvent[] {
  return partitionCommentary(matchId, parsed, now).events;
}
