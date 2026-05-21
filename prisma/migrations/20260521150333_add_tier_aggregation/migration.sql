-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT,
    "minQty" INTEGER NOT NULL,
    "discountPct" REAL NOT NULL,
    "aggregation" TEXT NOT NULL DEFAULT 'per_line',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tier_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Tier" ("active", "createdAt", "discountPct", "id", "minQty", "name", "position", "scope", "scopeId", "shopId", "updatedAt") SELECT "active", "createdAt", "discountPct", "id", "minQty", "name", "position", "scope", "scopeId", "shopId", "updatedAt" FROM "Tier";
DROP TABLE "Tier";
ALTER TABLE "new_Tier" RENAME TO "Tier";
CREATE INDEX "Tier_shopId_active_idx" ON "Tier"("shopId", "active");
CREATE INDEX "Tier_shopId_scope_scopeId_idx" ON "Tier"("shopId", "scope", "scopeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
