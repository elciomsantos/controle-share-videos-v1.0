#!/usr/bin/env bash
# restore.sh - Restore SQLite database and/or files from backup
# Usage: ./restore.sh [sqlite|files|all] [backup_timestamp]
# Example: ./restore.sh sqlite 20260821_020000
#          ./restore.sh files 20260821_040000
#          ./restore.sh all latest

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================
DB_PATH="${DB_PATH:-/opt/app/backend/data/controle-videos.db}"
UPLOADS_DIR="${UPLOADS_DIR:-/opt/app/backend/data/uploads}"
FRONTEND_IMG_DIR="${FRONTEND_IMG_DIR:-/opt/app/frontend/public/img}"
S3_BUCKET="${S3_BUCKET:-s3://controle-share-videos-backups}"
KMS_KEY_ID="${KMS_KEY_ID:-arn:aws:kms:us-east-1:123456789012:key/abcd-efgh-1234}"
RESTORE_DIR="${RESTORE_DIR:-/tmp/restore}"
LOG_FILE="${LOG_FILE:-/var/log/restore.log}"
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
error() { log "${RED}[ERROR]${NC} $*"; }
success() { log "${GREEN}[SUCCESS]${NC} $*"; }
warn() { log "${YELLOW}[WARN]${NC} $*"; }

check_deps() {
    for cmd in aws openssl sqlite3 tar; do
        command -v "$cmd" &>/dev/null || { error "Missing: $cmd"; exit 1; }
    done
}

list_available_backups() {
    local type="$1"  # sqlite or files
    local prefix=""
    [[ "$type" == "sqlite" ]] && prefix="sqlite/" || prefix="files/"
    
    aws s3 ls "${S3_BUCKET}/${prefix}" --recursive | \
        grep "\.enc$" | \
        awk '{print $4}' | \
        sed 's/\.enc$//' | \
        sort -r
}

get_latest_backup() {
    local type="$1"
    list_available_backups "$type" | head -1
}

download_and_decrypt() {
    local s3_key="$1"
    local local_enc="${RESTORE_DIR}/$(basename "$s3_key")"
    local local_dek="${local_enc}.dek"
    local output="${local_enc%.enc}"
    
    mkdir -p "$RESTORE_DIR"
    
    log "Downloading: $s3_key"
    aws s3 cp "${S3_BUCKET}/${s3_key}" "$local_enc"
    aws s3 cp "${S3_BUCKET}/${s3_key}.dek" "$local_dek"
    
    log "Decrypting..."
    local dek=$(aws kms decrypt --ciphertext-blob fileb://"$local_dek" --output text --query Plaintext 2>/dev/null | base64 -d)
    openssl enc -d -aes-256-gcm -in "$local_enc" -out "$output" -pass pass:"$dek"
    
    success "Decrypted to: $output"
    echo "$output"
}

restore_sqlite() {
    local backup_name="$1"
    
    log "=== Restoring SQLite database ==="
    
    # Stop application (if running)
    warn "Ensure application is STOPPED before restoring database!"
    read -p "Press Enter when app is stopped..."
    
    local decrypted_db
    decrypted_db=$(download_and_decrypt "sqlite/${backup_name}.enc")
    
    # Backup current DB first
    cp "$DB_PATH" "${DB_PATH}.pre-restore-$(date '+%Y%m%d_%H%M%S')"
    
    # Restore
    cp "$decrypted_db" "$DB_PATH"
    
    # Verify integrity
    if sqlite3 "$DB_PATH" "PRAGMA integrity_check;" | grep -q "ok"; then
        success "Database restored and verified"
    else
        error "Database integrity check FAILED!"
        exit 1
    fi
}

restore_files() {
    local backup_name="$1"
    
    log "=== Restoring files ==="
    
    local decrypted_tarball
    decrypted_tarball=$(download_and_decrypt "files/${backup_name}.enc")
    
    # Extract
    log "Extracting tarball..."
    tar -xzf "$decrypted_tarball" -C /
    
    success "Files restored"
}

main() {
    local component="${1:-all}"
    local backup_timestamp="${2:-latest}"
    
    log "=== Starting restore (component: $component, timestamp: $backup_timestamp) ==="
    
    check_deps
    
    # Determine backup name
    local sqlite_backup files_backup
    if [[ "$backup_timestamp" == "latest" ]]; then
        sqlite_backup=$(get_latest_backup "sqlite")
        files_backup=$(get_latest_backup "files")
    else
        sqlite_backup="controle-videos_full_${backup_timestamp}.db"
        files_backup="uploads_full_${backup_name}.tar.gz"
    fi
    
    log "Selected SQLite backup: $sqlite_backup"
    log "Selected files backup: $files_backup"
    
    case "$component" in
        sqlite)
            restore_sqlite "$sqlite_backup"
            ;;
        files)
            restore_files "$files_backup"
            ;;
        all)
            restore_sqlite "$sqlite_backup"
            restore_files "$files_backup"
            ;;
        *)
            error "Usage: $0 [sqlite|files|all] [timestamp|latest]"
            exit 1
            ;;
    esac
    
    success "=== Restore completed ==="
    log "Verify application functionality before considering restore complete"
}

main "$@"