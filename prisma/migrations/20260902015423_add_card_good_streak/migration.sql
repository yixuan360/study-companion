-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "materialId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "hint" TEXT,
    "cardType" TEXT NOT NULL,
    "mastery" TEXT NOT NULL DEFAULT 'new',
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "nextReviewAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "lapseCount" INTEGER NOT NULL DEFAULT 0,
    "goodStreak" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Card_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Card" ("answer", "cardType", "createdAt", "hint", "id", "intervalDays", "lapseCount", "mastery", "materialId", "metadata", "nextReviewAt", "question", "reviewCount") SELECT "answer", "cardType", "createdAt", "hint", "id", "intervalDays", "lapseCount", "mastery", "materialId", "metadata", "nextReviewAt", "question", "reviewCount" FROM "Card";
DROP TABLE "Card";
ALTER TABLE "new_Card" RENAME TO "Card";
CREATE INDEX "Card_materialId_idx" ON "Card"("materialId");
CREATE INDEX "Card_nextReviewAt_idx" ON "Card"("nextReviewAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
