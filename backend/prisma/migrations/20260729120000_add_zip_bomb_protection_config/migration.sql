-- GAP-04: configurable zip-bomb protection limits (file count, total size, max ratio).
-- Idempotent: only insert when the (name, category) key does not yet exist.

INSERT INTO "Config" (
  "updatedAt",
  "name",
  "category",
  "type",
  "defaultValue",
  "value",
  "obscured",
  "secret",
  "locked",
  "order"
)
SELECT
  CURRENT_TIMESTAMP,
  'zipMaxFiles',
  'share',
  'number',
  '10000',
  NULL,
  0,
  0,
  0,
  100
WHERE NOT EXISTS (SELECT 1 FROM "Config" WHERE "name" = 'zipMaxFiles' AND "category" = 'share');

INSERT INTO "Config" (
  "updatedAt",
  "name",
  "category",
  "type",
  "defaultValue",
  "value",
  "obscured",
  "secret",
  "locked",
  "order"
)
SELECT
  CURRENT_TIMESTAMP,
  'zipMaxTotalSize',
  'share',
  'filesize',
  '10000000000',
  NULL,
  0,
  0,
  0,
  101
WHERE NOT EXISTS (SELECT 1 FROM "Config" WHERE "name" = 'zipMaxTotalSize' AND "category" = 'share');

INSERT INTO "Config" (
  "updatedAt",
  "name",
  "category",
  "type",
  "defaultValue",
  "value",
  "obscured",
  "secret",
  "locked",
  "order"
)
SELECT
  CURRENT_TIMESTAMP,
  'zipMaxRatio',
  'share',
  'number',
  '103',
  NULL,
  0,
  0,
  0,
  102
WHERE NOT EXISTS (SELECT 1 FROM "Config" WHERE "name" = 'zipMaxRatio' AND "category" = 'share');
