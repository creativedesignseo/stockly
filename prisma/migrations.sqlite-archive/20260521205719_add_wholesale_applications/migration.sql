-- CreateTable
CREATE TABLE "WholesaleApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "companyName" TEXT NOT NULL,
    "taxId" TEXT,
    "website" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "shopifyCustomerId" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WholesaleApplication_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WholesaleApplication_shopId_status_createdAt_idx" ON "WholesaleApplication"("shopId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WholesaleApplication_shopId_email_idx" ON "WholesaleApplication"("shopId", "email");
