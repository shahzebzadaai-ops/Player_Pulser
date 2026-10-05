import { bittuAiConfigured } from "@/domain/bittu-help";
import {
  acceptBriefingSummary,
  assessNews,
  canonicalFromHtml,
  canonicalNewsUrl,
  customerSummary,
  extractArticleText,
  extractiveSummary,
  fitsStoredNewsText,
  formatIstPublished,
  hostOf,
  deskAlert,
  googleNewsRssUrl,
  markupLeak,
  newsBriefingStatus,
  newsQueries,
  parseRssItems,
  plainNewsText,
  publisherUrlFromGoogleLink,
  recycledStory,
  sameNewsEvent,
  selectBriefing,
  titleKey,
  type NewsRosterPlayer,
} from "@/domain/news-pulse";
import { getFeatures } from "./features";
import { prisma } from "./prisma";

const STALE_MS = 20 * 60 * 1000;

export async function runNewsPulseCycle() {
  const features = await getFeatures();
  if (!features.newsPulseEnabled) return;
  const roster = await prisma.player.findMany({
    where: { country: "INDIA", tradable: true },
    select: { id: true, slug: true, name: true, shortName: true },
    orderBy: { name: "asc" },
  });
  const health = await prisma.newsPulseHealth.findUnique({ where: { id: "default" } });
  const plan = newsQueries(roster, health?.playerCursor ?? 0);
  let stored = 0;
  let failed = 0;
  let assisted = 0;
  const seen = new Set<string>();
  const omitted: Array<{ title: string; reason: string }> = [];
  await repairDirtyArticles(roster, omitted);
  for (const query of plan.queries) {
    try {
      const xml = await fetchRss(googleNewsRssUrl(query));
      for (const item of parseRssItems(xml)) {
        const saved = await storeItem(item, roster, seen, assisted < 3, omitted);
        if (saved === "stored") stored += 1;
        if (saved === "assisted") {
          stored += 1;
          assisted += 1;
        }
      }
    } catch {
      failed += 1;
    }
  }
  const ok = failed < plan.queries.length;
  await prisma.newsPulseHealth.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      status: ok ? "ok" : "error",
      lastSuccessAt: ok ? new Date() : null,
      lastErrorAt: ok ? null : new Date(),
      lastError: ok ? "" : "Google News RSS request failed",
      playerCursor: plan.nextCursor,
    },
    update: {
      status: ok ? "ok" : "error",
      playerCursor: plan.nextCursor,
      ...(ok
        ? { lastSuccessAt: new Date(), lastError: "" }
        : { lastErrorAt: new Date(), lastError: "Google News RSS request failed" }),
    },
  });
  const briefing = newsBriefingStatus({
    aiConfigured: bittuAiConfigured(),
    assistantCards: assisted,
    excerptCards: Math.max(0, stored - assisted),
  });
  const reportedAt = new Date().toISOString();
  await prisma.appSetting.upsert({
    where: { key: "news.omitLog" },
    create: { key: "news.omitLog", value: { notes: omitted.slice(0, 12), at: reportedAt } },
    update: { value: { notes: omitted.slice(0, 12), at: reportedAt } },
  });
  await prisma.appSetting.upsert({
    where: { key: "news.briefingSource" },
    create: { key: "news.briefingSource", value: { ...briefing, assistantCards: assisted, excerptCards: Math.max(0, stored - assisted), at: reportedAt } },
    update: { value: { ...briefing, assistantCards: assisted, excerptCards: Math.max(0, stored - assisted), at: reportedAt } },
  });
  console.log(JSON.stringify({
    level: "info",
    message: "news pulse",
    queries: plan.queries.length,
    stored,
    failed,
    omitted: omitted.length,
    at: new Date().toISOString(),
  }));
}

export async function newsDesk(userId: string, playerId?: string) {
  const features = await getFeatures();
  if (!features.newsPulseEnabled) {
    return { enabled: false, alert: "offline" as const, unread: 0, lastSuccessAt: null as string | null, today: [], earlier: [] };
  }
  const health = await prisma.newsPulseHealth.findUnique({ where: { id: "default" } });
  const articles = await prisma.newsArticle.findMany({
    where: {
      publishedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      ...(playerId ? { players: { some: { playerId } } } : {}),
    },
    orderBy: { publishedAt: "desc" },
    take: 30,
    include: {
      players: { include: { player: { select: { id: true, slug: true, name: true } } } },
      reads: { where: { userId }, select: { articleId: true } },
    },
  });
  const now = new Date();
  const visible = articles.flatMap((article) => {
    const summary = customerSummary(article.quickSummary);
    if (!summary || article.summaryMode === "invalid") return [];
    const publisherUrl = article.canonicalUrl.includes("news.google.com") ? "" : article.canonicalUrl;
    return [{
      id: article.id,
      title: plainNewsText(article.title),
      summary,
      sourceName: article.sourceName,
      url: publisherUrl,
      publishedAt: article.publishedAt,
      publishedLabel: formatIstPublished(article.publishedAt),
      trusted: article.verification === "TRUSTED_SOURCE",
      relevance: article.relevance,
      players: article.players.length,
      unread: article.reads.length === 0,
      eventType: article.eventType,
      verification: article.verification,
      sentiment: article.sentiment,
    }];
  });
  const grouped = selectBriefing(visible, now);
  const cards = [...grouped.today, ...grouped.earlier];
  const stale = Boolean(health?.lastSuccessAt && now.getTime() - health.lastSuccessAt.getTime() > STALE_MS);
  const unhealthy = health?.status === "error" || stale;
  const present = (rows: typeof visible) => rows.map((card) => ({
    id: card.id,
    title: card.title,
    summary: card.summary,
    sourceName: card.sourceName,
    url: card.url,
    publishedLabel: card.publishedLabel,
    unread: card.unread,
  }));
  return {
    enabled: true,
    alert: deskAlert(cards, unhealthy),
    unread: cards.filter((card) => card.unread).length,
    lastSuccessAt: health?.lastSuccessAt?.toISOString() ?? null,
    today: present(grouped.today),
    earlier: present(grouped.earlier),
  };
}

export async function markNewsSeen(userId: string, ids: string[]) {
  const unique = [...new Set(ids)].slice(0, 40);
  if (!unique.length) return;
  const existing = await prisma.newsArticle.findMany({ where: { id: { in: unique } }, select: { id: true } });
  if (!existing.length) return;
  await prisma.newsRead.createMany({
    data: existing.map((row) => ({ userId, articleId: row.id })),
    skipDuplicates: true,
  });
}

async function storeItem(
  item: { title: string; link: string; publishedAt: Date | null; description: string; sourceName: string; sourceHost: string },
  roster: NewsRosterPlayer[],
  seen: Set<string>,
  allowAssistant: boolean,
  omitted: Array<{ title: string; reason: string }>,
): Promise<"stored" | "assisted" | "skip"> {
  const discoveryUrl = canonicalNewsUrl(item.link);
  const key = titleKey(item.title);
  if (!discoveryUrl || !key || seen.has(discoveryUrl) || seen.has(key)) return "skip";
  if (!item.publishedAt) {
    omitted.push({ title: item.title.slice(0, 120), reason: "No publisher timestamp" });
    return "skip";
  }
  if (recycledStory(item.title, item.publishedAt)) {
    omitted.push({ title: item.title.slice(0, 120), reason: "Recycled story is older than its publication day" });
    return "skip";
  }
  const plainTitle = plainNewsText(item.title);
  if (!fitsStoredNewsText(`${plainTitle} ${item.sourceName}`)) return "skip";
  seen.add(discoveryUrl);
  seen.add(key);
  const assessment = assessNews(plainTitle, roster, item.sourceHost);
  if (!assessment) return "skip";
  const recent = await prisma.newsArticle.findMany({
    where: { publishedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    select: { id: true, title: true, canonicalUrl: true, titleKey: true, summaryMode: true },
    take: 80,
  });
  if (recent.some((row) => row.canonicalUrl === discoveryUrl || row.titleKey === key || (row.summaryMode !== "invalid" && sameNewsEvent(row.title, plainTitle)))) {
    return "skip";
  }
  const article = await loadPublisherArticle(item.link);
  if (!article) {
    omitted.push({ title: plainTitle.slice(0, 120), reason: "Publisher article text was not accessible" });
    return "skip";
  }
  const assisted = allowAssistant ? await summarizeWithModel(plainTitle, article.text) : null;
  const summary = assisted ?? extractiveSummary(article.text);
  if (!summary || !fitsStoredNewsText(`${plainTitle} ${summary}`)) {
    omitted.push({ title: plainTitle.slice(0, 120), reason: summary ? "Summary could not be stored" : "Not enough article text for a factual summary" });
    return "skip";
  }
  const summaryMode = assisted ? "assistant" : "extract";
  try {
    await prisma.newsArticle.create({
      data: {
        canonicalUrl: canonicalNewsUrl(article.url),
        titleKey: key,
        title: plainTitle.slice(0, 240),
        sourceName: item.sourceName.slice(0, 80),
        sourceHost: (article.host || item.sourceHost).slice(0, 120),
        publishedAt: item.publishedAt,
        description: article.text.slice(0, 500),
        quickSummary: summary,
        contextSummary: summary,
        sentiment: assessment.sentiment,
        eventType: assessment.eventType,
        relevance: assessment.relevance,
        confidence: assessment.confidence,
        verification: assessment.verification,
        pricingEligible: assessment.pricingEligible,
        summaryMode,
        players: { create: assessment.players.map((player) => ({ playerId: player.id })) },
      },
    });
  } catch {
    return "skip";
  }
  return summaryMode === "assistant" ? "assisted" : "stored";
}

async function repairDirtyArticles(roster: NewsRosterPlayer[], omitted: Array<{ title: string; reason: string }>) {
  const dirty = await prisma.newsArticle.findMany({
    where: {
      OR: [
        { quickSummary: { contains: "<" } },
        { quickSummary: { contains: "news.google.com" } },
        { contextSummary: { contains: "<" } },
        { description: { contains: "<a" } },
        { summaryMode: "source" },
      ],
    },
    take: 8,
    orderBy: { publishedAt: "desc" },
  });
  for (const row of dirty) {
    if (!markupLeak(row.quickSummary) && !markupLeak(row.contextSummary) && !markupLeak(row.description) && row.summaryMode !== "source" && customerSummary(row.quickSummary)) {
      continue;
    }
    const article = await loadPublisherArticle(row.canonicalUrl);
    const assisted = article ? await summarizeWithModel(row.title, article.text) : null;
    const summary = assisted ?? (article ? extractiveSummary(article.text) : null);
    if (!summary || !article) {
      omitted.push({ title: row.title.slice(0, 120), reason: "Cached card had raw markup and could not be rebuilt" });
      await prisma.newsArticle.update({
        where: { id: row.id },
        data: { summaryMode: "invalid", quickSummary: "", contextSummary: "", description: plainNewsText(row.description).slice(0, 240) },
      });
      continue;
    }
    const assessment = assessNews(`${row.title}. ${article.text.slice(0, 400)}`, roster, article.host || row.sourceHost);
    const description = fitsStoredNewsText(article.text.slice(0, 500)) ? article.text.slice(0, 500) : "";
    if (!fitsStoredNewsText(summary)) {
      omitted.push({ title: row.title.slice(0, 120), reason: "Rebuilt summary could not be stored" });
      continue;
    }
    try {
      await prisma.newsArticle.update({
        where: { id: row.id },
        data: {
          canonicalUrl: canonicalNewsUrl(article.url),
          description,
          quickSummary: summary,
          contextSummary: summary,
          summaryMode: assisted ? "assistant" : "extract",
          ...(assessment ? { sentiment: assessment.sentiment, eventType: assessment.eventType, relevance: assessment.relevance, verification: assessment.verification, pricingEligible: assessment.pricingEligible } : {}),
        },
      });
    } catch {
      omitted.push({ title: row.title.slice(0, 120), reason: "Rebuilt article could not replace the cached card" });
    }
  }
}

async function loadPublisherArticle(link: string): Promise<{ url: string; host: string; text: string } | null> {
  const decoded = publisherUrlFromGoogleLink(link);
  const seeds = [decoded, hostOf(link).includes("google.") ? null : link].filter((value): value is string => Boolean(value));
  for (const seed of seeds) {
    const page = await fetchDocument(seed);
    if (!page) continue;
    const canonical = canonicalFromHtml(page.html);
    const articleUrl = canonical ?? (hostOf(page.url).includes("google.") ? null : page.url);
    if (!articleUrl) continue;
    const articlePage = articleUrl === page.url ? page : await fetchDocument(articleUrl);
    if (!articlePage) continue;
    const text = extractArticleText(articlePage.html);
    if (text.length < 200) continue;
    return { url: articlePage.url, host: hostOf(articlePage.url), text };
  }
  return null;
}

async function fetchDocument(url: string): Promise<{ url: string; html: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "PlayerPulserNewsPulse/1.0",
      },
    });
    if (!response.ok) return null;
    const html = await response.text();
    if (html.length > 1_500_000) return null;
    return { url: response.url || url, html };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function summarizeWithModel(title: string, articleText: string) {
  if (!bittuAiConfigured()) return null;
  if (markupLeak(articleText) || articleText.includes("news.google.com/rss")) return null;
  const base = (process.env.BITTU_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.BITTU_AI_MODEL || "gpt-4o-mini";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.BITTU_AI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 220,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You write a cricket news summary for PlayerPulser. Return JSON only: {\"summary\":\"...\"}.",
              "The summary is one or two short sentences in plain English.",
              "Say what happened, who was involved, and the confirmed detail.",
              "Use only the article text. If a fact is uncertain, say it is reported and not confirmed.",
              "Do not invent quotes, scores, injuries, or dates. Do not mention prices, buying, or selling.",
              "Do not include HTML, URLs, or the words Quick Take.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({ title: title.slice(0, 180), article: articleText.slice(0, 3500) }),
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return acceptBriefingSummary(body.choices?.[0]?.message?.content ?? "");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRss(url: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await readRss(url);
    } catch (error) {
      lastError = error;
      await delay(attempt === 0 ? 400 : 1200);
    }
  }
  throw lastError;
}

async function readRss(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        accept: "application/rss+xml, application/xml, text/xml",
        "user-agent": "PlayerPulserNewsPulse/1.0",
      },
    });
    if (!response.ok) throw new Error("rss");
    const text = await response.text();
    if (text.length > 1_500_000) throw new Error("rss-size");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
