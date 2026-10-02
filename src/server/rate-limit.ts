import { AppError } from "@/domain/errors";
import { prisma } from "./prisma";

export async function consumeDurableRate(input: {
  action: string;
  subject: string;
  windowMs: number;
  max: number;
  now?: number;
}): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = input.now ?? Date.now();
  const windowStartMs = now - (now % input.windowMs);
  const windowStart = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + input.windowMs);
  await prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  const row = await prisma.rateLimitBucket.upsert({
    where: { action_subject_windowStart: { action: input.action, subject: input.subject, windowStart } },
    create: { action: input.action, subject: input.subject, windowStart, hits: 1, expiresAt },
    update: { hits: { increment: 1 } },
  });
  const retryAfterSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000));
  if (row.hits > input.max) return { allowed: false, retryAfterSeconds };
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function assertDurableRate(action: string, subject: string, windowMs: number, max: number): Promise<void> {
  const result = await consumeDurableRate({ action, subject, windowMs, max });
  if (!result.allowed) {
    throw new AppError("RATE_LIMIT", "Wait a moment before trying again.", 429, { retryAfter: String(result.retryAfterSeconds) });
  }
}
