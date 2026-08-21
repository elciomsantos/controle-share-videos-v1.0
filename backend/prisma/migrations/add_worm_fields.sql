-- Migration: Add WORM fields to audit_log table
-- Run: npx prisma migrate dev --name add_worm_fields

-- Add WORM fields to existing audit_log table
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "sequenceNumber" INTEGER;
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "previousHash" TEXT;
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "currentHash" TEXT;

-- Create index for sequence-based ordering
CREATE INDEX IF NOT EXISTS "audit_log_sequenceNumber_idx" ON "audit_log"("sequenceNumber");
CREATE INDEX IF NOT EXISTS "audit_log_hash_chain_idx" ON "audit_log"("previousHash", "currentHash");

-- SQLite: use trigger for auto-increment sequenceNumber
CREATE TRIGGER IF NOT EXISTS "audit_log_sequence_trigger"
AFTER INSERT ON "audit_log"
FOR EACH ROW
WHEN NEW."sequenceNumber" IS NULL
BEGIN
  UPDATE "audit_log" 
  SET "sequenceNumber" = (
    SELECT COALESCE(MAX("sequenceNumber"), 0) + 1 
    FROM "audit_log"
  )
  WHERE "id" = NEW."id";
END;

-- Backfill existing records with sequence numbers
-- Run this once after migration:
/*
WITH numbered AS (
  SELECT 
    "id",
    ROW_NUMBER() OVER (ORDER BY "createdAt", "id") as seq_num
  FROM "audit_log"
  WHERE "sequenceNumber" IS NULL
)
UPDATE "audit_log"
SET "sequenceNumber" = numbered.seq_num
FROM numbered
WHERE "audit_log"."id" = numbered."id";
*/

-- After backfill, run hash chain computation in application code
-- (see scripts/security/audit-worm.ts initializeChain method)