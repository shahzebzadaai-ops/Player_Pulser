import { Client } from "pg";
import {
  compactNotice,
  parseNotice,
  REALTIME_CHANNELS,
  type MarketStatusMessage,
  type MatchEventMessage,
  type PriceUpdateMessage,
  type RealtimeNotice,
  type RealtimePublisher,
} from "@/domain/realtime";
import { markOps } from "./ops-status";
import { prisma } from "./prisma";
import { publicPricePayload } from "./queries";

const LISTENER_AT = "ops.realtimeListenerAt";
const SSE_LAST_PUSH = "ops.sseLastPushAt";

type NoticeHandler = (notice: RealtimeNotice) => void;
type SseClient = { enqueue: (chunk: Uint8Array) => void };

const handlers = new Set<NoticeHandler>();
const clients = new Set<SseClient>();
const encoder = new TextEncoder();

type ListenerSlot = { owner: object; stop: () => Promise<void> };

const listenerOwner = {};
const listenerSlot = globalThis as unknown as { ppRealtimeListener?: ListenerSlot };

let stopped = false;
let generation = 0;
let client: Client | null = null;
let starting: Promise<void> | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let reconnecting = false;
let delayMs = 1000;
let lastSseMark = 0;
let pushRunning = false;
let pushPending = false;
let heartbeatRunning = false;

function logFailure(error: unknown): void {
  console.error(JSON.stringify({
    level: "error",
    message: error instanceof Error ? error.message : "realtime notify failed",
    at: new Date().toISOString(),
  }));
}

async function notify(channel: string, notice: RealtimeNotice): Promise<void> {
  const payload = compactNotice(notice);
  try {
    await prisma.$executeRaw`SELECT pg_notify(${channel}, ${payload})`;
  } catch (error) {
    logFailure(error);
  }
}

export const realtime: RealtimePublisher = {
  publishMatchEvent(event: MatchEventMessage): void {
    void notify(REALTIME_CHANNELS.matchEvent, {
      type: "match-event",
      playerId: event.playerId,
      matchId: event.matchId,
      priceTickId: null,
      eventId: event.eventId,
      publishedAt: event.publishedAt,
    });
  },
  publishPriceUpdate(update: PriceUpdateMessage): void {
    void notify(REALTIME_CHANNELS.priceUpdate, {
      type: "price",
      playerId: update.playerId,
      matchId: null,
      priceTickId: update.priceTickId,
      eventId: null,
      publishedAt: update.publishedAt,
    });
  },
  publishMarketStatus(status: MarketStatusMessage): void {
    void notify(REALTIME_CHANNELS.marketStatus, {
      type: "market-status",
      playerId: null,
      matchId: status.matchId,
      priceTickId: null,
      eventId: null,
      publishedAt: status.publishedAt,
    });
  },
};

export async function publishMatchEvent(event: MatchEventMessage): Promise<void> {
  await notify(REALTIME_CHANNELS.matchEvent, {
    type: "match-event",
    playerId: event.playerId,
    matchId: event.matchId,
    priceTickId: null,
    eventId: event.eventId,
    publishedAt: event.publishedAt,
  });
}

export async function publishPriceUpdate(update: PriceUpdateMessage): Promise<void> {
  await notify(REALTIME_CHANNELS.priceUpdate, {
    type: "price",
    playerId: update.playerId,
    matchId: null,
    priceTickId: update.priceTickId,
    eventId: null,
    publishedAt: update.publishedAt,
  });
}

export async function publishMarketStatus(status: MarketStatusMessage): Promise<void> {
  await notify(REALTIME_CHANNELS.marketStatus, {
    type: "market-status",
    playerId: null,
    matchId: status.matchId,
    priceTickId: null,
    eventId: null,
    publishedAt: status.publishedAt,
  });
}

export function onRealtimeNotice(handler: NoticeHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

function emit(notice: RealtimeNotice): void {
  for (const handler of handlers) handler(notice);
}

export function addSseClient(enqueue: (chunk: Uint8Array) => void): () => void {
  const sse: SseClient = { enqueue };
  clients.add(sse);
  return () => clients.delete(sse);
}

async function noteSsePush(): Promise<void> {
  const now = Date.now();
  if (now - lastSseMark < 5_000) return;
  lastSseMark = now;
  await markOps(SSE_LAST_PUSH);
}

function scheduleAuthoritativePush(): void {
  pushPending = true;
  if (pushRunning) return;
  pushRunning = true;
  void (async () => {
    try {
      while (pushPending) {
        pushPending = false;
        await pushAuthoritativePrices();
      }
    } catch (error) {
      logFailure(error);
    } finally {
      pushRunning = false;
    }
  })();
}

export async function pushAuthoritativePrices(): Promise<void> {
  if (clients.size === 0) return;
  const payload = await publicPricePayload();
  const frame = encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
  for (const sse of clients) {
    try {
      sse.enqueue(frame);
    } catch {
      clients.delete(sse);
    }
  }
  await noteSsePush();
}

export async function noteCustomerStream(): Promise<void> {
  await noteSsePush();
}

async function fail(fromGeneration: number): Promise<void> {
  if (stopped || fromGeneration !== generation || reconnecting) return;
  reconnecting = true;
  generation += 1;
  const current = client;
  client = null;
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  try {
    await current?.end();
  } catch {
    /* the connection is already gone */
  }
  const wait = delayMs;
  delayMs = Math.min(delayMs * 2, 15_000);
  await new Promise((resolve) => setTimeout(resolve, wait));
  if (stopped) {
    reconnecting = false;
    return;
  }
  try {
    await connectListener();
    delayMs = 1000;
  } catch (error) {
    logFailure(error);
    reconnecting = false;
    void fail(generation);
    return;
  }
  reconnecting = false;
}

async function connectListener(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for the realtime listener");
  const next = new Client({ connectionString: url });
  const localGeneration = generation;
  next.on("error", () => {
    void fail(localGeneration);
  });
  next.on("end", () => {
    void fail(localGeneration);
  });
  next.on("notification", (message) => {
    const notice = parseNotice(message.payload);
    if (!notice) return;
    emit(notice);
    scheduleAuthoritativePush();
  });
  await next.connect();
  await next.query(`LISTEN ${REALTIME_CHANNELS.matchEvent}`);
  await next.query(`LISTEN ${REALTIME_CHANNELS.priceUpdate}`);
  await next.query(`LISTEN ${REALTIME_CHANNELS.marketStatus}`);
  client = next;
  await markOps(LISTENER_AT);
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = setInterval(() => {
    if (heartbeatRunning) return;
    heartbeatRunning = true;
    void markOps(LISTENER_AT).catch(logFailure).finally(() => {
      heartbeatRunning = false;
    });
  }, 10_000);
}

export async function startRealtimeListener(): Promise<void> {
  const previous = listenerSlot.ppRealtimeListener;
  if (previous && previous.owner !== listenerOwner) {
    listenerSlot.ppRealtimeListener = undefined;
    await previous.stop();
  }
  if (client || reconnecting) return;
  if (starting) return starting;
  stopped = false;
  starting = connectListener().finally(() => {
    starting = null;
  });
  listenerSlot.ppRealtimeListener = { owner: listenerOwner, stop: stopRealtimeListener };
  await starting;
}

export async function stopRealtimeListener(): Promise<void> {
  stopped = true;
  generation += 1;
  reconnecting = false;
  if (listenerSlot.ppRealtimeListener?.owner === listenerOwner) listenerSlot.ppRealtimeListener = undefined;
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  const current = client;
  client = null;
  if (current) await current.end().catch(() => undefined);
}
