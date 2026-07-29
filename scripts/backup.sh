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
GPG_RECIPIENT="${GPG_RECIPIENT:-}"  # email for GPG encryption (optional)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="controle-videos_${TIMESTAMP}"

# --- Ensure backup directory exists -----------------------------------------
mkdir -p "${BACKUP_DIR}"

# --- 1. Create SQLite backup ------------------------------------------------
echo "[1/4] Creating SQLite backup..."
sqlite3 "${DB_FILE}" ".backup '${BACKUP_DIR}/${BACKUP_NAME}.db'"
echo "  -> ${BACKUP_DIR}/${BACKUP_NAME}.db"

# --- 2. Compress ------------------------------------------------------------
echo "[2/4] Compressing..."
gzip -9 "${BACKUP_DIR}/${BACKUP_NAME}.db"
echo "  -> ${BACKUP_DIR}/${BACKUP_NAME}.db.gz"

# --- 3. Encrypt & sign with GPG (if recipient configured) -------------------
if [ -n "${GPG_RECIPIENT}" ]; then
  echo "[3/4] Encrypting with GPG (recipient: ${GPG_RECIPIENT})..."
  gpg --batch --yes --encrypt --sign \
    --recipient "${GPG_RECIPIENT}" \
    --output "${BACKUP_DIR}/${BACKUP_NAME}.db.gz.gpg" \
    "${BACKUP_DIR}/${BACKUP_NAME}.db.gz"
  rm -f "${BACKUP_DIR}/${BACKUP_NAME}.db.gz"
  echo "  -> ${BACKUP_DIR}/${BACKUP_NAME}.db.gz.gpg (encrypted + signed)"
else
  echo "[3/4] Skipping encryption (GPG_RECIPIENT not set). Signing with default key..."
  # Sign without encryption to ensure integrity
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
