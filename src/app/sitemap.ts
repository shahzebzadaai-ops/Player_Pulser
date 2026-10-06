import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getSeo } from "@/server/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [seo, headerStore] = await Promise.all([getSeo(), headers()]);
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const origin = (seo.canonicalDomain || (host ? `${proto}://${host}` : "")).replace(/\/$/, "");
  return [{ url: origin ? `${origin}/` : "/", changeFrequency: "weekly", priority: 0.3 }];
}
