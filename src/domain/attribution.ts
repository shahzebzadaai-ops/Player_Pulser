export const ANALYTICS_EVENTS = [
  "PAGE_VIEW",
  "PLAYER_VIEW",
  "LANDING_VIEW",
  "SIGNUP_PROMPT_SHOWN",
  "SIGNUP_STARTED",
  "OTP_VERIFIED",
  "SIGNUP_COMPLETED",
  "WELCOME_BONUS_GRANTED",
  "DEPOSIT_PAGE_VIEWED",
  "DEPOSIT_STARTED",
  "PAYMENT_METHOD_SELECTED",
  "DEPOSIT_SUCCESS",
  "FIRST_DEPOSIT",
  "TRADE_STARTED",
  "TRADE_BUY",
  "TRADE_SELL",
  "FIRST_TRADE",
  "WITHDRAWAL_REQUESTED",
  "WITHDRAWAL_SUCCESS",
  "REFERRAL_CREATED",
  "REFERRAL_QUALIFIED",
  "signup_prompt_shown",
  "signup_started",
  "auth_google_selected",
  "auth_phone_selected",
  "auth_email_selected",
  "otp_requested",
  "otp_verified",
  "otp_failed",
  "signup_completed",
  "phone_verified",
  "email_verified",
  "profile_completed",
  "buy_intent_created",
  "buy_intent_resumed",
  "deposit_intent_created",
  "deposit_intent_resumed",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const DEFAULT_UTM_SOURCES = ["meta", "google", "microsoft", "whatsapp", "push", "referral", "organic", "direct", "affiliate"] as const;
export const DEFAULT_UTM_MEDIUMS = ["paid_social", "paid_search", "organic", "crm", "referral", "affiliate"] as const;

export const SOURCE_ALIASES: Record<string, string> = {
  facebook: "meta",
  fb: "meta",
  ig: "meta",
  instagram: "meta",
  meta: "meta",
  google: "google",
  adwords: "google",
  gads: "google",
  microsoft: "microsoft",
  bing: "microsoft",
  msn: "microsoft",
  whatsapp: "whatsapp",
  wa: "whatsapp",
  push: "push",
  referral: "referral",
  organic: "organic",
  direct: "direct",
  affiliate: "affiliate",
};

export const MEDIUM_ALIASES: Record<string, string> = {
  cpc: "paid_search",
  ppc: "paid_search",
  paid_search: "paid_search",
  paid_social: "paid_social",
  paidsocial: "paid_social",
  organic: "organic",
  crm: "crm",
  referral: "referral",
  affiliate: "affiliate",
};

const SLUG = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AttributionParams = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  fbclid: string | null;
  gclid: string | null;
  msclkid: string | null;
};

export function isVisitorId(value: string | null | undefined): value is string {
  return Boolean(value && VISITOR_ID.test(value));
}

export function isTrackablePath(pathname: string): boolean {
  if (pathname.startsWith("/admin") || pathname.startsWith("/api")) return false;
  const roots = ["/", "/p", "/signup", "/login", "/home", "/market", "/players", "/portfolio", "/rewards", "/wallet", "/notifications", "/terms", "/privacy", "/cookies", "/risk-disclosure", "/bonus-terms", "/payment-policy", "/responsible-use", "/complaints"];
  return roots.some((root) => (root === "/" ? pathname === "/" : pathname === root || pathname.startsWith(`${root}/`)));
}

export function normalizeUtm(value: string | null | undefined, aliases: Record<string, string> = {}): string | null {
  if (!value) return null;
  const slug = value.trim().toLowerCase().replace(/[\s+]+/g, "_").replace(/[^a-z0-9_-]/g, "");
  if (!slug || !SLUG.test(slug)) return null;
  return aliases[slug] ?? slug;
}

export function parseAttributionSearch(search: string): AttributionParams {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const click = (key: string) => {
    const value = params.get(key)?.trim() ?? "";
    if (!value || value.length > 200 || /[\s@]/.test(value)) return null;
    return value;
  };
  return {
    source: normalizeUtm(params.get("utm_source"), SOURCE_ALIASES),
    medium: normalizeUtm(params.get("utm_medium"), MEDIUM_ALIASES),
    campaign: normalizeUtm(params.get("utm_campaign")),
    content: normalizeUtm(params.get("utm_content")),
    term: normalizeUtm(params.get("utm_term")),
    fbclid: click("fbclid"),
    gclid: click("gclid"),
    msclkid: click("msclkid"),
  };
}

export function hasPaidAttribution(params: AttributionParams): boolean {
  return Boolean(params.source || params.medium || params.campaign || params.content || params.term || params.fbclid || params.gclid || params.msclkid);
}

export function cleanReferrer(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    return `${url.origin}${url.pathname}`.slice(0, 300);
  } catch {
    return null;
  }
}

export function landingPage(pathname: string, params: AttributionParams): string {
  const query = new URLSearchParams();
  if (params.source) query.set("utm_source", params.source);
  if (params.medium) query.set("utm_medium", params.medium);
  if (params.campaign) query.set("utm_campaign", params.campaign);
  if (params.content) query.set("utm_content", params.content);
  if (params.term) query.set("utm_term", params.term);
  const text = query.toString();
  return text ? `${pathname}?${text}` : pathname;
}

export function classifyTouch(params: AttributionParams, referrer: string | null): AttributionParams & { attributed: boolean } {
  if (hasPaidAttribution(params)) {
    return {
      ...params,
      source: params.source ?? (params.fbclid ? "meta" : params.gclid ? "google" : params.msclkid ? "microsoft" : "other"),
      medium: params.medium ?? (params.gclid || params.msclkid ? "paid_search" : params.fbclid ? "paid_social" : null),
      attributed: true,
    };
  }
  if (referrer) return { ...params, source: "organic", medium: "organic", attributed: false };
  return { ...params, source: "direct", medium: "direct", attributed: false };
}

export function applyTouchDecision(
  current: { firstTouchId: string | null; lastTouchId: string | null },
  next: { touchId: string; attributed: boolean },
): { firstTouchId: string | null; lastTouchId: string | null } {
  if (!current.firstTouchId) return { firstTouchId: next.touchId, lastTouchId: next.touchId };
  if (next.attributed) return { firstTouchId: current.firstTouchId, lastTouchId: next.touchId };
  return current;
}

export function playerSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/(?:players|p)\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function pageDedupeKey(sessionId: string, pathname: string): string {
  return `page:${sessionId}:${pathname}`;
}

export function sourceBucket(source: string | null | undefined): string {
  const normalized = normalizeUtm(source, SOURCE_ALIASES);
  if (!normalized) return "Other";
  const labels: Record<string, string> = {
    meta: "Meta",
    google: "Google",
    microsoft: "Microsoft",
    whatsapp: "WhatsApp",
    push: "Push",
    referral: "Referral",
    organic: "Organic",
    direct: "Direct",
    affiliate: "Affiliate",
  };
  return labels[normalized] ?? "Other";
}

export type DateRange = { start: Date; end: Date; previousStart: Date; previousEnd: Date; label: string };

const IST_MS = 5.5 * 60 * 60 * 1000;

function istDayStart(now: Date): Date {
  const shifted = new Date(now.getTime() + IST_MS);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(start - IST_MS);
}

function window(start: Date, end: Date, label: string): DateRange {
  const length = end.getTime() - start.getTime();
  return { start, end, previousEnd: start, previousStart: new Date(start.getTime() - length), label };
}

export function resolveRange(input: { range?: string; from?: string; to?: string }, now = new Date()): DateRange {
  const range = input.range ?? "7d";
  if (range === "today") return window(istDayStart(now), now, "Today");
  if (range === "yesterday") {
    const today = istDayStart(now);
    const start = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    return window(start, today, "Yesterday");
  }
  if (range === "30d") return window(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), now, "30D");
  if (range === "custom" && input.from && input.to) {
    const from = new Date(`${input.from}T00:00:00+05:30`);
    const to = new Date(`${input.to}T00:00:00+05:30`);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && to.getTime() > from.getTime()) {
      const end = new Date(to.getTime() + 24 * 60 * 60 * 1000);
      return window(from, end, "Custom");
    }
  }
  return window(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), now, "7D");
}

export function rate(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

export function changeLabel(current: number, previous: number): string | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return "New";
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% vs previous`;
}

export type CampaignUrlInput = {
  origin: string;
  destination: string;
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
};

export function buildCampaignUrl(input: CampaignUrlInput): { url: string; values: AttributionParams } | { error: string } {
  const source = normalizeUtm(input.source, SOURCE_ALIASES);
  const medium = normalizeUtm(input.medium, MEDIUM_ALIASES);
  const campaign = normalizeUtm(input.campaign);
  const content = normalizeUtm(input.content);
  const term = normalizeUtm(input.term);
  if (!source || !medium || !campaign) return { error: "Source, medium, and campaign are required. Use lowercase letters, numbers, _ or -." };
  let destination: URL;
  try {
    const raw = input.destination.trim();
    if (raw.startsWith("/")) destination = new URL(raw, input.origin);
    else destination = new URL(raw);
  } catch {
    return { error: "Enter a site path or a full http(s) URL." };
  }
  if (destination.protocol !== "http:" && destination.protocol !== "https:") return { error: "Only http(s) destinations are allowed." };
  const origin = new URL(input.origin);
  if (destination.origin !== origin.origin) return { error: "Destination must stay on this PlayerPulser site." };
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) destination.searchParams.delete(key);
  destination.searchParams.set("utm_source", source);
  destination.searchParams.set("utm_medium", medium);
  destination.searchParams.set("utm_campaign", campaign);
  if (content) destination.searchParams.set("utm_content", content);
  if (term) destination.searchParams.set("utm_term", term);
  return {
    url: destination.toString(),
    values: { source, medium, campaign, content, term, fbclid: null, gclid: null, msclkid: null },
  };
}

export function addTaxonomyValue(list: string[], value: string, aliases: Record<string, string>): string[] {
  const normalized = normalizeUtm(value, aliases);
  if (!normalized || list.includes(normalized)) return list;
  return [...list, normalized];
}
