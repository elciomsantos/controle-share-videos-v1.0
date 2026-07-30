-- GAP-02: DownloadLog.requestId correlation id so audit rows can be joined
-- back to application logs that include X-Request-Id / RequestContextLogger.

ALTER TABLE "DownloadLog" ADD COLUMN "requestId" TEXT;

CREATE INDEX "DownloadLog_requestId_idx" ON "DownloadLog" ("requestId");
