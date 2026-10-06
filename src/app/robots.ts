import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getSeo } from "@/server/seo";

export const dynamic = "force-dynamic";

const PRIVATE_PATHS = [
  "/admin",
  "/api",
  "/preview",
  "/login",
  "/signup",
  "/home",
  "/market",
  "/players",
  "/p",
  "/portfolio",
  "/wallet",
  "/rewards",
  "/settings",
  "/notifications",
  "/help",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const [seo, headerStore] = await Promise.all([getSeo(), headers()]);
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const origin = (seo.canonicalDomain || (host ? `${proto}://${host}` : "")).replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/coming-soon", "/brand/"],
      disallow: PRIVATE_PATHS,
    },
    sitemap: origin ? `${origin}/sitemap.xml` : undefined,
  };
}
