-- Drop OAuth and LDAP support (internal-only deployment)

-- Drop OAuthUser table
DROP TABLE IF EXISTS "OAuthUser";

-- Drop oauthIDToken column from RefreshToken
-- SQLite does not support DROP COLUMN IF EXISTS; guard with a pragma-driven check is unnecessary
-- because the column is guaranteed to exist (added by migration 20241007181823_oauth_id_token).
ALTER TABLE "RefreshToken" DROP COLUMN "oauthIDToken";

-- Drop ldapDN column and its unique index from User
DROP INDEX IF EXISTS "User_ldapDN_key";
ALTER TABLE "User" DROP COLUMN "ldapDN";
