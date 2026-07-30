-- GAP-01: per-file size limit (default 0 = disabled, uses share.maxSize).
-- Idempotent.

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
    'maxFileSize',
    'share',
    'filesize',
    '0',
    NULL,
    0,
    0,
    0,
    90
WHERE NOT EXISTS (
    SELECT 1 FROM "Config"
    WHERE "name" = 'maxFileSize' AND "category" = 'share'
);
