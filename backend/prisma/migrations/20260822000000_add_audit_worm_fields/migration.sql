-- WORM (issue #10, 2.3.2): hash chain fields for AuditLog tamper-evidence.
-- Existing rows keep NULL and stay outside the chain; new writes are chained.

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "sequenceNumber" INTEGER;
ALTER TABLE "AuditLog" ADD COLUMN "previousHash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "currentHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_sequenceNumber_key" ON "AuditLog"("sequenceNumber");

-- CreateIndex
CREATE INDEX "AuditLog_previousHash_currentHash_idx" ON "AuditLog"("previousHash", "currentHash");
