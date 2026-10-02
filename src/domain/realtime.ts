export const REALTIME_CHANNELS = {
  matchEvent: "playerpulser_match_event",
  priceUpdate: "playerpulser_price_update",
  marketStatus: "playerpulser_market_status",
} as const;

export const NOTIFY_PAYLOAD_LIMIT = 7000;

export type MatchEventMessage = {
  matchId: string;
  playerId: string | null;
  eventId: string;
  publishedAt: string;
};

export type PriceUpdateMessage = {
  playerId: string;
  priceTickId: string;
  publishedAt: string;
};

export type MarketStatusMessage = {
  matchId: string;
  publishedAt: string;
};

export type RealtimeNotice = {
  type: "match-event" | "price" | "market-status";
  playerId: string | null;
  matchId: string | null;
  priceTickId: string | null;
  eventId: string | null;
  publishedAt: string;
};

export interface RealtimePublisher {
  publishMatchEvent(event: MatchEventMessage): void;
  publishPriceUpdate(update: PriceUpdateMessage): void;
  publishMarketStatus(status: MarketStatusMessage): void;
}

const NOTICE_TYPES = new Set<RealtimeNotice["type"]>(["match-event", "price", "market-status"]);

export function compactNotice(notice: RealtimeNotice): string {
  const payload = JSON.stringify({
    type: notice.type,
    playerId: notice.playerId,
    matchId: notice.matchId,
    priceTickId: notice.priceTickId,
    eventId: notice.eventId,
    publishedAt: notice.publishedAt,
  });
  if (payload.length > NOTIFY_PAYLOAD_LIMIT) throw new Error("Realtime notice exceeds the PostgreSQL payload budget");
  return payload;
}

export function parseNotice(payload: string | undefined | null): RealtimeNotice | null {
  if (!payload) return null;
  try {
    const value = JSON.parse(payload) as Partial<RealtimeNotice>;
    if (!value.type || !NOTICE_TYPES.has(value.type) || typeof value.publishedAt !== "string") return null;
    return {
      type: value.type,
      playerId: typeof value.playerId === "string" ? value.playerId : null,
      matchId: typeof value.matchId === "string" ? value.matchId : null,
      priceTickId: typeof value.priceTickId === "string" ? value.priceTickId : null,
      eventId: typeof value.eventId === "string" ? value.eventId : null,
      publishedAt: value.publishedAt,
    };
  } catch {
    return null;
  }
}

export type TransportHealth = "HEALTHY" | "DEGRADED" | "DOWN";

export function listenerHealth(ageMs: number | null): TransportHealth {
  if (ageMs === null) return "DOWN";
  if (ageMs <= 20_000) return "HEALTHY";
  if (ageMs <= 60_000) return "DEGRADED";
  return "DOWN";
}

export function sseHealth(input: { listener: TransportHealth; lastPushAgeMs: number | null }): TransportHealth {
  if (input.lastPushAgeMs !== null && input.lastPushAgeMs <= 30_000) return "HEALTHY";
  if (input.listener === "DOWN") return "DOWN";
  return "DEGRADED";
}

export function sseRetryDelayMs(attempt: number): number {
  const step = Math.max(0, Math.floor(attempt));
  return Math.min(15_000, 1000 * 2 ** step);
}
