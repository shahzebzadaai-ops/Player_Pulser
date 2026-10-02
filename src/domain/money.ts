/** 1 rupee = 100 paise. Settlement math uses bigint paise, never binary floats. */
export const PAISE_PER_RUPEE = 100n;

export function toPaise(value: bigint | number | string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error("Paise amounts must be integers");
    }
    return BigInt(value);
  }
  if (!/^-?\d+$/.test(value)) {
    throw new Error("Paise amounts must be integer strings");
  }
  return BigInt(value);
}

export function assertSafePaise(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error("Paise amount is outside the safe integer range");
  }
  return Number(value);
}

/** Round half away from zero. Denominator must be positive. */
export function divRoundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Denominator must be positive");
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute + denominator / 2n) / denominator;
  return negative ? -rounded : rounded;
}

export function divCeilPositive(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n) throw new Error("Ceiling division expects a non-negative numerator");
  if (denominator <= 0n) throw new Error("Denominator must be positive");
  return (numerator + denominator - 1n) / denominator;
}

function groupIndian(intPart: string): string {
  if (intPart.length <= 3) return intPart;
  const last3 = intPart.slice(-3);
  let rest = intPart.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return `${parts.join(",")},${last3}`;
}

/** Display-only. Do not parse this string back into a settlement amount. */
export function formatPaise(value: bigint | number | string): string {
  const paise = toPaise(value);
  const negative = paise < 0n;
  const absolute = negative ? -paise : paise;
  const rupees = groupIndian((absolute / 100n).toString());
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}₹${rupees}.${fraction}`;
}

export function formatSignedPaise(value: bigint | number | string): string {
  const paise = toPaise(value);
  if (paise > 0n) return `+${formatPaise(paise)}`;
  return formatPaise(paise);
}

/** Display-only percent. Not used to move money. */
export function formatPercent(percent: number, digits = 2): string {
  if (!Number.isFinite(percent)) return "0.00%";
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(digits)}%`;
}

export function changePercent(current: bigint, previous: bigint): number {
  if (previous === 0n) return 0;
  return (Number(current - previous) / Number(previous)) * 100;
}

/** Display-only compact rupees. Never use the result for settlement. */
export function formatCompactInr(value: bigint | number | string): string {
  const rupees = Number(toPaise(value) / 100n);
  const crore = 1_00_00_000;
  const lakh = 1_00_000;
  if (Math.abs(rupees) >= crore) return `₹${(rupees / crore).toFixed(1)} Cr`;
  if (Math.abs(rupees) >= lakh) return `₹${(rupees / lakh).toFixed(1)} L`;
  return formatPaise(value);
}
