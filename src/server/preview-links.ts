import { randomBytes } from "crypto";
import { AppError } from "@/domain/errors";
import {
  hashPreviewToken,
  PREVIEW_INVALID_MESSAGE,
  PREVIEW_TOKEN_BYTES,
  PREVIEW_TTL_MS,
  PREVIEW_USED_MESSAGE,
  previewLinkStatus,
  signPreviewCookie,
  unusedLinkExpiresAt,
} from "@/domain/launch-shield";
import { writeAudit } from "./audit";
import { issueSession } from "./auth";
import { prisma } from "./prisma";

export async function createPreviewLink(input: { adminId: string; label?: string | null; ip?: string | null; origin: string }) {
  const raw = randomBytes(PREVIEW_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashPreviewToken(raw);
  const label = input.label?.trim() ? input.label.trim().slice(0, 80) : null;
  const createdAt = new Date();
  const expiresAt = unusedLinkExpiresAt(createdAt);
  const row = await prisma.investorPreviewToken.create({
    data: {
      tokenHash,
      createdByAdminId: input.adminId,
      label,
      expiresAt,
      createdIp: input.ip ?? null,
    },
  });
  await writeAudit({
    actorId: input.adminId,
    action: "INVESTOR_PREVIEW_LINK_CREATED",
    entityType: "InvestorPreviewToken",
    entityId: row.id,
    ip: input.ip ?? null,
    metadata: { label, expiresAt: expiresAt.toISOString() },
  });
  return {
    id: row.id,
    url: `${input.origin.replace(/\/$/, "")}/preview/${raw}`,
    expiresAt,
  };
}

export async function listPreviewLinks() {
  const rows = await prisma.investorPreviewToken.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      label: true,
      createdAt: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
    },
  });
  const now = new Date();
  return rows.map((row) => ({ ...row, status: previewLinkStatus(row, now) }));
}

export async function revokePreviewLink(input: { id: string; adminId: string; ip?: string | null }) {
  const row = await prisma.investorPreviewToken.findUnique({ where: { id: input.id } });
  if (!row) throw new AppError("NOT_FOUND", "That preview link was not found.", 404);
  if (previewLinkStatus(row, new Date()) !== "ACTIVE") {
    throw new AppError("INVALID", "Only an unused link can be revoked.", 400);
  }
  await prisma.investorPreviewToken.update({
    where: { id: row.id },
    data: { revokedAt: new Date() },
  });
  await writeAudit({
    actorId: input.adminId,
    action: "INVESTOR_PREVIEW_LINK_REVOKED",
    entityType: "InvestorPreviewToken",
    entityId: row.id,
    ip: input.ip ?? null,
    metadata: { label: row.label },
  });
}

export async function consumePreviewLink(input: {
  rawToken: string;
  usedIp?: string | null;
  startDemo: () => Promise<string>;
}): Promise<
  | { ok: true; cookieValue: string; sessionToken: string; expiresAt: Date }
  | { ok: false; status: number; message: string }
> {
  const tokenHash = hashPreviewToken(input.rawToken);
  const now = new Date();
  const claimed = await prisma.investorPreviewToken.updateMany({
    where: { tokenHash, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now, usedIp: input.usedIp ?? null },
  });
  if (claimed.count !== 1) {
    const row = await prisma.investorPreviewToken.findUnique({ where: { tokenHash } });
    if (row?.usedAt) return { ok: false, status: 410, message: PREVIEW_USED_MESSAGE };
    if (row && previewLinkStatus(row, now) === "EXPIRED") {
      await writeAudit({
        actorId: row.createdByAdminId,
        action: "INVESTOR_PREVIEW_LINK_EXPIRED",
        entityType: "InvestorPreviewToken",
        entityId: row.id,
        ip: input.usedIp ?? null,
        metadata: { expiresAt: row.expiresAt.toISOString() },
      });
    }
    return { ok: false, status: 404, message: PREVIEW_INVALID_MESSAGE };
  }
  const row = await prisma.investorPreviewToken.findUniqueOrThrow({ where: { tokenHash } });
  const userId = await input.startDemo();
  const session = await issueSession(userId, PREVIEW_TTL_MS);
  await writeAudit({
    actorId: userId,
    action: "INVESTOR_PREVIEW_LINK_USED",
    entityType: "InvestorPreviewToken",
    entityId: row.id,
    ip: input.usedIp ?? null,
    metadata: { sessionExpiresAt: session.expiresAt.toISOString() },
  });
  return {
    ok: true,
    cookieValue: signPreviewCookie(session.token, session.expiresAt.getTime()),
    sessionToken: session.token,
    expiresAt: session.expiresAt,
  };
}
