"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { BittuPose } from "@/domain/bittu";
import { BittuFigure } from "./bittu-figure";

export type BittuPromoVariant = "primary" | "compact" | "info" | "success";

type BittuPromoBannerProps = {
  eyebrow?: string;
  title?: string;
  line?: string;
  offer?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
  pose?: BittuPose;
  variant?: BittuPromoVariant;
  helpLabel?: string;
  onHelp?: () => void;
  onDismiss?: () => void;
  dismissLabel?: string;
  priority?: boolean;
  heading?: "h1" | "h2";
  label?: string;
  className?: string;
  children?: ReactNode;
};

export function BittuPromoBanner({
  eyebrow,
  title,
  line,
  offer,
  description,
  ctaLabel,
  ctaHref,
  pose = "present",
  variant = "primary",
  helpLabel,
  onHelp,
  onDismiss,
  dismissLabel = "Dismiss",
  priority = false,
  heading = "h2",
  label,
  className = "",
  children,
}: BittuPromoBannerProps) {
  const Heading = heading;
  const offerParts = splitOffer(offer);
  const classes = `bittu-promo is-${variant} ${className}`.trim();
  const ask = () => {
    if (onHelp) {
      onHelp();
      return;
    }
    window.dispatchEvent(new Event("pp-ask-bittu"));
  };

  const body = (
    <>
      <div className="bittu-promo-glass" aria-hidden="true" />
      <div className="bittu-promo-figure">
        <span className="bittu-promo-glow" aria-hidden="true" />
        <BittuFigure pose={pose} priority={priority} className="bittu-promo-art" />
      </div>
      <div className="bittu-promo-copy">
        {eyebrow ? <p className="bittu-promo-eyebrow">{eyebrow}</p> : null}
        {title ? <Heading className="bittu-promo-title">{title}</Heading> : null}
        {line ? <p className="bittu-promo-line">{line}</p> : null}
        {offerParts ? (
          <p className="bittu-promo-offer">
            <span>{offerParts.amount}</span>
            {offerParts.accent ? <span className="is-accent">{offerParts.accent}</span> : null}
          </p>
        ) : null}
        {description ? <p className="bittu-promo-detail">{description}</p> : null}
        {children}
        {ctaLabel && ctaHref ? (
          <Link href={ctaHref} className="btn-primary bittu-promo-cta">
            {ctaLabel}
          </Link>
        ) : null}
        {helpLabel ? (
          <button type="button" className="bittu-promo-help" onClick={ask}>
            {helpLabel}
          </button>
        ) : null}
      </div>
      {onDismiss ? (
        <button type="button" className="bittu-promo-dismiss" aria-label={dismissLabel} onClick={onDismiss}>
          ×
        </button>
      ) : null}
    </>
  );

  if (ctaHref && !ctaLabel) {
    return (
      <Link href={ctaHref} className={classes}>
        {body}
      </Link>
    );
  }

  return (
    <section className={classes} aria-label={label || title || eyebrow || "Promotion"}>
      {body}
    </section>
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
    <BittuPromoBanner variant="compact" pose={pose} label="Bittu note" className={className}>
      <div className="bittu-promo-detail">{children}</div>
    </BittuPromoBanner>
  );
}

function splitOffer(offer?: string) {
  if (!offer?.trim()) return null;
  const match = /^(.*\S)\s+(BONUS)$/i.exec(offer.trim());
  if (!match) return { amount: offer.trim(), accent: null as string | null };
  return { amount: match[1], accent: "BONUS" };
}
