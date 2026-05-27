-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "branding" TEXT,
    "copy" TEXT,
    "wholesaleTag" TEXT NOT NULL DEFAULT 'wholesale',
    "minOrderValue" REAL,
    "onboarded" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Tier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT,
    "minQty" INTEGER NOT NULL,
    "discountPct" REAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tier_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WholesaleCustomer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "shopifyCustomerId" TEXT NOT NULL,
    "email" TEXT,
    "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    CONSTRAINT "WholesaleCustomer_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Tier_shopId_active_idx" ON "Tier"("shopId", "active");

-- CreateIndex
CREATE INDEX "Tier_shopId_scope_scopeId_idx" ON "Tier"("shopId", "scope", "scopeId");

-- CreateIndex
CREATE INDEX "WholesaleCustomer_shopId_email_idx" ON "WholesaleCustomer"("shopId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "WholesaleCustomer_shopId_shopifyCustomerId_key" ON "WholesaleCustomer"("shopId", "shopifyCustomerId");
