export const VIP_RULE =
  "A customer is VIP when any one of these is true: they belong to a segment named VIP, an explicit VIP status is set, or they have a VIP call task that is open or in progress. Completed and cancelled tasks do not qualify. This label does not pay a reward.";

export type VipSignals = {
  segmentNames: string[];
  explicitVip?: boolean;
  openVipTask: boolean;
};

export function vipReasons(input: VipSignals): string[] {
  const reasons: string[] = [];
  if (input.segmentNames.some((name) => name.trim().toLowerCase() === "vip")) reasons.push("VIP segment");
  if (input.explicitVip) reasons.push("Explicit VIP status");
  if (input.openVipTask) reasons.push("Open VIP call task");
  return reasons;
}

export function isVip(input: VipSignals): boolean {
  return vipReasons(input).length > 0;
}
