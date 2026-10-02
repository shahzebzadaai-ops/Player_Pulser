export function isHighValue(settledDepositPaise: bigint, thresholdPaise: bigint): boolean {
  return settledDepositPaise >= thresholdPaise;
}

export function isChurnRisk(input: {
  accountCreatedAt: Date;
  lastTradeAt: Date | null;
  now: Date;
  inactiveDays: number;
}): boolean {
  if (!input.lastTradeAt || input.inactiveDays < 1) return false;
  const cutoff = input.now.getTime() - input.inactiveDays * 24 * 60 * 60 * 1000;
  return input.accountCreatedAt.getTime() < cutoff && input.lastTradeAt.getTime() < cutoff;
}
