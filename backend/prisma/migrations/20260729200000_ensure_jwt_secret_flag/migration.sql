-- Verificação pós-auditoria (item 1): garantir que jwtSecret fique marcado
-- como secret=1 em deploys que pulam o `prisma db seed` (ex.: upgrade de base
-- legada PingvinShare onde a migracao 20260721084252 pode ter copiado secret=0).
-- Idempotente.

UPDATE "Config"
SET "secret" = 1
WHERE "name" = 'jwtSecret' AND "category" = 'internal';
