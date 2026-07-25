/*
  Warnings:

  - You are about to drop the `ReverseShare` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `reverseShareId` on the `Share` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "ReverseShare_token_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ReverseShare";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Share" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    "name" TEXT,
    "uploadLocked" BOOLEAN NOT NULL DEFAULT false,
    "isZipReady" BOOLEAN NOT NULL DEFAULT false,
    "views" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "expiration" DATETIME NOT NULL,
    "description" TEXT,
    "removedReason" TEXT,
    "creatorId" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'LOCAL',
    CONSTRAINT "Share_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Share" ("createdAt", "creatorId", "description", "downloads", "expiration", "id", "isZipReady", "name", "removedReason", "storageProvider", "updatedAt", "uploadLocked", "views") SELECT "createdAt", "creatorId", "description", "downloads", "expiration", "id", "isZipReady", "name", "removedReason", "storageProvider", "updatedAt", "uploadLocked", "views" FROM "Share";
DROP TABLE "Share";
ALTER TABLE "new_Share" RENAME TO "Share";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
