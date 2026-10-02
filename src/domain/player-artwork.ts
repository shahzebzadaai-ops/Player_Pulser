export const PLAYER_ARTWORK_WIDTH = 1024;
export const PLAYER_ARTWORK_HEIGHT = 1024;

const ARTWORK_SLUGS = [
  "abhishek-sharma",
  "arshdeep-singh",
  "axar-patel",
  "hardik-pandya",
  "ishan-kishan",
  "jasprit-bumrah",
  "kl-rahul",
  "kuldeep-yadav",
  "mohammed-shami",
  "mohammed-siraj",
  "nitish-kumar-reddy",
  "ravichandran-ashwin",
  "ravindra-jadeja",
  "rishabh-pant",
  "rohit-sharma",
  "sanju-samson",
  "shreyas-iyer",
  "shubman-gill",
  "suryakumar-yadav",
  "tilak-varma",
  "virat-kohli",
  "washington-sundar",
  "yashasvi-jaiswal",
  "yuzvendra-chahal",
] as const;

const ARTWORK = new Set<string>(ARTWORK_SLUGS);

export function playerArtworkSrc(slug: string): string | null {
  return ARTWORK.has(slug) ? `/assets/players/${slug}.webp` : null;
}

export function playerArtworkAlt(name: string): string {
  return `${name} cricket caricature on PlayerPulser`;
}

export function publicPlayerPaths(): string[] {
  return ARTWORK_SLUGS.map((slug) => `/p/${slug}`);
}
