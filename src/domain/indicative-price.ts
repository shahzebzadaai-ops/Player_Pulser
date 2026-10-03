import { formatPaise } from "./money";

const PAISE = /^\d{1,12}$/;

/** A displayed quote is usable only when it is a positive integer paise amount. */
export function usableIndicativePaise(value: string | null | undefined): string | null {
  if (!value || !PAISE.test(value)) return null;
  try {
    if (BigInt(value) <= 0n) return null;
  } catch {
    return null;
  }
  return value;
}

/**
 * Prefer the live stream quote. Otherwise use the server quote already rendered
 * on the market card and player page. Never substitutes a constant.
 */
export function currentIndicativePaise(livePaise: string | null | undefined, serverPaise: string | null | undefined): string | null {
  return usableIndicativePaise(livePaise) ?? usableIndicativePaise(serverPaise);
}

export function guestTradeTotalPaise(unitPaise: string | null, quantity: number): string | null {
  const unit = usableIndicativePaise(unitPaise);
  if (!unit || !Number.isInteger(quantity) || quantity < 1) return null;
  return (BigInt(unit) * BigInt(quantity)).toString();
}

/** Reference price the guest saw, compared with a fresh server quote. Missing prices produce no notice. */
export function priceUpdateNotice(displayedPaise: string | null | undefined, freshPaise: string | null | undefined): string | null {
  const displayed = usableIndicativePaise(displayedPaise);
  const fresh = usableIndicativePaise(freshPaise);
  if (!displayed || !fresh || displayed === fresh) return null;
  return `Price updated\n${formatPaise(displayed)} → ${formatPaise(fresh)}`;
}
