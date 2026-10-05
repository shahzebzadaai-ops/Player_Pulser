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
      className={`${className} shrink-0 bg-transparent object-contain object-center drop-shadow-[0_10px_16px_rgba(0,0,0,0.28)]`}
      onError={() => setFailed(true)}
    />
  );
}
