import { divRoundHalfAwayFromZero } from "./money";

export type LotCost = {
  quantityRemaining: number;
  cashCostPaise: bigint;
  bonusCostPaise: bigint;
};

/** Take a whole-unit slice of a lot. The final units consume whatever cost is left. */
export function takeLotCost(lot: LotCost, quantity: number): { cashTaken: bigint; bonusTaken: bigint } {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a positive integer");
  if (quantity > lot.quantityRemaining) throw new Error("Quantity exceeds the lot");
  if (quantity === lot.quantityRemaining) {
    return { cashTaken: lot.cashCostPaise, bonusTaken: lot.bonusCostPaise };
  }
  const qty = BigInt(quantity);
  const whole = BigInt(lot.quantityRemaining);
  const cashTaken = clampCost(
    divRoundHalfAwayFromZero(lot.cashCostPaise * qty, whole),
    lot.cashCostPaise,
  );
  const bonusTaken = clampCost(
    divRoundHalfAwayFromZero(lot.bonusCostPaise * qty, whole),
    lot.bonusCostPaise,
  );
  return { cashTaken, bonusTaken };
}

function clampCost(taken: bigint, available: bigint): bigint {
  if (taken < 0n) return 0n;
  if (taken > available) return available;
  return taken;
}

/** Split a proceeds total by weights. Cash receives the remainder so the parts sum exactly. */
export function splitProceeds(
  proceedsPaise: bigint,
  cashWeight: bigint,
  bonusWeight: bigint,
): { cashPaise: bigint; bonusPaise: bigint } {
  if (proceedsPaise < 0n) throw new Error("Proceeds cannot be negative");
  const whole = cashWeight + bonusWeight;
  if (whole <= 0n) return { cashPaise: proceedsPaise, bonusPaise: 0n };
  let bonusPaise = divRoundHalfAwayFromZero(proceedsPaise * bonusWeight, whole);
  if (bonusPaise > proceedsPaise) bonusPaise = proceedsPaise;
  if (bonusPaise < 0n) bonusPaise = 0n;
  return { cashPaise: proceedsPaise - bonusPaise, bonusPaise };
}

export function weightedAveragePaise(
  lots: { quantity: number; costPaise: bigint }[],
): bigint | null {
  const quantity = lots.reduce((sum, lot) => sum + BigInt(lot.quantity), 0n);
  if (quantity === 0n) return null;
  const cost = lots.reduce((sum, lot) => sum + lot.costPaise, 0n);
  return divRoundHalfAwayFromZero(cost, quantity);
}
