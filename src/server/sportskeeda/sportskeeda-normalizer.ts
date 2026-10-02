/**
 * Parsed Sportskeeda deliveries become the shared normalized event.
 */

import type { FeedEventType, NormalizedCricketEvent } from "@/domain/cricket-feed";
import type { SportskeedaDelivery } from "./sportskeeda-parser";

function eventOf(delivery: SportskeedaDelivery): { eventType: FeedEventType; wicketType: string | null } | null {
  const text = delivery.text.toLowerCase();
  if (delivery.kind === "wicket" || text.includes("run out") || text.includes("stumping") || text.includes("cleaned up")) {
    const wicketType = text.includes("run out") ? "RUN_OUT" : text.includes("stumping") || text.includes("stumped") ? "STUMPED" : text.includes("lbw") ? "LBW" : text.includes("caught") ? "CAUGHT" : "BOWLED";
    return { eventType: "WICKET", wicketType };
  }
  if (delivery.kind === "wide") return { eventType: "WIDE", wicketType: null };
  if (delivery.kind === "no_ball") return { eventType: "NO_BALL", wicketType: null };
  if (delivery.kind === "leg_bye") return { eventType: "LEG_BYE", wicketType: null };
  if (delivery.kind === "bye") return { eventType: "BYE", wicketType: null };
  if (delivery.runs === 4 || /\bfour\b/.test(text)) return { eventType: "FOUR", wicketType: null };
  if (delivery.runs === 6 || /\bsix\b/.test(text)) return { eventType: "SIX", wicketType: null };
  if (delivery.runs === 0) return { eventType: "DOT_BALL", wicketType: null };
  if (delivery.runs === 1) return { eventType: "SINGLE", wicketType: null };
  if (delivery.runs === 2) return { eventType: "DOUBLE", wicketType: null };
  if (delivery.runs === 3) return { eventType: "TRIPLE", wicketType: null };
  return null;
}

export function normalizeSportskeedaDeliveries(matchId: string, deliveries: SportskeedaDelivery[], now: Date): NormalizedCricketEvent[] {
  const events: NormalizedCricketEvent[] = [];
  deliveries.forEach((delivery, index) => {
    const mapped = eventOf(delivery);
    if (!mapped) return;
    const stamp = delivery.timestampMs ? new Date(delivery.timestampMs).toISOString() : now.toISOString();
    const extra = mapped.eventType === "WIDE" || mapped.eventType === "NO_BALL" || mapped.eventType === "BYE" || mapped.eventType === "LEG_BYE";
    events.push({
      matchId,
      innings: delivery.innings,
      over: delivery.over,
      ball: delivery.ball,
      sequence: index + 1,
      occurredAt: stamp,
      eventType: mapped.eventType,
      battingPlayerId: null,
      bowlingPlayerId: null,
      fielderPlayerIds: [],
      battingExternalId: null,
      bowlingExternalId: null,
      fielderExternalIds: [],
      battingName: delivery.batter || null,
      bowlingName: delivery.bowler || null,
      runsBatter: extra || mapped.eventType === "WICKET" ? 0 : delivery.runs,
      runsExtras: extra ? delivery.runs : 0,
      runsTotal: delivery.runs,
      wicketType: mapped.wicketType,
      isBoundary: mapped.eventType === "FOUR" || mapped.eventType === "SIX",
      isFour: mapped.eventType === "FOUR",
      isSix: mapped.eventType === "SIX",
      rawDescription: delivery.text,
      normalizedDescription: `${mapped.eventType} ${delivery.over}.${delivery.ball}`,
      source: "Sportskeeda",
      sourceEventId: `sk:${delivery.slug}:${delivery.innings}:${delivery.over}.${delivery.ball}`,
      sourceTimestamp: stamp,
      confidence: 80,
    });
  });
  return events;
}
