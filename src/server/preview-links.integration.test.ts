import { randomUUID } from "crypto";
import { expect, test } from "vitest";
import { hashPreviewToken, PREVIEW_INVALID_MESSAGE, PREVIEW_USED_MESSAGE } from "@/domain/launch-shield";
import { prisma } from "@/server/prisma";
import { consumePreviewLink, createPreviewLink, revokePreviewLink } from "@/server/preview-links";

test("preview links are hashed, single use, and expire from activation", async () => {
  const admin = await prisma.user.create({
    data: { email: `preview-admin-${randomUUID()}@playerpulser.test`, displayName: "Preview Admin", role: "ADMIN" },
  });
  const investor = await prisma.user.create({
    data: { email: `preview-investor-${randomUUID()}@playerpulser.test`, displayName: "Preview Investor", role: "CUSTOMER" },
  });
  const created = await createPreviewLink({ adminId: admin.id, label: "Desk", origin: "https://playerpulser.com" });
  const raw = created.url.split("/preview/")[1] ?? "";
  expect(raw.length).toBeGreaterThanOrEqual(43);
  const stored = await prisma.investorPreviewToken.findUniqueOrThrow({ where: { id: created.id } });
  expect(stored.tokenHash).toBe(hashPreviewToken(raw));
  const { tokenHash, ...storedWithoutHash } = stored;
  expect(tokenHash).not.toBe(raw);
  expect(JSON.stringify(storedWithoutHash)).not.toContain(raw);
  expect(created.expiresAt.getTime() - stored.createdAt.getTime()).toBeGreaterThanOrEqual(14 * 60 * 1000);

  await prisma.investorPreviewToken.update({
    where: { id: created.id },
    data: { expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
  });
  const opened = await consumePreviewLink({ rawToken: raw, startDemo: async () => investor.id });
  expect(opened.ok).toBe(true);
  if (!opened.ok) return;
  expect(opened.expiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
  expect(opened.cookieValue).not.toContain(raw);
  const again = await consumePreviewLink({ rawToken: raw, startDemo: async () => investor.id });
  expect(again.ok).toBe(false);
  if (!again.ok) expect(again.message).toBe(PREVIEW_USED_MESSAGE);

  const expired = await createPreviewLink({ adminId: admin.id, origin: "https://playerpulser.com" });
  const expiredRaw = expired.url.split("/preview/")[1] ?? "";
  await prisma.investorPreviewToken.update({
    where: { id: expired.id },
    data: { expiresAt: new Date(Date.now() - 1_000) },
  });
  const expiredResult = await consumePreviewLink({ rawToken: expiredRaw, startDemo: async () => investor.id });
  expect(expiredResult.ok).toBe(false);
  if (!expiredResult.ok) expect(expiredResult.message).toBe(PREVIEW_INVALID_MESSAGE);

  const revoked = await createPreviewLink({ adminId: admin.id, origin: "https://playerpulser.com" });
  await revokePreviewLink({ id: revoked.id, adminId: admin.id });
  const revokedRaw = revoked.url.split("/preview/")[1] ?? "";
  const revokedResult = await consumePreviewLink({ rawToken: revokedRaw, startDemo: async () => investor.id });
  expect(revokedResult.ok).toBe(false);
  if (!revokedResult.ok) expect(revokedResult.message).toBe(PREVIEW_INVALID_MESSAGE);

  const audits = await prisma.auditLog.findMany({
    where: { entityType: "InvestorPreviewToken", entityId: { in: [created.id, expired.id, revoked.id] } },
  });
  const auditText = JSON.stringify(audits);
  expect(auditText).not.toContain(raw);
  expect(auditText).toContain("INVESTOR_PREVIEW_LINK_CREATED");
  expect(auditText).toContain("INVESTOR_PREVIEW_LINK_USED");
  expect(auditText).toContain("INVESTOR_PREVIEW_LINK_REVOKED");
  expect(auditText).toContain("INVESTOR_PREVIEW_LINK_EXPIRED");
});
