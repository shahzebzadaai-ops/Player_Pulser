import { PLAYER_ARTWORK_HEIGHT, PLAYER_ARTWORK_WIDTH, playerArtworkAlt, playerArtworkSrc } from "./player-artwork";

export type SeoSettings = {
  siteTitle: string;
  siteDescription: string;
  canonicalDomain: string;
  defaultOgImageId: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
};

export const DEFAULT_SEO: SeoSettings = {
  siteTitle: "PlayerPulser",
  siteDescription: "Trade fictional cricket-player holdings, track a portfolio, and manage a simulated wallet.",
  canonicalDomain: "",
  defaultOgImageId: "",
  robotsIndex: false,
  robotsFollow: false,
};

export function playerPublicSeo(
  player: { name: string; slug: string; role: string },
  seo: SeoSettings,
): {
  title: string;
  description: string;
  imagePath: string | null;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
} {
  const title = `${player.name} Player Price & Performance | ${seo.siteTitle}`;
  const description = `Follow ${player.name} on ${seo.siteTitle} with player price movement, cricket performance and market activity.`;
  return {
    title,
    description,
    imagePath: playerArtworkSrc(player.slug),
    imageAlt: playerArtworkAlt(player.name),
    imageWidth: PLAYER_ARTWORK_WIDTH,
    imageHeight: PLAYER_ARTWORK_HEIGHT,
  };
}
