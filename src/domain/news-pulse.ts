export const TRUSTED_NEWS_HOSTS = [
  "bcci.tv",
  "espncricinfo.com",
  "cricbuzz.com",
  "sportstar.thehindu.com",
  "indianexpress.com",
  "hindustantimes.com",
  "timesofindia.indiatimes.com",
] as const;

export const NEWS_SENTIMENTS = ["positive", "neutral", "negative"] as const;
export type NewsSentiment = (typeof NEWS_SENTIMENTS)[number];

export const NEWS_EVENT_TYPES = [
  "performance",
  "injury",
  "selection",
  "availability",
  "suspension",
  "retirement",
  "milestone",
  "controversy",
  "general",
] as const;
export type NewsEventType = (typeof NEWS_EVENT_TYPES)[number];

export const NEWS_RELEVANCE = ["low", "medium", "high"] as const;
export type NewsRelevance = (typeof NEWS_RELEVANCE)[number];

export const HIGH_IMPACT_EVENTS = ["injury", "suspension", "retirement", "availability"] as const;

const CRICKET_TERMS = [
  "cricket",
  "test",
  "odi",
  "t20",
  "wicket",
  "innings",
  "bowler",
  "batter",
  "batsman",
  "match",
  "squad",
  "selection",
  "injury",
  "training",
  "century",
  "bowling",
  "batting",
  "series",
  "ipl",
  "bcci",
  "ranji",
  "stump",
];

const INDIA_MARKERS = [
  "team india",
  "bcci",
  "indian cricket",
  "india cricket",
  "indian team",
  "men in blue",
];

const EXTRA_ALIASES: Record<string, string[]> = {
  "virat-kohli": ["virat", "kohli"],
  "rohit-sharma": ["rohit sharma", "rohit"],
  "jasprit-bumrah": ["bumrah"],
  "ravindra-jadeja": ["jadeja"],
  "rishabh-pant": ["pant"],
  "shubman-gill": ["shubman", "gill"],
  "hardik-pandya": ["hardik", "pandya"],
  "suryakumar-yadav": ["suryakumar"],
  "kl-rahul": ["kl rahul"],
  "yashasvi-jaiswal": ["jaiswal"],
  "mohammed-shami": ["shami"],
  "mohammed-siraj": ["siraj"],
  "kuldeep-yadav": ["kuldeep"],
  "yuzvendra-chahal": ["chahal"],
  "axar-patel": ["axar"],
  "ravichandran-ashwin": ["ashwin"],
  "sanju-samson": ["samson"],
  "shreyas-iyer": ["iyer"],
  "ishan-kishan": ["kishan"],
  "arshdeep-singh": ["arshdeep"],
  "washington-sundar": ["sundar"],
  "tilak-varma": ["tilak varma"],
  "abhishek-sharma": ["abhishek sharma"],
  "nitish-kumar-reddy": ["nitish reddy"],
};

export type NewsRosterPlayer = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
};

export type NewsAssessment = {
  players: NewsRosterPlayer[];
  sentiment: NewsSentiment;
  eventType: NewsEventType;
  relevance: NewsRelevance;
  confidence: number;
  verification: "TRUSTED_SOURCE" | "UNVERIFIED";
  pricingEligible: boolean;
  breaking: boolean;
  reasoning: string;
};

export type RssItem = {
  title: string;
  link: string;
  publishedAt: Date | null;
  description: string;
  sourceName: string;
  sourceHost: string;
};

const BANNED_SUMMARY = [/price will/i, /will surge/i, /will crash/i, /guaranteed/i, /certain to/i, /skyrocket/i, /must buy/i, /must sell/i];

export function newsQueries(roster: Array<{ name: string }>, cursor: number): { queries: string[]; nextCursor: number } {
  const general = [`"Team India" cricket`, "BCCI cricket", `"Indian cricket"`, `"India cricket"`];
  if (roster.length === 0) return { queries: general, nextCursor: 0 };
  const start = ((cursor % roster.length) + roster.length) % roster.length;
  const batch: string[] = [];
  for (let index = 0; index < Math.min(8, roster.length); index += 1) {
    const player = roster[(start + index) % roster.length];
    batch.push(`"${player.name}" cricket`);
  }
  const nextCursor = (start + batch.length) % roster.length;
  return { queries: [...general, ...batch], nextCursor };
}

export function googleNewsRssUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    hl: "en-IN",
    gl: "IN",
    ceid: "IN:en",
  });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

export function parseRssItems(xml: string): RssItem[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return [];
  const items: RssItem[] = [];
  const pattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) && items.length < 30) {
    const block = match[1] ?? "";
    const title = cleanText(tagValue(block, "title"));
    const link = cleanText(tagValue(block, "link"));
    if (!title || !link) continue;
    const source = sourceFrom(block);
    const published = Date.parse(tagValue(block, "pubDate"));
    items.push({
      title: title.replace(/\s+-\s+[^-]+$/, "").trim() || title,
      link,
      publishedAt: Number.isNaN(published) ? null : new Date(published),
      description: cleanText(tagValue(block, "description")).slice(0, 500),
      sourceName: source.name || hostOf(link) || "Source",
      sourceHost: source.host || hostOf(link),
    });
  }
  return items;
}

export function fitsStoredNewsText(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 255) return false;
  }
  return true;
}

export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+-\s+[^-]+$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 180);
}

export function canonicalNewsUrl(link: string): string {
  try {
    const url = new URL(link);
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || key.toLowerCase() === "oc") url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
  } catch {
    return link.trim();
  }
}

export function trustedNewsHost(host: string): boolean {
  const normalized = host.replace(/^www\./, "").toLowerCase();
  return TRUSTED_NEWS_HOSTS.some((trusted) => normalized === trusted || normalized.endsWith(`.${trusted}`));
}

export function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function assessNews(text: string, roster: NewsRosterPlayer[], sourceHost: string): NewsAssessment | null {
  const players = matchPlayers(text, roster);
  const cricket = hasCricketContext(text);
  const india = hasIndiaMarker(text);
  if (!cricket) return null;
  if (!players.length && !india) return null;
  const iplOnly = /\bipl\b/i.test(text) && !/\b(test|odi|t20|bcci|squad|innings|wicket)\b/i.test(text);
  if (iplOnly && !players.length) return null;
  const eventType = detectEvent(text);
  const sentiment = detectSentiment(text, eventType);
  const verification = trustedNewsHost(sourceHost) ? "TRUSTED_SOURCE" : "UNVERIFIED";
  const relevance: NewsRelevance = players.length && (HIGH_IMPACT_EVENTS as readonly string[]).includes(eventType)
    ? "high"
    : players.length
      ? "medium"
      : "low";
  let confidence = players.length ? 55 : 40;
  if (verification === "TRUSTED_SOURCE") confidence += 15;
  if (relevance === "high") confidence += 10;
  confidence = Math.min(95, confidence);
  const pricingEligible = verification === "TRUSTED_SOURCE" && players.length > 0 && relevance === "high" && confidence >= 70;
  const names = players.map((player) => player.name).join(", ");
  return {
    players,
    sentiment,
    eventType,
    relevance,
    confidence,
    verification,
    pricingEligible,
    breaking: pricingEligible && sentiment === "negative" && (HIGH_IMPACT_EVENTS as readonly string[]).includes(eventType),
    reasoning: pricingEligible
      ? `Trusted source story about ${names}. Eligible for a later pricing review. This desk does not move the quote.`
      : "Display only. The story is not a confirmed price input.",
  };
}

export function sourceSummaries(_title: string, description: string, _playerNames: string[]) {
  const summary = extractiveSummary(description);
  if (!summary) return null;
  return {
    quickSummary: summary,
    contextSummary: summary,
    summaryMode: "extract" as const,
  };
}

export function plainNewsText(value: string): string {
  let text = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = decodeEntities(text);
    if (decoded === text) break;
    text = decoded;
  }
  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

export function markupLeak(value: string): boolean {
  return /<\/?[a-z!]|href\s*=|&lt;|&gt;|news\.google\.com|source summary|full article was not copied/i.test(value);
}

export function extractiveSummary(articleText: string): string | null {
  const plain = plainNewsText(articleText);
  if (!plain || markupLeak(plain) || markupLeak(articleText)) return null;
  const sentences = plain
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 40 && !/^https?:/i.test(sentence) && !markupLeak(sentence));
  if (sentences.length === 0) return null;
  const summary = sentences.slice(0, 2).join(" ");
  if (summary.length < 80 || summary.length > 360) return null;
  if (BANNED_SUMMARY.some((pattern) => pattern.test(summary))) return null;
  return summary;
}

export function customerSummary(value: string): string | null {
  const text = plainNewsText(value);
  if (!text || markupLeak(text) || markupLeak(value)) return null;
  if (text.length < 40 || text.length > 360) return null;
  if (BANNED_SUMMARY.some((pattern) => pattern.test(text))) return null;
  return text;
}

export function extractArticleText(html: string): string {
  const withoutJunk = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ");
  const article = withoutJunk.match(/<article\b[\s\S]*?<\/article>/i)?.[0]
    ?? withoutJunk.match(/<main\b[\s\S]*?<\/main>/i)?.[0]
    ?? withoutJunk;
  const text = plainNewsText(article);
  const blocked = /subscribe to (read|continue)|sign in to read|this article is for subscribers/i.test(text) && text.length < 900;
  if (!text || blocked) return "";
  return text.slice(0, 4000);
}

export function publisherUrlFromGoogleLink(link: string): string | null {
  const id = link.match(/news\.google\.com\/rss\/articles\/([^?&#]+)/i)?.[1];
  if (!id) return null;
  const normalized = id.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.length % 4 === 0 ? normalized : normalized + "=".repeat(4 - (normalized.length % 4));
  let decoded = "";
  try {
    decoded = Buffer.from(padded, "base64").toString("latin1");
  } catch {
    return null;
  }
  const match = decoded.match(/https?:\/\/[a-z0-9._~:/?#[\]@!$&'()*+,;=%-]{12,}/i);
  if (!match) return null;
  const url = match[0].replace(/[)\].,]+$/g, "");
  const host = hostOf(url);
  if (!host || host.includes("google.") || host.includes("gstatic.")) return null;
  return url;
}

export function canonicalFromHtml(html: string): string | null {
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0]
    ?? html.match(/<meta[^>]+property=["']og:url["'][^>]*>/i)?.[0]
    ?? "";
  const href = canonical.match(/\b(?:href|content)=["']([^"']+)["']/i)?.[1] ?? "";
  if (!href.startsWith("http")) return null;
  const host = hostOf(href);
  if (!host || host.includes("google.") || host.includes("gstatic.")) return null;
  return href;
}

const EVENT_STOP = new Set(["the", "and", "for", "with", "after", "from", "that", "this", "will", "have", "been", "india", "indian", "cricket", "team", "match", "report", "says", "over", "into", "than"]);

export function eventTokens(title: string): string[] {
  return titleKey(title).split(" ").filter((word) => word.length > 2 && !EVENT_STOP.has(word)).slice(0, 8);
}

export function sameNewsEvent(left: string, right: string): boolean {
  const tokens = new Set(eventTokens(left));
  const shared = eventTokens(right).filter((word) => tokens.has(word)).length;
  return shared >= 3;
}

export function istDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function formatIstPublished(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function recycledStory(title: string, publishedAt: Date): boolean {
  const pubYear = Number(istDay(publishedAt).slice(0, 4));
  return [...title.matchAll(/\b(20\d{2})\b/g)].some((match) => Number(match[1]) < pubYear);
}

export type BriefingRow = {
  id: string;
  title: string;
  summary: string;
  publishedAt: Date;
  trusted: boolean;
  relevance: string;
  players: number;
};

export function selectBriefing<T extends BriefingRow>(rows: T[], now: Date): { today: T[]; earlier: T[] } {
  const todayKey = istDay(now);
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const usable = rows.filter((row) => {
    const summary = customerSummary(row.summary);
    return Boolean(summary)
      && row.publishedAt.getTime() >= weekAgo
      && row.publishedAt.getTime() <= now.getTime() + 60_000
      && !recycledStory(row.title, row.publishedAt);
  });
  const deduped = dedupeBriefing(usable);
  const fresh = deduped.filter((row) => istDay(row.publishedAt) === todayKey);
  const today = [...fresh].sort(byUsefulness).slice(0, 5);
  const chosen = new Set(today.map((row) => row.id));
  const earlier = deduped
    .filter((row) => !chosen.has(row.id))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, 8);
  return { today, earlier };
}

function dedupeBriefing<T extends BriefingRow>(rows: T[]): T[] {
  const ranked = [...rows].sort(byUsefulness);
  const kept: T[] = [];
  for (const row of ranked) {
    if (kept.some((item) => sameNewsEvent(item.title, row.title))) continue;
    kept.push(row);
  }
  return kept;
}

function byUsefulness(a: BriefingRow, b: BriefingRow): number {
  return usefulness(b) - usefulness(a) || b.publishedAt.getTime() - a.publishedAt.getTime();
}

function usefulness(row: BriefingRow): number {
  return (row.trusted ? 3 : 0) + Math.min(row.players, 2) + (row.relevance === "high" ? 2 : row.relevance === "medium" ? 1 : 0);
}

export function acceptBriefingSummary(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const body = parsed as Record<string, unknown>;
  const summary = typeof body.summary === "string" ? body.summary : "";
  return customerSummary(summary);
}

export function acceptModelSummary(raw: string, allowedPlayerIds: string[]) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const body = parsed as Record<string, unknown>;
  const quickSummary = typeof body.quickSummary === "string" ? body.quickSummary.replace(/\s+/g, " ").trim() : "";
  const contextSummary = typeof body.contextSummary === "string" ? body.contextSummary.replace(/\s+/g, " ").trim() : "";
  if (!quickSummary || !contextSummary) return null;
  if (BANNED_SUMMARY.some((pattern) => pattern.test(quickSummary) || pattern.test(contextSummary))) return null;
  const sentiment = NEWS_SENTIMENTS.includes(body.sentiment as NewsSentiment) ? (body.sentiment as NewsSentiment) : null;
  const eventType = NEWS_EVENT_TYPES.includes(body.eventType as NewsEventType) ? (body.eventType as NewsEventType) : null;
  const relevance = NEWS_RELEVANCE.includes(body.relevance as NewsRelevance) ? (body.relevance as NewsRelevance) : null;
  if (!sentiment || !eventType || !relevance) return null;
  const ids = Array.isArray(body.affectedPlayerIds)
    ? body.affectedPlayerIds.filter((id): id is string => typeof id === "string" && allowedPlayerIds.includes(id))
    : [];
  return {
    quickSummary: quickSummary.slice(0, 240),
    contextSummary: contextSummary.slice(0, 420),
    sentiment,
    eventType,
    relevance,
    affectedPlayerIds: ids,
    summaryMode: "assistant" as const,
  };
}

export function relativeNewsTime(from: Date, now = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function categoryLabel(eventType: string): string {
  if (eventType === "injury") return "Injury";
  if (eventType === "selection") return "Selection";
  if (eventType === "availability") return "Availability";
  if (eventType === "suspension") return "Suspension";
  if (eventType === "retirement") return "Retirement";
  if (eventType === "performance") return "Performance";
  if (eventType === "milestone") return "Milestone";
  if (eventType === "controversy") return "Controversy";
  return "Indian cricket";
}

export type DeskSignal = {
  unread: boolean;
  eventType: string;
  relevance: string;
  verification: string;
  sentiment: string;
};

export function newsBriefingStatus(input: {
  aiConfigured: boolean;
  assistantCards: number;
  excerptCards: number;
}): { aiConfigured: boolean; mode: "assistant" | "extract"; label: string } {
  if (!input.aiConfigured) {
    return {
      aiConfigured: false,
      mode: "extract",
      label: "Article excerpts. AI summarisation is not configured.",
    };
  }
  if (input.excerptCards > 0 && input.assistantCards === 0) {
    return {
      aiConfigured: true,
      mode: "extract",
      label: "Article excerpts. The configured AI summary did not return usable text for the latest cards.",
    };
  }
  if (input.assistantCards > 0 && input.excerptCards > 0) {
    return {
      aiConfigured: true,
      mode: "assistant",
      label: "AI summaries are active. Extra cards in the same cycle stay as article excerpts.",
    };
  }
  if (input.assistantCards > 0) {
    return { aiConfigured: true, mode: "assistant", label: "AI summaries are active." };
  }
  return {
    aiConfigured: true,
    mode: "assistant",
    label: "AI summaries are configured. No new card was stored in the latest cycle.",
  };
}

export function deskAlert(items: DeskSignal[], unhealthy: boolean): "offline" | "idle" | "new" | "important" | "high" {
  if (unhealthy) return "offline";
  const unread = items.filter((item) => item.unread);
  if (unread.some((item) => item.relevance === "high" && item.sentiment === "negative" && (HIGH_IMPACT_EVENTS as readonly string[]).includes(item.eventType))) {
    return "high";
  }
  if (unread.some((item) => item.verification === "TRUSTED_SOURCE" && item.relevance === "high")) return "important";
  if (unread.length > 0) return "new";
  return "idle";
}

export function matchPlayers(text: string, roster: NewsRosterPlayer[]): NewsRosterPlayer[] {
  return roster.filter((player) => aliasesFor(player).some((alias) => hasTerm(text, alias)));
}

function aliasesFor(player: NewsRosterPlayer): string[] {
  const aliases = new Set<string>();
  if (player.name.trim().length >= 4) aliases.add(player.name.trim().toLowerCase());
  if (player.shortName.trim().length >= 4) aliases.add(player.shortName.trim().toLowerCase());
  for (const alias of EXTRA_ALIASES[player.slug] ?? []) {
    if (alias.trim().length >= 4) aliases.add(alias.trim().toLowerCase());
  }
  return [...aliases];
}

function hasIndiaMarker(text: string): boolean {
  const lower = text.toLowerCase();
  if (INDIA_MARKERS.some((marker) => lower.includes(marker))) return true;
  return /\bindia's\b/i.test(text) || /\bindia\b/i.test(text);
}

function hasCricketContext(text: string): boolean {
  return CRICKET_TERMS.some((term) => hasTerm(text, term));
}

function hasTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(text);
}

function detectEvent(text: string): NewsEventType {
  const lower = text.toLowerCase();
  if (/\bretired|retirement\b/.test(lower)) return "retirement";
  if (/\bsuspend/.test(lower)) return "suspension";
  if (/\breturn|resumed training|declared fit|available again|passed fit\b/.test(lower)) return "availability";
  if (/\binjur|ruled out|fracture|hamstring\b/.test(lower)) return "injury";
  if (/\bselected|squad|dropped|named in\b/.test(lower)) return "selection";
  if (/\bcentury|fifty|five-wicket|hat-trick\b/.test(lower)) return "performance";
  if (/\brecord\b/.test(lower)) return "milestone";
  if (/\bcontroversy|allegat/.test(lower)) return "controversy";
  return "general";
}

function detectSentiment(text: string, eventType: NewsEventType): NewsSentiment {
  if (eventType === "injury" || eventType === "suspension" || eventType === "retirement") return "negative";
  if (eventType === "availability" || eventType === "performance" || eventType === "milestone") return "positive";
  if (/\bdropped|ruled out|doubt\b/i.test(text)) return "negative";
  if (/\bselected|fit|returns\b/i.test(text)) return "positive";
  return "neutral";
}

function tagValue(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match?.[1] ?? "";
}

function sourceFrom(block: string): { name: string; host: string } {
  const match = block.match(/<source\b([^>]*)>([\s\S]*?)<\/source>/i);
  const url = match?.[1]?.match(/\burl=["']([^"']+)["']/i)?.[1] ?? "";
  return { name: cleanText(match?.[2] ?? ""), host: hostOf(url) };
}

function cleanText(value: string): string {
  return plainNewsText(value);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
