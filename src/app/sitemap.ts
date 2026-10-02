import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { publicPlayerPaths } from "@/domain/player-artwork";
import { getSeo } from "@/server/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [seo, headerStore] = await Promise.all([getSeo(), headers()]);
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const origin = (seo.canonicalDomain || (host ? `${proto}://${host}` : "")).replace(/\/$/, "");
  return publicPlayerPaths().map((path) => ({
    url: origin ? `${origin}${path}` : path,
    changeFrequency: "daily",
    priority: 0.7,
  }));
}
