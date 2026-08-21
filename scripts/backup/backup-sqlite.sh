#!/usr/bin/env bash
# backup-sqlite.sh - Backup SQLite database to S3/GCS with encryption
# Usage: ./backup-sqlite.sh [full|incremental]
# Cron: 0 2 * * * /path/to/backup-sqlite.sh incremental
#       0 3 * * 0 /path/to/backup-sqlite.sh full

set -euo pipefail

# =============================================================================
# CONFIGURATION - ADJUST THESE VALUES
# =============================================================================
DB_PATH="${DB_PATH:-/opt/app/backend/data/controle-videos.db}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/sqlite-backups}"
S3_BUCKET="${S3_BUCKET:-s3://controle-share-videos-backups/sqlite}"
KMS_KEY_ID="${KMS_KEY_ID:-arn:aws:kms:us-east-1:123456789012:key/abcd-efgh-1234}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
LOG_FILE="${LOG_FILE:-/var/log/sqlite-backup.log}"
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
    log "${RED}[ERROR]${NC} $*"
}

success() {
    log "${GREEN}[SUCCESS]${NC} $*"
}

warn() {
    log "${YELLOW}[WARN]${NC} $*"
}

# Check dependencies
check_deps() {
    for cmd in sqlite3 aws openssl; do
        if ! command -v "$cmd" &>/dev/null; then
            error "Required command not found: $cmd"
            exit 1
        fi
    done
}

# Create backup directory
setup_backup_dir() {
    mkdir -p "$BACKUP_DIR"
}

# Perform SQLite backup using .backup command (safe for running DB)
sqlite_backup() {
    local backup_file="$1"
    local mode="$2"  # full or incremental (SQLite doesn't have native incremental)
    
    log "Starting SQLite backup to $backup_file (mode: $mode)"
    
    # Use SQLite's online backup API - safe for concurrent access
    if sqlite3 "$DB_PATH" ".backup '$backup_file'"; then
        success "SQLite backup completed: $backup_file"
        return 0
    else
        error "SQLite backup failed"
        return 1
    fi
}

# Encrypt backup file using AES-256-GCM
encrypt_backup() {
    local input_file="$1"
    local output_file="${input_file}.enc"
    
    log "Encrypting backup with KMS key: $KMS_KEY_ID"
    
    # Generate a data encryption key (DEK)
    local dek=$(openssl rand -base64 32)
    
    # Encrypt the backup with DEK
    if openssl enc -aes-256-gcm -salt -in "$input_file" -out "$output_file" -pass pass:"$dek" 2>/dev/null; then
        # Encrypt the DEK with KMS (envelope encryption)
        local encrypted_dek=$(aws kms encrypt --key-id "$KMS_KEY_ID" --plaintext "$dek" --output text --query CiphertextBlob 2>/dev/null)
        
        # Store encrypted DEK alongside backup
        echo "$encrypted_dek" > "${output_file}.dek"
        
        # Remove unencrypted backup
        rm -f "$input_file"
        
        success "Backup encrypted: $output_file"
        echo "$output_file"
        return 0
    else
        error "Encryption failed"
        return 1
    fi
}

# Upload to S3
upload_to_s3() {
    local file="$1"
    local s3_path="$2"
    
    log "Uploading to $s3_path"
    
    if aws s3 cp "$file" "$s3_path" --storage-class STANDARD_IA; then
        success "Uploaded to S3: $s3_path"
        return 0
    else
        error "S3 upload failed"
        return 1
    fi
}

# Cleanup old backups (local and S3)
cleanup_old() {
    log "Cleaning up backups older than $RETENTION_DAYS days"
    
    # Local cleanup
    find "$BACKUP_DIR" -name "*.enc" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "*.dek" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    
    # S3 lifecycle handles remote cleanup, but we can also force it
    # aws s3 ls "$S3_BUCKET/" | while read -r line; do ... done
    
    success "Cleanup completed"
}

# Verify backup integrity
verify_backup() {
    local encrypted_file="$1"
    local dek_file="${encrypted_file}.dek"
    
    log "Verifying backup integrity..."
    
    if [[ ! -f "$encrypted_file" ]] || [[ ! -f "$dek_file" ]]; then
        error "Backup or DEK file missing"
        return 1
    fi
    
    # Decrypt DEK
    local dek=$(aws kms decrypt --ciphertext-blob fileb://"$dek_file" --output text --query Plaintext 2>/dev/null | base64 -d)
    
    # Test decrypt (first 1KB only for speed)
    if openssl enc -d -aes-256-gcm -in "$encrypted_file" -pass pass:"$dek" | head -c 1024 > /dev/null 2>&1; then
        success "Backup verification passed"
        return 0
    else
        error "Backup verification failed - corrupted or wrong key"
        return 1
    fi
}

# Main backup flow
main() {
    local mode="${1:-incremental}"
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local backup_name="controle-videos_${mode}_${timestamp}.db"
    local backup_path="${BACKUP_DIR}/${backup_name}"
    
    log "=== Starting SQLite backup (mode: $mode) ==="
    
    check_deps
    setup_backup_dir
    
    if sqlite_backup "$backup_path" "$mode"; then
        local encrypted_file
        encrypted_file=$(encrypt_backup "$backup_path")
        
        if [[ -n "$encrypted_file" ]]; then
            if upload_to_s3 "$encrypted_file" "${S3_BUCKET}/${backup_name}.enc" && \
               upload_to_s3 "${encrypted_file}.dek" "${S3_BUCKET}/${backup_name}.dek"; then
                
                verify_backup "$encrypted_file"
                cleanup_old
                
                success "=== Backup completed successfully ==="
                exit 0
            fi
        fi
    fi
    
    error "=== Backup failed ==="
    exit 1
}

# Run main
main "$@"