-- AlterTable
ALTER TABLE "Share" ADD COLUMN "downloads" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ShareSecurity" ADD COLUMN "maxDownloads" INTEGER;
