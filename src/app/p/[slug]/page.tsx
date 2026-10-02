import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HowPricesWork } from "@/components/how-prices-work";
import { PulsePanel } from "@/components/pulse-star";
import { Portrait } from "@/components/visuals";
import { formatPaise } from "@/domain/money";
import { playerPublicSeo } from "@/domain/seo";
import { getPlayer } from "@/server/queries";
import { getSeo } from "@/server/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [player, seo] = await Promise.all([getPlayer(slug), getSeo()]);
  if (!player) return { title: seo.siteTitle, robots: { index: false, follow: false } };
  const copy = playerPublicSeo(player, seo);
  const origin = seo.canonicalDomain.replace(/\/$/, "");
  const canonical = origin ? `${origin}/p/${player.slug}` : `/p/${player.slug}`;
  const image = copy.imagePath
    ? {
        url: origin ? `${origin}${copy.imagePath}` : copy.imagePath,
        width: copy.imageWidth,
        height: copy.imageHeight,
        alt: copy.imageAlt,
        type: "image/webp",
      }
    : undefined;
  return {
    title: { absolute: copy.title },
    description: copy.description,
    robots: { index: true, follow: true },
    alternates: { canonical },
    openGraph: {
      title: copy.title,
      description: copy.description,
      url: canonical,
      type: "profile",
      images: image ? [image] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: image ? [image.url] : undefined,
    },
  };
}

export default async function PublicPlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const player = await getPlayer(slug);
  if (!player) notFound();
  const seo = await getSeo();
  const copy = playerPublicSeo(player, seo);
  const origin = seo.canonicalDomain.replace(/\/$/, "");
  const pageUrl = origin ? `${origin}/p/${player.slug}` : `/p/${player.slug}`;
  const imageUrl = copy.imagePath ? (origin ? `${origin}${copy.imagePath}` : copy.imagePath) : undefined;
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: player.name,
    url: pageUrl,
    ...(imageUrl ? { image: imageUrl } : {}),
  };
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[430px] px-4 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(person) }} />
      <p className="text-xs text-muted">Public player page · simulated development price</p>
      <div className="mt-4 flex gap-3">
        <Portrait name={player.name} seed={player.slug} className="h-36 w-28" />
        <div>
          <h1 className="text-2xl font-bold">{player.name}</h1>
          <p className="text-sm text-muted">{player.role.replaceAll("_", " ")}</p>
          <p className="num mt-1 text-3xl font-bold">{formatPaise(player.midPaise)}</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted">{player.why[0] ?? "Simulated development price for this player."}</p>
      {player.pulse ? (
        <PulsePanel
          playerId={player.id}
          state={player.pulse.state}
          activity={player.pulse.activity}
          feedLabel={player.pulse.feedLabel}
          previewPaise={player.pulse.previewPaise}
        />
      ) : null}
      <HowPricesWork />
      <Link href="/login" className="mt-6 flex min-h-12 items-center justify-center rounded-full bg-india font-semibold">
        Sign in to trade
      </Link>
    </main>
  );
}
