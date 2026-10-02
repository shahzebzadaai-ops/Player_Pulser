import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { MediaFolder } from "@prisma/client";
import { AppError } from "@/domain/errors";
import { MAX_MEDIA_BYTES, MEDIA_FOLDERS } from "@/domain/banners";
import { prisma } from "./prisma";
import { imageSize, sniffImage } from "./images";

function mediaRoot(): string {
  const configured = process.env.MEDIA_ROOT?.trim();
  if (configured) return path.resolve(configured);
  return path.join(process.cwd(), ".data", "media");
}

function safeName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "image";
  return base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "image";
}

export function mediaPath(storageKey: string): string {
  const root = mediaRoot();
  const resolved = path.resolve(root, storageKey);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new AppError("INVALID", "Media path was rejected.", 400);
  }
  return resolved;
}

export async function saveMedia(input: {
  file: File;
  folder: string;
  altText: string;
  createdById: string;
  replaceId?: string | null;
}) {
  if (!(MEDIA_FOLDERS as readonly string[]).includes(input.folder)) {
    throw new AppError("INVALID", "Choose a media folder.", 400);
  }
  if (input.file.size > MAX_MEDIA_BYTES) throw new AppError("INVALID", "Images must be 2MB or smaller.", 400);
  const bytes = Buffer.from(await input.file.arrayBuffer());
  if (bytes.length > MAX_MEDIA_BYTES) throw new AppError("INVALID", "Images must be 2MB or smaller.", 400);
  const sniffed = sniffImage(bytes);
  if (!sniffed) throw new AppError("INVALID", "Upload a WebP, AVIF, PNG, or JPEG image.", 400);
  const size = imageSize(bytes, sniffed.mime);
  await mkdir(mediaRoot(), { recursive: true });
  const storageKey = `${randomUUID()}${sniffed.mime === "image/jpeg" ? ".jpg" : sniffed.mime === "image/png" ? ".png" : sniffed.mime === "image/avif" ? ".avif" : ".webp"}`;
  await writeFile(mediaPath(storageKey), bytes);
  if (input.replaceId) {
    const existing = await prisma.mediaAsset.findUnique({ where: { id: input.replaceId } });
    if (!existing) throw new AppError("NOT_FOUND", "That media file was not found.", 404);
    return prisma.mediaAsset.update({
      where: { id: existing.id },
      data: {
        folder: input.folder as MediaFolder,
        filename: safeName(input.file.name),
        mimeType: sniffed.mime,
        bytes: bytes.length,
        width: size?.width ?? null,
        height: size?.height ?? null,
        altText: input.altText || existing.altText,
        storageKey,
        archivedAt: null,
      },
    });
  }
  return prisma.mediaAsset.create({
    data: {
      folder: input.folder as MediaFolder,
      filename: safeName(input.file.name),
      mimeType: sniffed.mime,
      bytes: bytes.length,
      width: size?.width ?? null,
      height: size?.height ?? null,
      altText: input.altText,
      storageKey,
      createdById: input.createdById,
    },
  });
}

export async function readMediaFile(id: string) {
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) return null;
  const bytes = await readFile(mediaPath(asset.storageKey));
  return { asset, bytes };
}
