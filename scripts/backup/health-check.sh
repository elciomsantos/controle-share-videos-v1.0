#!/usr/bin/env bash
# backup-health-check.sh - Verifica saúde dos backups
# Usage: ./health-check.sh
# Cron: 0 6 * * * /path/to/backup-health-check.sh

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================
S3_BUCKET="${S3_BUCKET:-s3://controle-share-videos-backups}"
SQLITE_PREFIX="${SQLITE_PREFIX:-sqlite/}"
FILES_PREFIX="${FILES_PREFIX:-files/}"
MAX_AGE_HOURS_SQLITE="${MAX_AGE_HOURS_SQLITE:-36}"      # Alerta se > 36h sem backup
MAX_AGE_HOURS_FILES="${MAX_AGE_HOURS_FILES:-48}"         # Alerta se > 48h sem backup
MIN_BACKUP_SIZE_BYTES="${MIN_BACKUP_SIZE_BYTES:-1024}"   # 1KB mínimo
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"                       # Opcional: webhook para alertas
LOG_FILE="${LOG_FILE:-/var/log/backup-health.log}"
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
error() { log "${RED}[ERROR]${NC} $*"; }
success() { log "${GREEN}[OK]${NC} $*"; }
warn() { log "${YELLOW}[WARN]${NC} $*"; }

send_slack() {
    [[ -z "$SLACK_WEBHOOK" ]] && return 0
    local text="$1"
    local color="${2:-#ff0000}"
    curl -s -X POST -H 'Content-type: application/json' \
        --data "{\"attachments\":[{\"color\":\"$color\",\"text\":\"$text\"}]}" \
        "$SLACK_WEBHOOK" >/dev/null || true
}

check_sqlite_backups() {
    log "Verificando backups SQLite..."
    
    local latest
    latest=$(aws s3 ls "${S3_BUCKET}/${SQLITE_PREFIX}" --recursive | \
        grep "\.enc$" | sort -k1,2 | tail -1 | awk '{print $4}')
    
    if [[ -z "$latest" ]]; then
        error "NENHUM backup SQLite encontrado no bucket!"
        send_slack "🚨 *BACKUP SQLITE AUSENTE* - Nenhum backup encontrado em ${S3_BUCKET}/${SQLITE_PREFIX}"
        return 1
    fi
    
    # Extrair timestamp do nome: controle-videos_full_20260821_020000.db.enc
    local timestamp_str
    timestamp_str=$(echo "$latest" | sed -E 's/.*_([0-9]{8}_[0-9]{6})\.db\.enc/\1/')
    
    if [[ ! "$timestamp_str" =~ ^[0-9]{8}_[0-9]{6}$ ]]; then
        warn "Formato de timestamp inesperado: $latest"
        timestamp_str=$(date -d "$(aws s3api head-object --bucket "${S3_BUCKET#s3://}" --key "${SQLITE_PREFIX}${latest}" --query 'LastModified' --output text 2>/dev/null || date)" '+%Y%m%d_%H%M%S' 2>/dev/null || echo "")
    fi
    
    if [[ -n "$timestamp_str" ]]; then
        local backup_epoch
        backup_epoch=$(date -d "${timestamp_str:0:4}-${timestamp_str:4:2}-${timestamp_str:6:2} ${timestamp_str:9:2}:${timestamp_str:11:2}:${timestamp_str:13:2}" +%s 2>/dev/null || echo "0")
        local now_epoch
        now_epoch=$(date +%s)
        local age_hours=$(( (now_epoch - backup_epoch) / 3600 ))
        
        if [[ $age_hours -gt $MAX_AGE_HOURS_SQLITE ]]; then
            error "Backup SQLite ANTIGO: $age_hours horas (limite: ${MAX_AGE_HOURS_SQLITE}h) - Arquivo: $latest"
            send_slack "⚠️ *BACKUP SQLITE ANTIGO* - Último backup há ${age_hours}h (limite: ${MAX_AGE_HOURS_SQLITE}h)"
            return 1
        else
            success "Backup SQLite OK: $age_hours horas atrás - $latest"
        fi
    else
        warn "Não foi possível determinar idade do backup: $latest"
    fi
    
    # Verificar tamanho
    local size
    size=$(aws s3api head-object --bucket "${S3_BUCKET#s3://}" --key "${SQLITE_PREFIX}${latest}" --query 'ContentLength' --output text 2>/dev/null || echo "0")
    if [[ $size -lt $MIN_BACKUP_SIZE_BYTES ]]; then
        error "Backup SQLite MUITO PEQUENO: ${size} bytes (mín: ${MIN_BACKUP_SIZE_BYTES})"
        send_slack "🚨 *BACKUP SQLITE PEQUENO* - Tamanho: ${size} bytes"
        return 1
    fi
    
    # Testar descriptografia (sample)
    log "Testando descriptografia do backup SQLite..."
    local test_file="/tmp/sqlite_health_test_$(date +%s).enc"
    local test_dek="/tmp/sqlite_health_test_$(date +%s).dek"
    aws s3 cp "${S3_BUCKET}/${SQLITE_PREFIX}${latest}" "$test_file" >/dev/null 2>&1
    aws s3 cp "${S3_BUCKET}/${SQLITE_PREFIX}${latest}.dek" "$test_dek" >/dev/null 2>&1
    
    if [[ -f "$test_file" && -f "$test_dek" ]]; then
        local dek
        dek=$(aws kms decrypt --ciphertext-blob fileb://"$test_dek" --output text --query Plaintext 2>/dev/null | base64 -d)
        if openssl enc -d -aes-256-gcm -in "$test_file" -pass pass:"$dek" | head -c 1024 >/dev/null 2>&1; then
            success "Descriptografia SQLite OK"
        else
            error "FALHA NA DESCRIPTOGRAFIA do backup SQLite!"
            send_slack "🚨 *FALHA DESCRIPTOGRAFIA SQLITE* - Backup corrompido ou chave errada"
            rm -f "$test_file" "$test_dek"
            return 1
        fi
        rm -f "$test_file" "$test_dek"
    else
        warn "Não foi possível baixar arquivos para teste de descriptografia"
    fi
    
    return 0
}

check_files_backups() {
    log "Verificando backups de arquivos..."
    
    local count
    count=$(aws s3 ls "${S3_BUCKET}/${FILES_PREFIX}" --recursive | grep -c "\.enc$" || echo "0")
    
    if [[ $count -eq 0 ]]; then
        error "NENHUM backup de arquivos encontrado!"
        send_slack "🚨 *BACKUP ARQUIVOS AUSENTE* - Nenhum backup em ${S3_BUCKET}/${FILES_PREFIX}"
        return 1
    fi
    
    # Verificar o mais recente de cada tipo (uploads, frontend-img)
    local all_ok=true
    for prefix in "uploads_" "frontend-img_"; do
        local latest
        latest=$(aws s3 ls "${S3_BUCKET}/${FILES_PREFIX}" --recursive | \
            grep "${prefix}.*\.enc$" | sort -k1,2 | tail -1 | awk '{print $4}')
        
        if [[ -z "$latest" ]]; then
            warn "Nenhum backup encontrado para prefixo: $prefix"
            continue
        fi
        
        local timestamp_str
        timestamp_str=$(echo "$latest" | sed -E 's/.*_([0-9]{8}_[0-9]{6})\.tar\.gz\.enc/\1/')
        
        if [[ "$timestamp_str" =~ ^[0-9]{8}_[0-9]{6}$ ]]; then
            local backup_epoch
            backup_epoch=$(date -d "${timestamp_str:0:4}-${timestamp_str:4:2}-${timestamp_str:6:2} ${timestamp_str:9:2}:${timestamp_str:11:2}:${timestamp_str:13:2}" +%s 2>/dev/null || echo "0")
            local now_epoch
            now_epoch=$(date +%s)
            local age_hours=$(( (now_epoch - backup_epoch) / 3600 ))
            
            if [[ $age_hours -gt $MAX_AGE_HOURS_FILES ]]; then
                error "Backup $prefix ANTIGO: $age_hours horas - $latest"
                send_slack "⚠️ *BACKUP ARQUIVOS ANTIGO* ($prefix) - ${age_hours}h atrás"
                all_ok=false
            else
                success "Backup $prefix OK: $age_hours horas - $latest"
            fi
        fi
    done
    
    [[ "$all_ok" == "true" ]] && return 0 || return 1
}

check_kms_access() {
    log "Verificando acesso KMS..."
    local key_id="${KMS_KEY_ID:-}"
    if [[ -z "$key_id" ]]; then
        warn "KMS_KEY_ID não configurado, pulando verificação"
        return 0
    fi
    
    if aws kms describe-key --key-id "$key_id" >/dev/null 2>&1; then
        success "Acesso KMS OK: $key_id"
        return 0
    else
        error "FALHA AO ACESSAR KMS: $key_id"
        send_slack "🚨 *KMS INACESSÍVEL* - Não foi possível acessar chave $key_id"
        return 1
    fi
}

check_disk_space() {
    log "Verificando espaço em disco local..."
    local usage
    usage=$(df /opt/app/backend/data --output=pcent | tail -1 | tr -dc '0-9')
    if [[ $usage -gt 85 ]]; then
        warn "Espaço em disco alto: ${usage}%"
        send_slack "⚠️ *DISCO CHEIO* - Uso: ${usage}% em /opt/app/backend/data"
    else
        success "Espaço em disco OK: ${usage}%"
    fi
}

main() {
    log "=== Iniciando Health Check de Backups ==="
    
    local overall_ok=true
    
    check_kms_access || overall_ok=false
    check_sqlite_backups || overall_ok=false
    check_files_backups || overall_ok=false
    check_disk_space || overall_ok=false
    
    if [[ "$overall_ok" == "true" ]]; then
        success "=== TODOS OS CHECKS PASSARAM ==="
        send_slack "✅ *BACKUP HEALTH CHECK OK* - Todos os backups íntegros e recentes" "#36a64f"
        exit 0
    else
        error "=== ALGUNS CHECKS FALHARAM ==="
        exit 1
    fi
}

main "$@"