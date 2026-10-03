export const AUDIENCE_IDS = [
  "REGISTERED_NO_DEPOSIT",
  "FIRST_TIME_DEPOSITOR",
  "DEPOSITED_NO_TRADE",
  "ACTIVE_TRADER_7D",
  "ACTIVE_TRADER_30D",
  "DORMANT_30D",
  "DORMANT_60D",
  "HIGH_VALUE",
  "REACTIVATED",
] as const;

export type AudienceId = (typeof AUDIENCE_IDS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
export const HIGH_VALUE_DEPOSIT_PAISE = 500_000n;

export function audienceMembership(input: {
  registered: boolean;
  depositCount: number;
  tradeCount: number;
  lifetimeDepositPaise: bigint;
  lastTradeAt: Date | null;
  lastDepositAt: Date | null;
  reactivated: boolean;
  now: Date;
}): AudienceId[] {
  if (!input.registered) return [];
  const segments: AudienceId[] = [];
  const lastTrade = input.lastTradeAt?.getTime() ?? null;
  const lastDeposit = input.lastDepositAt?.getTime() ?? null;
  const activity = Math.max(lastTrade ?? 0, lastDeposit ?? 0);
  if (input.depositCount === 0) segments.push("REGISTERED_NO_DEPOSIT");
  if (input.depositCount === 1) segments.push("FIRST_TIME_DEPOSITOR");
  if (input.depositCount > 0 && input.tradeCount === 0) segments.push("DEPOSITED_NO_TRADE");
  if (lastTrade !== null && input.now.getTime() - lastTrade <= 7 * DAY_MS) segments.push("ACTIVE_TRADER_7D");
  if (lastTrade !== null && input.now.getTime() - lastTrade <= 30 * DAY_MS) segments.push("ACTIVE_TRADER_30D");
  if (activity > 0 && input.now.getTime() - activity >= 30 * DAY_MS) segments.push("DORMANT_30D");
  if (activity > 0 && input.now.getTime() - activity >= 60 * DAY_MS) segments.push("DORMANT_60D");
  if (input.lifetimeDepositPaise >= HIGH_VALUE_DEPOSIT_PAISE) segments.push("HIGH_VALUE");
  if (input.reactivated) segments.push("REACTIVATED");
  return segments;
}
