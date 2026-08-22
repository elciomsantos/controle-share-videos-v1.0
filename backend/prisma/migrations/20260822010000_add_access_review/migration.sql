-- Access review (issue #11, 2.4.2/2.4.3): periodic access review support.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastReviewedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "reviewedBy" TEXT;

-- CreateTable
CREATE TABLE "AccessReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "certified" BOOLEAN NOT NULL,
    "notes" TEXT,
    "signature" TEXT NOT NULL,
    CONSTRAINT "AccessReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AccessReview_userId_idx" ON "AccessReview"("userId");

-- CreateIndex
CREATE INDEX "AccessReview_reviewedAt_idx" ON "AccessReview"("reviewedAt");
