#!/usr/bin/env bash
# backup-files.sh - Backup upload volumes to S3/GCS with encryption
# Usage: ./backup-files.sh [full|incremental]
# Cron: 0 4 * * * /path/to/backup-files.sh incremental
#       0 5 * * 0 /path/to/backup-files.sh full

set -euo pipefail

# =============================================================================
# CONFIGURATION - ADJUST THESE VALUES
# =============================================================================
SOURCE_DIRS=(
    "/opt/app/backend/data/uploads"
    "/opt/app/frontend/public/img"
)
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/tmp/files-backups}"
S3_BUCKET="${S3_BUCKET:-s3://controle-share-videos-backups/files}"
KMS_KEY_ID="${KMS_KEY_ID:-arn:aws:kms:us-east-1:123456789012:key/abcd-efgh-1234}"
RETENTION_DAYS="${RETENTION_DAYS:-90}"
LOG_FILE="${LOG_FILE:-/var/log/files-backup.log}"
# Use rclone if available (supports more providers), fallback to rsync+aws
USE_RCLONE="${USE_RCLONE:-true}"
RCLONE_REMOTE="${RCLONE_REMOTE:-s3:controle-share-videos-backups/files}"
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() { log "${RED}[ERROR]${NC} $*"; }
success() { log "${GREEN}[SUCCESS]${NC} $*"; }
warn() { log "${YELLOW}[WARN]${NC} $*"; }

check_deps() {
    if [[ "$USE_RCLONE" == "true" ]]; then
        command -v rclone &>/dev/null || { error "rclone not found"; exit 1; }
    else
        command -v rsync &>/dev/null || { error "rsync not found"; exit 1; }
        command -v aws &>/dev/null || { error "aws cli not found"; exit 1; }
    fi
    command -v openssl &>/dev/null || { error "openssl not found"; exit 1; }
}

encrypt_file() {
    local input="$1"
    local output="${input}.enc"
    
    log "Encrypting: $input"
    
    local dek=$(openssl rand -base64 32)
    if openssl enc -aes-256-gcm -salt -in "$input" -out "$output" -pass pass:"$dek" 2>/dev/null; then
        local encrypted_dek=$(aws kms encrypt --key-id "$KMS_KEY_ID" --plaintext "$dek" --output text --query CiphertextBlob 2>/dev/null)
        echo "$encrypted_dek" > "${output}.dek"
        rm -f "$input"
        success "Encrypted: $output"
        echo "$output"
    else
        error "Encryption failed for $input"
        return 1
    fi
}

create_tarball() {
    local source="$1"
    local dest_dir="$2"
    local mode="$3"
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local basename=$(basename "$source")
    local tarball="${dest_dir}/${basename}_${mode}_${timestamp}.tar.gz"
    
    log "Creating tarball: $tarball"
    
    # For incremental, use --newer-mtime with a reference file
    local rsync_opts=(-avz --progress)
    if [[ "$mode" == "incremental" ]]; then
        local ref_file="${dest_dir}/.last_backup_${basename}"
        if [[ -f "$ref_file" ]]; then
            rsync_opts+=("--files-from=<(find '$source' -newer '$ref_file' -type f -printf '%P\n')")
        fi
        touch "$ref_file"
    fi
    
    # Create tarball directly
    tar -czf "$tarball" -C "$(dirname "$source")" "$(basename "$source")"
    
    success "Tarball created: $tarball"
    echo "$tarball"
}

upload_file() {
    local file="$1"
    local remote_path="$2"
    
    log "Uploading: $file -> $remote_path"
    
    if [[ "$USE_RCLONE" == "true" ]]; then
        rclone copy "$file" "$(dirname "$remote_path")" --progress
    else
        aws s3 cp "$file" "$remote_path" --storage-class STANDARD_IA
    fi
    
    success "Uploaded: $remote_path"
}

cleanup_local() {
    log "Cleaning local files older than $RETENTION_DAYS days"
    find "$BACKUP_BASE_DIR" -name "*.tar.gz.enc" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    find "$BACKUP_BASE_DIR" -name "*.dek" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    success "Local cleanup done"
}

main() {
    local mode="${1:-incremental}"
    log "=== Starting files backup (mode: $mode) ==="
    
    check_deps
    mkdir -p "$BACKUP_BASE_DIR"
    
    local all_success=true
    
    for source_dir in "${SOURCE_DIRS[@]}"; do
        if [[ ! -d "$source_dir" ]]; then
            warn "Source directory not found: $source_dir (skipping)"
            continue
        fi
        
        local tarball
        tarball=$(create_tarball "$source_dir" "$BACKUP_BASE_DIR" "$mode")
        
        local encrypted_file
        encrypted_file=$(encrypt_file "$tarball")
        
        if [[ -n "$encrypted_file" ]]; then
            local remote_path="${S3_BUCKET}/$(basename "$encrypted_file")"
            if upload_file "$encrypted_file" "$remote_path" && \
               upload_file "${encrypted_file}.dek" "${remote_path}.dek"; then
                success "Backup completed for $source_dir"
            else
                error "Upload failed for $source_dir"
                all_success=false
            fi
        else
            all_success=false
        fi
    done
    
    cleanup_local
    
    if [[ "$all_success" == "true" ]]; then
        success "=== All files backups completed ==="
        exit 0
    else
        error "=== Some backups failed ==="
        exit 1
    fi
}

main "$@"