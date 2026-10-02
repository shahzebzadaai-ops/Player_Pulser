import { dataLayerEventName, marketingPayload, type MarketingEventName } from "@/domain/growth";

type DataLayer = Record<string, string | number | boolean>[];

export function pushMarketing(event: MarketingEventName, payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const consent = window.localStorage.getItem("pp_marketing_consent");
  if (consent !== "granted") return;
  const target = window as Window & { dataLayer?: DataLayer };
  target.dataLayer = target.dataLayer ?? [];
  target.dataLayer.push({ event: dataLayerEventName(event), ...marketingPayload(payload) });
}
