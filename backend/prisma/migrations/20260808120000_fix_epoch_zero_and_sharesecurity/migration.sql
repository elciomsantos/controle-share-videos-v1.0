-- Fix BDB-05: EPOCH_ZERO sentinel + ShareSecurity 1:1 opcional
-- 1. Change expiration to expiresAt (nullable, null = never expires)
-- 2. Make ShareSecurity required (1:1)

-- Step 0: Drop composite index first
DROP INDEX IF EXISTS "Share_creatorId_uploadLocked_expiration_idx";

-- Step 1: Drop index on expiration first
DROP INDEX IF EXISTS "Share_expiration_idx";

-- Step 2: Add new expiresAt column (nullable)
ALTER TABLE "Share" ADD COLUMN "expiresAt" DATETIME;

-- Step 3: Backfill expiresAt from expiration (EPOCH_ZERO -> NULL)
UPDATE "Share" SET "expiresAt" = CASE 
  WHEN "expiration" = '1970-01-01 00:00:00' THEN NULL
  ELSE "expiration"
END;

-- Step 3: Drop old expiration column
ALTER TABLE "Share" DROP COLUMN "expiration";

-- Step 4: Rename expiresAt to expiration
ALTER TABLE "Share" RENAME COLUMN "expiresAt" TO "expiration";

-- Step 5: Recreate index on new nullable expiration column
CREATE INDEX IF NOT EXISTS "Share_expiration_idx" ON "Share"("expiration");

-- Step 6: Recreate composite index
CREATE INDEX IF NOT EXISTS "Share_creatorId_uploadLocked_expiration_idx" ON "Share"("creatorId", "uploadLocked", "expiration");

-- Step 7: Make ShareSecurity required (1:1)
-- First, ensure all shares have a security record
-- Using hex(randomblob(16)) to generate UUID in SQLite
INSERT INTO "ShareSecurity" ("id", "shareId", "createdAt")
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), "id", datetime('now')
FROM "Share"
WHERE NOT EXISTS (SELECT 1 FROM "ShareSecurity" WHERE "ShareSecurity"."shareId" = "Share"."id");

-- Step 7: Make shareId required in ShareSecurity
-- For SQLite, we rely on unique index and application-level validation
CREATE UNIQUE INDEX IF NOT EXISTS "ShareSecurity_shareId_key" ON "ShareSecurity"("shareId");
