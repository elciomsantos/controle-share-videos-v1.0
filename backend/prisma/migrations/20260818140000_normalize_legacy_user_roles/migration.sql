-- Normaliza papéis legados de usuários criados em versões antigas.
-- Os papéis aceitos atualmente são: admin, operador, auditor.
UPDATE "User"
SET "role" = 'operador'
WHERE "role" NOT IN ('admin', 'operador', 'auditor');