import { shadowAttentionItems } from "./shadow-validation";

export type BonusLedgerLine = {
  entryType: string;
  account: string;
  amountPaise: bigint;
};

export type BonusReport = {
  issuedPaise: bigint;
  usedPaise: bigint;
  expiredPaise: bigint;
  convertedPaise: bigint;
  realizedCostPaise: bigint;
};

export function summarizeBonus(lines: BonusLedgerLine[]): BonusReport {
  let issuedPaise = 0n;
  let usedPaise = 0n;
  let expiredPaise = 0n;
  let convertedPaise = 0n;
  for (const line of lines) {
    if (line.entryType === "BONUS_GRANT" && line.account === "USER_BONUS" && line.amountPaise > 0n) issuedPaise += line.amountPaise;
    if (line.entryType === "TRADE_BUY" && line.account === "USER_BONUS" && line.amountPaise < 0n) usedPaise += -line.amountPaise;
    if (line.entryType === "BONUS_EXPIRE" && (line.account === "USER_BONUS" || line.account === "USER_BONUS_PROCEEDS") && line.amountPaise < 0n) {
      expiredPaise += -line.amountPaise;
    }
    if (line.entryType === "BONUS_CONVERT" && line.account === "USER_CASH" && line.amountPaise > 0n) convertedPaise += line.amountPaise;
  }
  return { issuedPaise, usedPaise, expiredPaise, convertedPaise, realizedCostPaise: convertedPaise };
}

export function operationalNgr(input: {
  ggrPaise: bigint;
  realizedBonusCostPaise: bigint;
  paymentProcessingCostPaise?: bigint;
  chargebackCostPaise?: bigint;
}): bigint {
  return input.ggrPaise - input.realizedBonusCostPaise - (input.paymentProcessingCostPaise ?? 0n) - (input.chargebackCostPaise ?? 0n);
}

export const REPORTING_FORMULA = {
  ggr: "GGR is the spread already charged on filled trades: for each trade, the absolute difference between the fill price and the quoted mid, multiplied by quantity.",
  operationalNgr: "Operational NGR = GGR − Realized Bonus Cost − Payment Processing Cost − Chargebacks / Refund Cost.",
  realizedBonusCost: "Realized Bonus Cost is cash credited on BONUS_CONVERT. A granted bonus that is still unused is issued, not a realized cost.",
  paymentCosts: "Payment processing cost and chargeback / refund cost are 0 because those amounts are not configured.",
};

export const METRIC_DEFINITIONS: { name: string; text: string }[] = [
  { name: "Visitor", text: "A distinct first-party visitor with a visit session in the window. Admin routes and staff-marked visitors are excluded." },
  { name: "Signup", text: "A customer account whose created time falls in the window." },
  { name: "First Depositor", text: "A customer whose earliest settled deposit falls in the window." },
  { name: "Active Trader", text: "A distinct customer with at least one filled trade in the window." },
  { name: "Trading Volume", text: "The sum of cash and bonus notionals on filled trades in the window." },
  { name: "GGR", text: REPORTING_FORMULA.ggr },
  { name: "Operational NGR", text: REPORTING_FORMULA.operationalNgr },
  { name: "Bonus Issued", text: "Bonus credited to USER_BONUS by BONUS_GRANT in the window." },
  { name: "Bonus Used", text: "Bonus spent on completed buys in the window, from TRADE_BUY lines that reduce USER_BONUS." },
  { name: "Bonus Converted", text: "Cash credited by BONUS_CONVERT in the window. This is also Realized Bonus Cost." },
  { name: "Bonus Expired", text: "Unused bonus and unconverted bonus proceeds removed by BONUS_EXPIRE in the window." },
];

export function trackingStamp(firstSeen: Date | null): string {
  if (!firstSeen) return "Tracking since: no visitor recorded yet";
  const date = firstSeen.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  return `Tracking since: ${date} IST`;
}

export function trackingWarning(rangeStart: Date, firstSeen: Date | null): string | null {
  if (firstSeen && rangeStart.getTime() >= firstSeen.getTime()) return null;
  const date = firstSeen
    ? firstSeen.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })
    : "the first tracked visit";
  return `Visitor and acquisition data is available only from ${date}. Financial/account metrics may include older records.`;
}

export function ratesAreComparable(rangeStart: Date, firstSeen: Date | null): boolean {
  return Boolean(firstSeen && rangeStart.getTime() >= firstSeen.getTime());
}

export type AttentionInput = {
  pendingWithdrawals: number;
  paymentsNeedingAttention: number;
  worker: "HEALTHY" | "DEGRADED" | "DOWN";
  bannersExpiring: number;
  highValueChurn: number;
  disabledFeatures: string[];
  riskAlerts?: { label: string; href: string }[];
  openFeedIncidents?: number;
  shadowMatches?: { matchId: string; label: string }[];
  singleCricketSource?: boolean;
  feedAlerts?: { label: string; href: string }[];
};

export type AttentionItem = { label: string; href: string };

export function attentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (input.pendingWithdrawals > 0) {
    items.push({ label: `${input.pendingWithdrawals} pending withdrawal${input.pendingWithdrawals === 1 ? "" : "s"}`, href: "/admin/money/withdrawals" });
  }
  if (input.paymentsNeedingAttention > 0) {
    items.push({ label: `${input.paymentsNeedingAttention} payment${input.paymentsNeedingAttention === 1 ? "" : "s"} need attention`, href: "/admin/payments" });
  }
  if (input.worker === "DEGRADED") items.push({ label: "Price worker is degraded", href: "/admin/operations/health" });
  if (input.worker === "DOWN") items.push({ label: "Price worker is down", href: "/admin/operations/health" });
  if (input.bannersExpiring > 0) {
    items.push({ label: `${input.bannersExpiring} banner${input.bannersExpiring === 1 ? "" : "s"} expiring soon`, href: "/admin/content/banners" });
  }
  if (input.highValueChurn > 0) {
    items.push({ label: `${input.highValueChurn} high-value customer${input.highValueChurn === 1 ? "" : "s"} gone quiet`, href: "/admin/customers/crm" });
  }
  for (const feature of input.disabledFeatures) {
    items.push({ label: `${feature} is off`, href: "/admin/operations/features" });
  }
  for (const alert of input.riskAlerts ?? []) items.push(alert);
  if ((input.openFeedIncidents ?? 0) > 0) {
    const count = input.openFeedIncidents ?? 0;
    items.push({ label: `${count} open feed incident${count === 1 ? "" : "s"}`, href: "/admin/market/live" });
  }
  items.push(...shadowAttentionItems(input.shadowMatches ?? []));
  if (input.singleCricketSource) {
    items.push({ label: "Only one cricket feed source available", href: "/admin/market/live" });
  }
  for (const alert of input.feedAlerts ?? []) items.push(alert);
  return items;
}
