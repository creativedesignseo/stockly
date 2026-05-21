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
    "wholesaleBaselinePct" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Shop" ("branding", "copy", "createdAt", "id", "minOrderValue", "onboarded", "updatedAt", "wholesaleTag") SELECT "branding", "copy", "createdAt", "id", "minOrderValue", "onboarded", "updatedAt", "wholesaleTag" FROM "Shop";
DROP TABLE "Shop";
ALTER TABLE "new_Shop" RENAME TO "Shop";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
