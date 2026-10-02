-- CreateEnum
CREATE TYPE "CampaignLinkStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstTouchId" TEXT,
    "lastTouchId" TEXT,
    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisitSession" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "landingPage" TEXT NOT NULL,
    "referrer" TEXT,
    CONSTRAINT "VisitSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrafficTouch" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "content" TEXT,
    "term" TEXT,
    "fbclid" TEXT,
    "gclid" TEXT,
    "msclkid" TEXT,
    "landingPage" TEXT NOT NULL,
    "referrer" TEXT,
    "attributed" BOOLEAN NOT NULL DEFAULT false,
    "touchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrafficTouch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserAttribution" (
    "userId" TEXT NOT NULL,
    "signupTouchId" TEXT,
    "firstDepositTouchId" TEXT,
    "signupAt" TIMESTAMPTZ(3),
    "firstDepositAt" TIMESTAMPTZ(3),
    CONSTRAINT "UserAttribution_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT,
    "sessionId" TEXT,
    "userId" TEXT,
    "touchId" TEXT,
    "eventName" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "metadata" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignLink" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "utmSource" TEXT NOT NULL,
    "utmMedium" TEXT NOT NULL,
    "utmCampaign" TEXT NOT NULL,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "adSet" TEXT,
    "adName" TEXT,
    "creativeName" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "CampaignLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "CampaignLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visitor_userId_idx" ON "Visitor"("userId");
CREATE INDEX "VisitSession_visitorId_startedAt_idx" ON "VisitSession"("visitorId", "startedAt");
CREATE UNIQUE INDEX "TrafficTouch_sessionId_key" ON "TrafficTouch"("sessionId");
CREATE INDEX "TrafficTouch_visitorId_touchedAt_idx" ON "TrafficTouch"("visitorId", "touchedAt");
CREATE INDEX "TrafficTouch_source_campaign_idx" ON "TrafficTouch"("source", "campaign");
CREATE UNIQUE INDEX "AnalyticsEvent_dedupeKey_key" ON "AnalyticsEvent"("dedupeKey");
CREATE INDEX "AnalyticsEvent_eventName_occurredAt_idx" ON "AnalyticsEvent"("eventName", "occurredAt");
CREATE INDEX "AnalyticsEvent_userId_eventName_idx" ON "AnalyticsEvent"("userId", "eventName");
CREATE INDEX "AnalyticsEvent_touchId_idx" ON "AnalyticsEvent"("touchId");
CREATE INDEX "CampaignLink_status_createdAt_idx" ON "CampaignLink"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisitSession" ADD CONSTRAINT "VisitSession_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrafficTouch" ADD CONSTRAINT "TrafficTouch_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrafficTouch" ADD CONSTRAINT "TrafficTouch_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VisitSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAttribution" ADD CONSTRAINT "UserAttribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VisitSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
