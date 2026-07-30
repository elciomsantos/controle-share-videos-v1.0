#!/bin/bash
# =============================================================================
# Backup script for Controle Share Videos SQLite database
# INFRA-MED-02: backup + assinatura/criptografia
# =============================================================================
set -euo pipefail

# --- Configuration ----------------------------------------------------------
BACKUP_DIR="${BACKUP_DIR:-/opt/app/backups}"
DB_FILE="${DB_FILE:-/opt/app/backend/data/controle-videos.db}"
DATA_DIR="${DATA_DIR:-/opt/app/backend/data}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
GPG_RECIPIENT="${GPG_RECIPIENT:-}"  # email for GPG encryption (required in production)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="controle-videos_${TIMESTAMP}"

# --- Ensure backup directory exists -----------------------------------------
mkdir -p "${BACKUP_DIR}"

# --- Fail-closed: require GPG_RECIPIENT in production -----------------------
# Verificação pós-auditoria (item 2): backups apenas assinados (sem
# criptografia) expõem confidencialidade dos dados em disco. Em produção
# abandonamos o job em vez de produzir backup legível.
if [ "${NODE_ENV:-production}" = "production" ] && [ -z "${GPG_RECIPIENT}" ]; then
  echo "[error] GPG_RECIPIENT is required in production (NODE_ENV=production)." >&2
  echo "        Set GPG_RECIPIENT=<key-id-or-email> to enable GPG encryption." >&2
  echo "        Refusing to produce an unencrypted backup (fail-closed)." >&2
  exit 1
fi

# --- 1. Create SQLite backup ------------------------------------------------
echo "[1/4] Creating SQLite backup..."
sqlite3 "${DB_FILE}" ".backup '${BACKUP_DIR}/${BACKUP_NAME}.db'"
echo "  -> ${BACKUP_DIR}/${BACKUP_NAME}.db"

# --- 2. Compress ------------------------------------------------------------
echo "[2/4] Compressing..."
gzip -9 "${BACKUP_DIR}/${BACKUP_NAME}.db"
echo "  -> ${BACKUP_DIR}/${BACKUP_NAME}.db.gz"

# --- 3. Encrypt & sign with GPG ---------------------------------------------
# Em produção o fail-closed acima já garantiu GPG_RECIPIENT non-empty.
# Em dev/test (NODE_ENV != production) ainda permitimos só-assinatura.
if [ -n "${GPG_RECIPIENT}" ]; then
  echo "[3/4] Encrypting with GPG (recipient: ${GPG_RECIPIENT})..."
  gpg --batch --yes --encrypt --sign \
    --recipient "${GPG_RECIPIENT}" \
    --output "${BACKUP_DIR}/${BACKUP_NAME}.db.gz.gpg" \
    "${BACKUP_DIR}/${BACKUP_NAME}.db.gz"
  rm -f "${BACKUP_DIR}/${BACKUP_NAME}.db.gz"
  echo "  -> ${BACKUP_DIR}/${BACKUP_NAME}.db.gz.gpg (encrypted + signed)"
else
  echo "[3/4] Skipping encryption (dev mode, GPG_RECIPIENT not set). Signing with default key..."
  # Sign without encryption to ensure integrity (dev only)
  gpg --batch --yes --detach-sign \
    --output "${BACKUP_DIR}/${BACKUP_NAME}.db.gz.sig" \
    "${BACKUP_DIR}/${BACKUP_NAME}.db.gz"
  echo "  -> ${BACKUP_DIR}/${BACKUP_NAME}.db.gz.sig (signature)"
fi

# --- 4. Rotate old backups --------------------------------------------------
echo "[4/4] Removing backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "controle-videos_*" -type f -mtime "+${RETENTION_DAYS}" -delete

echo ""
echo "=== Backup complete ==="
echo "Backup location: ${BACKUP_DIR}"
echo "Backup name:     ${BACKUP_NAME}"

# --- Optional: rsync to off-site (uncomment & configure) --------------------
# echo "Syncing to off-site storage..."
# rsync -avz --delete "${BACKUP_DIR}/" user@remote-host:/path/to/backups/

# --- Restore instructions (manual) ------------------------------------------
# cat << 'RESTORE'
# Decrypt (if encrypted):
#   gpg --decrypt backup.db.gz.gpg > backup.db.gz
# Verify signature (if signed only):
#   gpg --verify backup.db.gz.sig backup.db.gz
# Decompress:
#   gunzip backup.db.gz
# Restore:
#   sqlite3 /opt/app/backend/data/controle-videos.db ".restore 'backup.db'"
# RESTORE
