/*
  Warnings:

  - Made the column `shareId` on table `ShareSecurity` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "DownloadLog" ADD COLUMN "authMethod" TEXT;
ALTER TABLE "DownloadLog" ADD COLUMN "creatorUsername" TEXT;
ALTER TABLE "DownloadLog" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "DownloadLog" ADD COLUMN "fileHash" TEXT;
ALTER TABLE "DownloadLog" ADD COLUMN "httpStatus" INTEGER;
ALTER TABLE "DownloadLog" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "DownloadLog" ADD COLUMN "recipientEmail" TEXT;
ALTER TABLE "DownloadLog" ADD COLUMN "recipientId" TEXT;
ALTER TABLE "DownloadLog" ADD COLUMN "referer" TEXT;
ALTER TABLE "DownloadLog" ADD COLUMN "shareName" TEXT;
ALTER TABLE "DownloadLog" ADD COLUMN "transferBytes" TEXT;

-- AlterTable
ALTER TABLE "File" ADD COLUMN "sha256" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShareSecurity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "password" TEXT,
    "maxViews" INTEGER,
    "maxDownloads" INTEGER,
    "shareId" TEXT NOT NULL,
    CONSTRAINT "ShareSecurity_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ShareSecurity" ("createdAt", "id", "maxDownloads", "maxViews", "password", "shareId") SELECT "createdAt", "id", "maxDownloads", "maxViews", "password", "shareId" FROM "ShareSecurity";
DROP TABLE "ShareSecurity";
ALTER TABLE "new_ShareSecurity" RENAME TO "ShareSecurity";
CREATE UNIQUE INDEX "ShareSecurity_shareId_key" ON "ShareSecurity"("shareId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
