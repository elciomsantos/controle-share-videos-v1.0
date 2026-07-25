-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DownloadLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shareId" TEXT NOT NULL,
    "fileId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSize" TEXT,
    "userId" TEXT,
    "username" TEXT,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "event" TEXT NOT NULL DEFAULT 'download'
);
INSERT INTO "new_DownloadLog" ("createdAt", "event", "fileId", "fileName", "fileSize", "id", "ip", "reason", "shareId", "success", "userAgent", "userId", "username") SELECT "createdAt", 'download', "fileId", "fileName", NULL, "id", "ip", "reason", "shareId", "success", NULL, "userId", "username" FROM "DownloadLog";
DROP TABLE "DownloadLog";
ALTER TABLE "new_DownloadLog" RENAME TO "DownloadLog";
CREATE INDEX "DownloadLog_shareId_idx" ON "DownloadLog"("shareId");
CREATE INDEX "DownloadLog_userId_idx" ON "DownloadLog"("userId");
CREATE INDEX "DownloadLog_createdAt_idx" ON "DownloadLog"("createdAt");
CREATE INDEX "DownloadLog_event_idx" ON "DownloadLog"("event");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
