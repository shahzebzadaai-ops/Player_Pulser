import Redis from "ioredis";

let client: Redis | null = null;
let disabled = false;

export function getRedis(): Redis | null {
  if (disabled) return null;
  if (!process.env.REDIS_URL) return null;
  if (client) return client;
  const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy: (times) => (times > 2 ? null : 200),
  });
  redis.on("error", () => {
    disabled = true;
  });
  client = redis;
  return client;
}

export async function redisOk(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    if (redis.status === "wait") await redis.connect();
    const pong = await redis.ping();
    return pong === "PONG";
  } catch {
    disabled = true;
    return false;
  }
}

export async function writePriceCache(payload: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    if (redis.status === "wait") await redis.connect();
    await redis.set("prices:snapshot", payload, "EX", 30);
  } catch {
    disabled = true;
  }
}

export async function readPriceCache(): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    if (redis.status === "wait") await redis.connect();
    return await redis.get("prices:snapshot");
  } catch {
    disabled = true;
    return null;
  }
}
