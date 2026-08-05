-- RedefineTables
-- R01: convert File.size and User.shareSizeLimit from String to BigInt (SQLite INTEGER).
-- Values that are not valid byte sizes are backfilled to 0 (they were garbage
-- strings; a quota of 0 means "no space" in the backend code).

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_File" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "shareId" TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "File_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_File" ("id", "createdAt", "name", "size", "shareId", "description")
SELECT "id", "createdAt", "name",
       CASE WHEN TRIM("size") GLOB '[0-9]*' THEN CAST("size" AS INTEGER) ELSE 0 END,
       "shareId", "description"
FROM "File";
DROP TABLE "File";
ALTER TABLE "new_File" RENAME TO "File";

CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT NOT NULL DEFAULT 'operador',
    "shareSizeLimit" BIGINT,
    "passwordMustChange" BOOLEAN NOT NULL DEFAULT false,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpVerified" BOOLEAN NOT NULL DEFAULT false,
    "totpSecret" TEXT,
    "isActivated" BOOLEAN NOT NULL DEFAULT true,
    "activationToken" TEXT,
    "activationTokenExpiresAt" DATETIME
);
INSERT INTO "new_User" ("id", "createdAt", "updatedAt", "username", "email", "password", "isAdmin", "role", "shareSizeLimit", "passwordMustChange", "totpEnabled", "totpVerified", "totpSecret", "isActivated", "activationToken", "activationTokenExpiresAt")
SELECT "id", "createdAt", "updatedAt", "username", "email", "password", "isAdmin", "role",
       CASE WHEN TRIM("shareSizeLimit") GLOB '[0-9]*' THEN CAST("shareSizeLimit" AS INTEGER) ELSE NULL END,
       "passwordMustChange", "totpEnabled", "totpVerified", "totpSecret", "isActivated", "activationToken", "activationTokenExpiresAt"
FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_activationToken_key" ON "User"("activationToken");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
