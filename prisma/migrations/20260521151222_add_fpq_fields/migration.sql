-- AlterTable
ALTER TABLE "WholesaleCustomer" ADD COLUMN "qualifiedAt" DATETIME;
ALTER TABLE "WholesaleCustomer" ADD COLUMN "qualifyingOrderAmount" REAL;
ALTER TABLE "WholesaleCustomer" ADD COLUMN "qualifyingOrderId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "branding" TEXT,
    "copy" TEXT,
    "wholesaleTag" TEXT NOT NULL DEFAULT 'wholesale',
    "minOrderValue" REAL,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "wholesaleBaselinePct" INTEGER NOT NULL DEFAULT 0,
    "fpqMode" TEXT NOT NULL DEFAULT 'none',
    "fpqAmount" REAL,
    "fpqQuantity" INTEGER,
    "fpqCombinedLogic" TEXT NOT NULL DEFAULT 'and',
    "postQualificationMOQ" INTEGER NOT NULL DEFAULT 1
);
INSERT INTO "new_Shop" ("branding", "copy", "createdAt", "id", "minOrderValue", "onboarded", "updatedAt", "wholesaleBaselinePct", "wholesaleTag") SELECT "branding", "copy", "createdAt", "id", "minOrderValue", "onboarded", "updatedAt", "wholesaleBaselinePct", "wholesaleTag" FROM "Shop";
DROP TABLE "Shop";
ALTER TABLE "new_Shop" RENAME TO "Shop";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
