CREATE TABLE "NewsArticle" (
    "id" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "titleKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceHost" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "quickSummary" TEXT NOT NULL,
    "contextSummary" TEXT NOT NULL,
    "sentiment" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "relevance" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "verification" TEXT NOT NULL,
    "pricingEligible" BOOLEAN NOT NULL DEFAULT false,
    "summaryMode" TEXT NOT NULL DEFAULT 'source',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsArticle_canonicalUrl_key" ON "NewsArticle"("canonicalUrl");
CREATE INDEX "NewsArticle_publishedAt_idx" ON "NewsArticle"("publishedAt");
CREATE INDEX "NewsArticle_titleKey_idx" ON "NewsArticle"("titleKey");

CREATE TABLE "NewsArticlePlayer" (
    "articleId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,

    CONSTRAINT "NewsArticlePlayer_pkey" PRIMARY KEY ("articleId","playerId")
);

CREATE INDEX "NewsArticlePlayer_playerId_idx" ON "NewsArticlePlayer"("playerId");

CREATE TABLE "NewsRead" (
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsRead_pkey" PRIMARY KEY ("userId","articleId")
);

CREATE TABLE "NewsPulseHealth" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "status" TEXT NOT NULL DEFAULT 'idle',
    "lastSuccessAt" TIMESTAMPTZ(3),
    "lastErrorAt" TIMESTAMPTZ(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "playerCursor" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NewsPulseHealth_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "NewsArticlePlayer" ADD CONSTRAINT "NewsArticlePlayer_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NewsArticlePlayer" ADD CONSTRAINT "NewsArticlePlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NewsRead" ADD CONSTRAINT "NewsRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NewsRead" ADD CONSTRAINT "NewsRead_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
