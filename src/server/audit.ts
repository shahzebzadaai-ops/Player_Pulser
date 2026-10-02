import { Prisma } from "@prisma/client";
import { AppError } from "@/domain/errors";
import { prisma, type Tx } from "./prisma";

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

export function requireReason(reason: string | undefined | null): string {
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < 3) throw new AppError("REASON_REQUIRED", "Enter a reason before confirming this action.", 400);
  return trimmed;
}

function jsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function writeAudit(
  input: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
    ip?: string | null;
    metadata?: unknown;
  },
  db: Tx = prisma,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: jsonValue(input.before),
      after: jsonValue(input.after),
      reason: input.reason ?? null,
      ip: input.ip ?? null,
      metadata: jsonValue(input.metadata),
    },
  });
}
