/**
 * Parsed CREX balls become the shared normalized event.
 */

import type { FeedEventType, NormalizedCricketEvent } from "@/domain/cricket-feed";
import type { CrexBall } from "./crex-parser";

function namesOf(commentary: string): { bowler: string; batter: string } {
  const parts = commentary.split(/\s+to\s+/i);
  return {
    bowler: parts[0]?.trim() ?? "",
    batter: parts[1]?.split(",")[0]?.trim() ?? "",
  };
}

function eventOf(ball: CrexBall): { eventType: FeedEventType; runs: number; wicketType: string | null } | null {
  const detail = `${ball.commentary} ${ball.detail}`.toLowerCase();
  const token = ball.runsText.trim().toUpperCase();
  if (ball.kind === "w" || token === "W" || detail.includes("wicket") || detail.includes("run out") || detail.includes("stumped")) {
    const wicketType = detail.includes("run out") ? "RUN_OUT" : detail.includes("stumped") || detail.includes("stumping") ? "STUMPED" : detail.includes("lbw") ? "LBW" : detail.includes("caught") ? "CAUGHT" : "BOWLED";
    return { eventType: "WICKET", runs: Number(ball.runsText) || 0, wicketType };
  }
  if (ball.kind === "wd" || detail.includes("wide")) return { eventType: "WIDE", runs: Number(ball.runsText) || 1, wicketType: null };
  if (ball.kind === "nb" || detail.includes("no ball")) return { eventType: "NO_BALL", runs: Number(ball.runsText) || 1, wicketType: null };
  if (detail.includes("leg bye")) return { eventType: "LEG_BYE", runs: Number(ball.runsText) || 1, wicketType: null };
  if (detail.includes("bye")) return { eventType: "BYE", runs: Number(ball.runsText) || 1, wicketType: null };
  const runs = Number(ball.runsText);
  if (!Number.isInteger(runs) || runs < 0) return null;
  if (runs === 0) return { eventType: "DOT_BALL", runs, wicketType: null };
  if (runs === 1) return { eventType: "SINGLE", runs, wicketType: null };
  if (runs === 2) return { eventType: "DOUBLE", runs, wicketType: null };
  if (runs === 3) return { eventType: "TRIPLE", runs, wicketType: null };
  if (runs === 4) return { eventType: "FOUR", runs, wicketType: null };
  if (runs === 6) return { eventType: "SIX", runs, wicketType: null };
  return null;
}

export function normalizeCrexBalls(matchId: string, balls: CrexBall[], now: Date): NormalizedCricketEvent[] {
  const events: NormalizedCricketEvent[] = [];
  balls.forEach((ball, index) => {
    const mapped = eventOf(ball);
    if (!mapped) return;
    const names = namesOf(ball.commentary);
    const stamp = ball.timestampMs ? new Date(ball.timestampMs).toISOString() : now.toISOString();
    events.push({
      matchId,
      innings: ball.innings,
      over: ball.over,
      ball: ball.ball,
      sequence: index + 1,
      occurredAt: stamp,
      eventType: mapped.eventType,
      battingPlayerId: null,
      bowlingPlayerId: null,
      fielderPlayerIds: [],
      battingExternalId: ball.batterId || null,
      bowlingExternalId: ball.bowlerId || null,
      fielderExternalIds: [],
      battingName: names.batter || null,
      bowlingName: names.bowler || null,
      runsBatter: mapped.eventType === "WIDE" || mapped.eventType === "NO_BALL" || mapped.eventType === "BYE" || mapped.eventType === "LEG_BYE" ? 0 : mapped.runs,
      runsExtras: mapped.eventType === "WIDE" || mapped.eventType === "NO_BALL" || mapped.eventType === "BYE" || mapped.eventType === "LEG_BYE" ? mapped.runs : 0,
      runsTotal: mapped.runs,
      wicketType: mapped.wicketType,
      isBoundary: mapped.eventType === "FOUR" || mapped.eventType === "SIX",
      isFour: mapped.eventType === "FOUR",
      isSix: mapped.eventType === "SIX",
      rawDescription: ball.commentary || null,
      normalizedDescription: `${mapped.eventType} ${ball.over}.${ball.ball}`,
      source: "CREX",
      sourceEventId: `crex:${ball.matchKey}:${ball.id}`,
      sourceTimestamp: stamp,
      confidence: 80,
    });
  });
  return events;
}
