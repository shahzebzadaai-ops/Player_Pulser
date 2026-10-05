import { describe, expect, it } from "vitest";
import {
  acceptModelSummary,
  assessNews,
  canonicalNewsUrl,
  deskAlert,
  newsBriefingStatus,
  fitsStoredNewsText,
  newsQueries,
  parseRssItems,
  customerSummary,
  extractArticleText,
  istDay,
  markupLeak,
  plainNewsText,
  publisherUrlFromGoogleLink,
  recycledStory,
  sameNewsEvent,
  selectBriefing,
  sourceSummaries,
  titleKey,
  trustedNewsHost,
  type NewsRosterPlayer,
} from "./news-pulse";

const roster: NewsRosterPlayer[] = [
  { id: "bumrah", slug: "jasprit-bumrah", name: "Jasprit Bumrah", shortName: "Bumrah" },
  { id: "kohli", slug: "virat-kohli", name: "Virat Kohli", shortName: "Kohli" },
];

describe("news pulse filter", () => {
  it("accepts a trusted injury story about a configured player", () => {
    const story = assessNews(
      "Jasprit Bumrah has been ruled out with an injury and will miss India's next Test.",
      roster,
      "www.cricbuzz.com",
    );
    expect(story?.players.map((player) => player.id)).toEqual(["bumrah"]);
    expect(story?.verification).toBe("TRUSTED_SOURCE");
    expect(story?.eventType).toBe("injury");
    expect(story?.pricingEligible).toBe(true);
    expect(story?.breaking).toBe(true);
  });

  it("rejects football and overseas cricket without an Indian connection", () => {
    expect(assessNews("Lionel Messi scored in the football final.", roster, "espncricinfo.com")).toBeNull();
    expect(assessNews("England beat Australia in a Test match at Lord's.", roster, "espncricinfo.com")).toBeNull();
  });

  it("rejects IPL copy that does not name a PlayerPulser player", () => {
    expect(assessNews("The IPL auction set a new fee record in Mumbai.", roster, "cricbuzz.com")).toBeNull();
  });

  it("keeps an untrusted player story on the desk without pricing eligibility", () => {
    const story = assessNews("Virat Kohli was named in the India squad for the Test series.", roster, "example.com");
    expect(story?.verification).toBe("UNVERIFIED");
    expect(story?.pricingEligible).toBe(false);
  });

  it("parses RSS without treating the document type as data", () => {
    expect(parseRssItems("<!DOCTYPE rss [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]>")).toEqual([]);
    const items = parseRssItems(`
      <rss><channel>
        <item>
          <title><![CDATA[Bumrah resumes training - Cricbuzz]]></title>
          <link>https://news.google.com/rss/articles/abc?utm_source=desk</link>
          <pubDate>Mon, 05 Oct 2026 02:00:00 GMT</pubDate>
          <description>Bumrah resumed training.</description>
          <source url="https://www.cricbuzz.com">Cricbuzz</source>
        </item>
      </channel></rss>
    `);
    expect(items[0]?.title).toBe("Bumrah resumes training");
    expect(items[0]?.sourceHost).toBe("cricbuzz.com");
    expect(trustedNewsHost(items[0]?.sourceHost ?? "")).toBe(true);
    expect(canonicalNewsUrl(items[0]?.link ?? "")).not.toContain("utm_source");
    expect(titleKey("Bumrah resumes training - Cricbuzz")).toBe(titleKey("Bumrah resumes training"));
    expect(fitsStoredNewsText("Bumrah resumes training")).toBe(true);
    expect(fitsStoredNewsText("बुमराह")).toBe(false);
  });

  it("does not turn a Google News link into the summary", () => {
    const raw = '&lt;a href=&quot;https://news.google.com/rss/articles/CBMiabc&quot;&gt;Bumrah resumes training&lt;/a&gt;';
    expect(plainNewsText(raw)).toBe("Bumrah resumes training");
    expect(markupLeak(raw)).toBe(true);
    expect(sourceSummaries("Bumrah resumes training", raw, ["Jasprit Bumrah"])).toBeNull();
    expect(customerSummary(raw)).toBeNull();
  });

  it("summarises only accessible article sentences", () => {
    const html = "<html><nav>Home Scores</nav><article><p>Jasprit Bumrah resumed training with the India squad on Monday.</p><p>The bowling coach said the fast bowler is expected to be assessed again before the next Test.</p><script>track()</script></article></html>";
    const text = extractArticleText(html);
    expect(text).not.toContain("Home Scores");
    expect(text).not.toContain("track");
    const summary = sourceSummaries("Bumrah resumes training", text, ["Jasprit Bumrah"]);
    expect(summary?.quickSummary).toContain("resumed training");
    expect(summary?.quickSummary.toLowerCase()).not.toContain("price will");
    expect(summary?.summaryMode).toBe("extract");
  });

  it("groups publisher time in India and drops recycled or duplicate stories", () => {
    const now = new Date("2026-10-05T08:00:00Z");
    expect(istDay(now)).toBe("2026-10-05");
    expect(recycledStory("Bumrah's 2024 injury update", now)).toBe(true);
    expect(sameNewsEvent("Bumrah ruled out of the India Test", "Jasprit Bumrah ruled out of India Test")).toBe(true);
    const article = "Jasprit Bumrah was ruled out of India's next Test with a reported side strain. Selectors will name a replacement before the match.";
    const rows = [
      { id: "today", title: "Bumrah ruled out of the India Test", summary: article, publishedAt: new Date("2026-10-05T02:00:00Z"), trusted: true, relevance: "high", players: 1 },
      { id: "copy", title: "Jasprit Bumrah ruled out of India Test", summary: article, publishedAt: new Date("2026-10-05T03:00:00Z"), trusted: false, relevance: "medium", players: 1 },
      { id: "old", title: "Kohli named in the India squad", summary: "Virat Kohli was named in India's squad for the upcoming Test series. The batting order will be confirmed closer to the match.", publishedAt: new Date("2026-10-03T02:00:00Z"), trusted: true, relevance: "medium", players: 1 },
      { id: "html", title: "India training report", summary: '<a href="https://news.google.com/rss/articles/x">', publishedAt: now, trusted: true, relevance: "low", players: 0 },
    ];
    const briefing = selectBriefing(rows, now);
    expect(briefing.today.map((row) => row.id)).toEqual(["today"]);
    expect(briefing.earlier.map((row) => row.id)).toEqual(["old"]);
  });

  it("reads a publisher address from a Google News token", () => {
    const token = Buffer.from("https://www.cricbuzz.com/cricket-news/bumrah-training", "utf8").toString("base64url");
    const link = publisherUrlFromGoogleLink(`https://news.google.com/rss/articles/${token}`);
    expect(link).toContain("cricbuzz.com");
  });

  it("drops an assistant summary that predicts a price", () => {
    const raw = JSON.stringify({
      quickSummary: "The price will surge after this injury.",
      contextSummary: "He is ruled out.",
      affectedPlayerIds: ["bumrah"],
      sentiment: "negative",
      eventType: "injury",
      relevance: "high",
      confidence: 90,
      pricingEligible: true,
      reasoning: "ignored",
    });
    expect(acceptModelSummary(raw, ["bumrah"])).toBeNull();
  });

  it("rotates player queries and signals high-impact unread news", () => {
    const first = newsQueries([{ name: "Jasprit Bumrah" }, { name: "Virat Kohli" }], 0);
    expect(first.queries.some((query) => query.includes("Jasprit Bumrah"))).toBe(true);
    expect(deskAlert([{ unread: true, eventType: "injury", relevance: "high", verification: "TRUSTED_SOURCE", sentiment: "negative" }], false)).toBe("high");
    expect(deskAlert([], true)).toBe("offline");
  });

  it("names article excerpts when no AI provider is configured", () => {
    const missing = newsBriefingStatus({ aiConfigured: false, assistantCards: 0, excerptCards: 3 });
    expect(missing.mode).toBe("extract");
    expect(missing.label).toBe("Article excerpts. AI summarisation is not configured.");
    expect(missing.label.toLowerCase()).not.toContain("ai summaries are active");
    const active = newsBriefingStatus({ aiConfigured: true, assistantCards: 2, excerptCards: 0 });
    expect(active.label).toBe("AI summaries are active.");
  });
});
