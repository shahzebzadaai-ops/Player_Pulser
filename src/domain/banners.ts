export const BANNER_PLACEMENTS = ["HOME_MAIN", "MARKET", "REWARDS", "WALLET", "LANDING_HERO"] as const;

export type BannerPlacementName = (typeof BANNER_PLACEMENTS)[number];

export const BANNER_STATUSES = ["DRAFT", "SCHEDULED", "LIVE", "EXPIRED", "DISABLED", "ARCHIVED"] as const;

export const PLACEMENT_SIZE: Record<BannerPlacementName, { width: number; height: number }> = {
  HOME_MAIN: { width: 1200, height: 400 },
  MARKET: { width: 1200, height: 400 },
  REWARDS: { width: 1200, height: 600 },
  WALLET: { width: 1200, height: 400 },
  LANDING_HERO: { width: 1080, height: 1350 },
};

export const MEDIA_FOLDERS = ["PLAYERS", "BANNERS", "BONUSES", "LOYALTY", "BRAND", "MISC"] as const;

export const MAX_MEDIA_BYTES = 2 * 1024 * 1024;

export function effectiveBannerStatus(
  banner: { status: string; startAt: Date | null; endAt: Date | null },
  now: Date,
): string {
  if (banner.status === "DRAFT" || banner.status === "DISABLED" || banner.status === "ARCHIVED") return banner.status;
  if (banner.startAt && banner.startAt.getTime() > now.getTime()) return "SCHEDULED";
  if (banner.endAt && banner.endAt.getTime() <= now.getTime()) return "EXPIRED";
  return "LIVE";
}

export function statusAfterPublish(startAt: Date | null, endAt: Date | null, now: Date): "SCHEDULED" | "LIVE" | "EXPIRED" {
  if (startAt && startAt.getTime() > now.getTime()) return "SCHEDULED";
  if (endAt && endAt.getTime() <= now.getTime()) return "EXPIRED";
  return "LIVE";
}
