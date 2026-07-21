-- Drop OAuth and LDAP support (internal-only deployment)

-- Drop OAuthUser table
DROP TABLE IF EXISTS "OAuthUser";

-- Drop oauthIDToken column from RefreshToken
ALTER TABLE "RefreshToken" DROP COLUMN IF EXISTS "oauthIDToken";

-- Drop ldapDN column and its unique index from User
DROP INDEX IF EXISTS "User_ldapDN_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "ldapDN";
