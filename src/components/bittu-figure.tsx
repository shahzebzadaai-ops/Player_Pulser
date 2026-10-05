import type { ReactNode } from "react";
import { BITTU_POSES, type BittuPose } from "@/domain/bittu";

export function BittuFigure({
  pose,
  className = "",
  priority = false,
}: {
  pose: BittuPose;
  className?: string;
  priority?: boolean;
}) {
  const item = BITTU_POSES[pose];
  return (
    // Artwork is a static file in public/bittu. Width and height preserve the original ratio.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.src}
      alt={item.alt}
      width={item.width}
      height={item.height}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "low"}
      className={`object-contain ${className}`}
      style={{ aspectRatio: `${item.width} / ${item.height}` }}
    />
  );
}

export function BittuNote({
  pose,
  children,
  className = "",
}: {
  pose: BittuPose;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <BittuFigure pose={pose} className="h-16 w-auto shrink-0" />
      <div className="min-w-0 text-sm text-muted">{children}</div>
    </div>
  );
}
