import type { Banner, BannerPlacement, BannerStatus, Prisma } from "@prisma/client";
import { AppError } from "@/domain/errors";
import { BANNER_PLACEMENTS, effectiveBannerStatus, statusAfterPublish } from "@/domain/banners";
import { prisma, type Tx } from "./prisma";
import { writeAudit } from "./audit";

export type BannerInput = {
  name: string;
  placement: string;
  headline: string;
  subtitle?: string;
  imageId?: string | null;
  mobileImageId?: string | null;
  ctaLabel?: string;
  ctaDestination?: string;
  altText?: string;
  startAt?: string | null;
  endAt?: string | null;
  sortOrder?: number;
};

function placementOf(value: string): BannerPlacement {
  if (!(BANNER_PLACEMENTS as readonly string[]).includes(value)) throw new AppError("INVALID", "Choose a banner placement.", 400);
  return value as BannerPlacement;
}

function when(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError("INVALID", "Enter a valid date.", 400);
  return date;
}

export function bannerSnapshot(banner: Banner) {
  return {
    name: banner.name,
    placement: banner.placement,
    headline: banner.headline,
    subtitle: banner.subtitle,
    imageId: banner.imageId,
    mobileImageId: banner.mobileImageId,
    ctaLabel: banner.ctaLabel,
    ctaDestination: banner.ctaDestination,
    altText: banner.altText,
    status: banner.status,
    startAt: banner.startAt?.toISOString() ?? null,
    endAt: banner.endAt?.toISOString() ?? null,
    sortOrder: banner.sortOrder,
    publishedAt: banner.publishedAt?.toISOString() ?? null,
  };
}

async function remember(tx: Tx, banner: Banner, actorId: string) {
  await tx.bannerRevision.create({
    data: { bannerId: banner.id, actorId, snapshot: bannerSnapshot(banner) },
  });
}

function dataFrom(input: BannerInput, actorId: string): Prisma.BannerUncheckedUpdateInput {
  return {
    name: input.name.trim(),
    placement: placementOf(input.placement),
    headline: input.headline.trim(),
    subtitle: (input.subtitle ?? "").trim(),
    imageId: input.imageId ?? null,
    mobileImageId: input.mobileImageId ?? null,
    ctaLabel: (input.ctaLabel ?? "").trim(),
    ctaDestination: (input.ctaDestination ?? "").trim(),
    altText: (input.altText ?? "").trim(),
    startAt: when(input.startAt ?? null),
    endAt: when(input.endAt ?? null),
    sortOrder: input.sortOrder ?? 0,
    updatedById: actorId,
  };
}

export async function createBanner(input: BannerInput, actorId: string, ip: string | null) {
  if (!input.name.trim() || !input.headline.trim()) throw new AppError("INVALID", "Name and headline are required.", 400);
  const banner = await prisma.banner.create({
    data: {
      name: input.name.trim(),
      placement: placementOf(input.placement),
      headline: input.headline.trim(),
      subtitle: (input.subtitle ?? "").trim(),
      imageId: input.imageId ?? null,
      mobileImageId: input.mobileImageId ?? null,
      ctaLabel: (input.ctaLabel ?? "").trim(),
      ctaDestination: (input.ctaDestination ?? "").trim(),
      altText: (input.altText ?? "").trim(),
      startAt: when(input.startAt ?? null),
      endAt: when(input.endAt ?? null),
      sortOrder: input.sortOrder ?? 0,
      status: "DRAFT",
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await writeAudit({
    actorId,
    action: "banner.create",
    entityType: "Banner",
    entityId: banner.id,
    after: bannerSnapshot(banner),
    ip,
  });
  return banner;
}

export async function updateBanner(id: string, input: BannerInput, actorId: string, ip: string | null) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.banner.findUnique({ where: { id } });
    if (!current) throw new AppError("NOT_FOUND", "That banner was not found.", 404);
    if (current.status === "ARCHIVED") throw new AppError("INVALID", "Archived banners stay as history.", 409);
    await remember(tx, current, actorId);
    const banner = await tx.banner.update({ where: { id }, data: dataFrom(input, actorId) });
    await writeAudit(
      {
        actorId,
        action: "banner.edit",
        entityType: "Banner",
        entityId: id,
        before: bannerSnapshot(current),
        after: bannerSnapshot(banner),
        ip,
      },
      tx,
    );
    return banner;
  });
}

export async function publishBanner(id: string, actorId: string, ip: string | null) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.banner.findUnique({ where: { id } });
    if (!current) throw new AppError("NOT_FOUND", "That banner was not found.", 404);
    if (current.status === "ARCHIVED") throw new AppError("INVALID", "Archived banners cannot be published.", 409);
    if (!current.headline.trim()) throw new AppError("INVALID", "Add a headline before publishing.", 400);
    await remember(tx, current, actorId);
    const now = new Date();
    const status = statusAfterPublish(current.startAt, current.endAt, now) as BannerStatus;
    const banner = await tx.banner.update({
      where: { id },
      data: { status, publishedAt: current.publishedAt ?? now, updatedById: actorId },
    });
    await writeAudit(
      {
        actorId,
        action: "banner.publish",
        entityType: "Banner",
        entityId: id,
        before: bannerSnapshot(current),
        after: bannerSnapshot(banner),
        ip,
      },
      tx,
    );
    return banner;
  });
}

export async function disableBanner(id: string, actorId: string, ip: string | null) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.banner.findUnique({ where: { id } });
    if (!current) throw new AppError("NOT_FOUND", "That banner was not found.", 404);
    await remember(tx, current, actorId);
    const banner = await tx.banner.update({
      where: { id },
      data: { status: "DISABLED", updatedById: actorId },
    });
    await writeAudit(
      {
        actorId,
        action: "banner.disable",
        entityType: "Banner",
        entityId: id,
        before: bannerSnapshot(current),
        after: bannerSnapshot(banner),
        ip,
      },
      tx,
    );
    return banner;
  });
}

export async function duplicateBanner(id: string, actorId: string, ip: string | null) {
  const current = await prisma.banner.findUnique({ where: { id } });
  if (!current) throw new AppError("NOT_FOUND", "That banner was not found.", 404);
  const copy = await prisma.banner.create({
    data: {
      name: `Copy of ${current.name}`.slice(0, 120),
      placement: current.placement,
      headline: current.headline,
      subtitle: current.subtitle,
      imageId: current.imageId,
      mobileImageId: current.mobileImageId,
      ctaLabel: current.ctaLabel,
      ctaDestination: current.ctaDestination,
      altText: current.altText,
      startAt: current.startAt,
      endAt: current.endAt,
      sortOrder: current.sortOrder,
      status: "DRAFT",
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await writeAudit({
    actorId,
    action: "banner.duplicate",
    entityType: "Banner",
    entityId: copy.id,
    after: bannerSnapshot(copy),
    metadata: { sourceId: current.id },
    ip,
  });
  return copy;
}

export async function removeBanner(id: string, actorId: string, ip: string | null) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.banner.findUnique({ where: { id } });
    if (!current) throw new AppError("NOT_FOUND", "That banner was not found.", 404);
    if (current.status === "DRAFT" && !current.publishedAt) {
      await tx.banner.delete({ where: { id } });
      await writeAudit(
        {
          actorId,
          action: "banner.delete",
          entityType: "Banner",
          entityId: id,
          before: bannerSnapshot(current),
          ip,
        },
        tx,
      );
      return { archived: false };
    }
    await remember(tx, current, actorId);
    const banner = await tx.banner.update({
      where: { id },
      data: { status: "ARCHIVED", updatedById: actorId },
    });
    await writeAudit(
      {
        actorId,
        action: "banner.archive",
        entityType: "Banner",
        entityId: id,
        before: bannerSnapshot(current),
        after: bannerSnapshot(banner),
        ip,
      },
      tx,
    );
    return { archived: true };
  });
}

export async function liveBanners(placement: BannerPlacement) {
  const rows = await prisma.banner.findMany({
    where: { placement, status: { in: ["LIVE", "SCHEDULED"] } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const now = new Date();
  return rows.filter((row) => effectiveBannerStatus(row, now) === "LIVE");
}
