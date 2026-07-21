-- CreateTable
CREATE TABLE "DownloadLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shareId" TEXT NOT NULL,
    "fileId" TEXT,
    "fileName" TEXT NOT NULL,
    "userId" TEXT,
    "username" TEXT,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT
);

-- CreateIndex
CREATE INDEX "DownloadLog_shareId_idx" ON "DownloadLog"("shareId");

-- CreateIndex
CREATE INDEX "DownloadLog_userId_idx" ON "DownloadLog"("userId");

-- CreateIndex
CREATE INDEX "DownloadLog_createdAt_idx" ON "DownloadLog"("createdAt");
