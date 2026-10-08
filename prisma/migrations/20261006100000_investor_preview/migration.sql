CREATE TABLE "InvestorPreviewToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdByAdminId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdIp" TEXT,
    "usedIp" TEXT,
    CONSTRAINT "InvestorPreviewToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvestorPreviewToken_tokenHash_key" ON "InvestorPreviewToken"("tokenHash");
CREATE INDEX "InvestorPreviewToken_createdByAdminId_idx" ON "InvestorPreviewToken"("createdByAdminId");
CREATE INDEX "InvestorPreviewToken_expiresAt_idx" ON "InvestorPreviewToken"("expiresAt");

ALTER TABLE "InvestorPreviewToken" ADD CONSTRAINT "InvestorPreviewToken_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
