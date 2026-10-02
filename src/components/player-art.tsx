"use client";

import { useState, type ReactNode } from "react";
import { PLAYER_ARTWORK_HEIGHT, PLAYER_ARTWORK_WIDTH } from "@/domain/player-artwork";

export function PlayerArt({
  src,
  alt,
  className,
  fallback,
}: {
  src: string;
  alt: string;
  className: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  return (
    <img
      src={src}
      alt={alt}
      width={PLAYER_ARTWORK_WIDTH}
      height={PLAYER_ARTWORK_HEIGHT}
      className={`${className} shrink-0 bg-black object-cover object-[center_18%]`}
      onError={() => setFailed(true)}
    />
  );
}
