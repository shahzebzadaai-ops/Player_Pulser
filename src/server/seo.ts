import { DEFAULT_SEO, type SeoSettings } from "@/domain/seo";
import { prisma } from "./prisma";

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

const SEO_CACHE_MS = 2_000;
let seoCache: { at: number; value: SeoSettings } | null = null;

export function invalidateSeoCache(): void {
  seoCache = null;
}

export async function getSeo(): Promise<SeoSettings> {
  if (process.env.NODE_ENV !== "test" && seoCache && Date.now() - seoCache.at < SEO_CACHE_MS) return seoCache.value;
  const value = await readSeo();
  if (process.env.NODE_ENV !== "test") seoCache = { at: Date.now(), value };
  return value;
}

async function readSeo(): Promise<SeoSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: "seo" } });
  const value = row?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_SEO };
  const record = value as Record<string, unknown>;
  return {
    siteTitle: text(record.siteTitle, DEFAULT_SEO.siteTitle),
    siteDescription: text(record.siteDescription, DEFAULT_SEO.siteDescription),
    canonicalDomain: text(record.canonicalDomain, DEFAULT_SEO.canonicalDomain),
    defaultOgImageId: text(record.defaultOgImageId, DEFAULT_SEO.defaultOgImageId),
    robotsIndex: flag(record.robotsIndex, DEFAULT_SEO.robotsIndex),
    robotsFollow: flag(record.robotsFollow, DEFAULT_SEO.robotsFollow),
  };
}
