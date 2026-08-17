-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN "reauthenticatedAt" DATETIME;

-- CreateTable
CREATE TABLE "RecoveryCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codeHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" DATETIME,
    "userId" TEXT NOT NULL,
    CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryCode_codeHash_key" ON "RecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "RecoveryCode_userId_idx" ON "RecoveryCode"("userId");
