import type { BannerPlacement } from "@prisma/client";
import { liveBanners } from "@/server/banners";

export async function BannerSlot({ placement }: { placement: BannerPlacement }) {
  const banners = await liveBanners(placement);
  if (banners.length === 0) return null;
  return (
    <div className="mt-4 space-y-3">
      {banners.map((banner) => {
        const imageId = banner.mobileImageId ?? banner.imageId;
        const inner = (
          <>
            {imageId ? (
              // Local media is served by the app, not a third-party host.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/media/${imageId}`} alt={banner.altText || banner.headline} className="h-36 w-full object-cover" />
            ) : null}
            <div className="p-3">
              <p className="font-semibold">{banner.headline}</p>
              {banner.subtitle ? <p className="text-sm text-muted">{banner.subtitle}</p> : null}
              {banner.ctaLabel ? <span className="mt-2 inline-flex text-sm text-india">{banner.ctaLabel}</span> : null}
            </div>
          </>
        );
        const className = "block overflow-hidden rounded-3xl border border-line bg-card";
        return banner.ctaDestination ? (
          <a key={banner.id} href={banner.ctaDestination} className={className}>
            {inner}
          </a>
        ) : (
          <article key={banner.id} className={className}>
            {inner}
          </article>
        );
      })}
    </div>
  );
}
