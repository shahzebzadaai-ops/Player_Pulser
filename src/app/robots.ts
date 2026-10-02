import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getSeo } from "@/server/seo";

export const dynamic = "force-dynamic";

const PRIVATE_PATHS = ["/admin", "/api", "/login", "/signup", "/wallet", "/home", "/market", "/portfolio", "/players", "/notifications", "/rewards"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const [seo, headerStore] = await Promise.all([getSeo(), headers()]);
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const origin = (seo.canonicalDomain || (host ? `${proto}://${host}` : "")).replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/p/", "/assets/players/", "/terms", "/privacy", "/cookies", "/risk-disclosure", "/bonus-terms", "/payment-policy", "/responsible-use", "/complaints"],
      disallow: PRIVATE_PATHS,
    },
    sitemap: origin ? `${origin}/sitemap.xml` : undefined,
  };
}
