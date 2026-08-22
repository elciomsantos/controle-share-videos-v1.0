#!/usr/bin/env bash
# =============================================================================
# backup-bucket-protection.sh — Issue #32 [LOW] Backup Deletion Protection
# INFRA 4.5.1: Object Versioning + MFA Delete no bucket de backup
# INFRA 4.5.2: Lifecycle rule — transição para Glacier após 90 dias
#
# Com o MFA Delete ativo, credenciais comprometidas conseguem no máximo
# criar delete markers; a destruição permanente de qualquer versão exige
# o cabeçalho MFA (serial + token). Validar com
# scripts/backup/test-deletion-protection.sh (4.5.3).
#
# Uso:
#   AWS_PROFILE=prod \
#   BACKUP_BUCKET_NAME=controle-share-videos-backups \
#   MFA_SERIAL=arn:aws:iam::123456789012:mfa/root-account \
#   MFA_TOKEN=123456 \
#   ./scripts/provision/backup-bucket-protection.sh
#
# Idempotente: pode ser re-executado (verifica estado atual antes de aplicar).
# Fail-closed: sai com 1 se a configuração final não conferir.
# =============================================================================
set -euo pipefail

# --- Configuration -----------------------------------------------------------
BACKUP_BUCKET_NAME="${BACKUP_BUCKET_NAME:-controle-share-videos-backups}"
AWS_REGION="${AWS_REGION:-us-east-1}"
MFA_SERIAL="${MFA_SERIAL:-}"
MFA_TOKEN="${MFA_TOKEN:-}"
GLACIER_TRANSITION_DAYS="${GLACIER_TRANSITION_DAYS:-90}"          # 4.5.2
NONCURRENT_EXPIRATION_DAYS="${NONCURRENT_EXPIRATION_DAYS:-3650}"  # retenção ~10 anos
LIFECYCLE_RULE_ID="${LIFECYCLE_RULE_ID:-backup-to-glacier-90d}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()     { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
error()   { log "${RED}[ERROR]${NC} $*" >&2; }
success() { log "${GREEN}[SUCCESS]${NC} $*"; }
warn()    { log "${YELLOW}[WARN]${NC} $*"; }

check_deps() {
    command -v aws &>/dev/null || { error "aws cli not found"; exit 1; }
    command -v jq &>/dev/null || { error "jq not found"; exit 1; }
    if [[ -z "$MFA_SERIAL" || -z "$MFA_TOKEN" ]]; then
        error "MFA_SERIAL and MFA_TOKEN are required to enable MFA Delete."
        echo "  export MFA_SERIAL=arn:aws:iam::<account>:mfa/<user>" >&2
        echo "  export MFA_TOKEN=<6-digit-code>" >&2
        exit 1
    fi
}

bucket_exists() {
    aws s3api head-bucket --bucket "$BACKUP_BUCKET_NAME" &>/dev/null
}

# --- 4.5.1 Object Versioning + MFA Delete ------------------------------------
enable_versioning_mfa_delete() {
    log "[4.5.1] Enabling Versioning + MFA Delete on s3://${BACKUP_BUCKET_NAME}..."

    local current
    current=$(aws s3api get-bucket-versioning \
        --bucket "$BACKUP_BUCKET_NAME" \
        --query 'Status' --output text 2>/dev/null || echo "Absent")

    if [[ "$current" == "Enabled" ]]; then
        local mfa_current
        mfa_current=$(aws s3api get-bucket-versioning \
            --bucket "$BACKUP_BUCKET_NAME" \
            --query 'MFADelete' --output text 2>/dev/null || echo "Disabled")
        if [[ "$mfa_current" == "Enabled" ]]; then
            success "Versioning + MFA Delete already enabled"
            return 0
        fi
        warn "Versioning enabled but MFADelete=${mfa_current}; applying..."
    fi

    # put-bucket-versioning com MFADelete exige o cabeçalho x-amz-mfa
    # (formato "<serial> <token>") enviado pela conta root/proprietária.
    aws s3api put-bucket-versioning \
        --bucket "$BACKUP_BUCKET_NAME" \
        --versioning-configuration "Status=Enabled,MFADelete=Enabled" \
        --mfa "${MFA_SERIAL} ${MFA_TOKEN}"

    success "Versioning + MFA Delete applied"
}

verify_versioning() {
    local status mfa
    status=$(aws s3api get-bucket-versioning \
        --bucket "$BACKUP_BUCKET_NAME" \
        --query 'Status' --output text 2>/dev/null || echo "Absent")
    mfa=$(aws s3api get-bucket-versioning \
        --bucket "$BACKUP_BUCKET_NAME" \
        --query 'MFADelete' --output text 2>/dev/null || echo "Disabled")

    if [[ "$status" != "Enabled" || "$mfa" != "Enabled" ]]; then
        error "Verification failed: Status=${status}, MFADelete=${mfa}"
        return 1
    fi
    success "Verified: Status=${status}, MFADelete=${mfa}"
}

# --- 4.5.2 Lifecycle: transição para Glacier após 90d ------------------------
apply_glacier_lifecycle() {
    log "[4.5.2] Applying lifecycle rule '${LIFECYCLE_RULE_ID}' (Glacier after ${GLACIER_TRANSITION_DAYS}d)..."

    local tmp_rule tmp_merged
    tmp_rule=$(mktemp) && tmp_merged=$(mktemp)
    trap 'rm -f "$tmp_rule" "$tmp_merged"' RETURN

    cat > "${tmp_rule}" << EOF
{
    "Rules": [
        {
            "ID": "${LIFECYCLE_RULE_ID}",
            "Filter": { "Prefix": "" },
            "Status": "Enabled",
            "Transitions": [
                {
                    "Days": ${GLACIER_TRANSITION_DAYS},
                    "StorageClass": "GLACIER"
                }
            ],
            "NoncurrentVersionTransitions": [
                {
                    "NoncurrentDays": ${GLACIER_TRANSITION_DAYS},
                    "StorageClass": "GLACIER"
                }
            ],
            "NoncurrentVersionExpiration": {
                "NoncurrentDays": ${NONCURRENT_EXPIRATION_DAYS}
            },
            "AbortIncompleteMultipartUpload": {
                "DaysAfterInitiation": 7
            }
        }
    ]
}
EOF

    # Preserva regras pré-existentes, se houver (idempotência não-destrutiva)
    local existing_rules="[]"
    existing_rules=$(aws s3api get-bucket-lifecycle-configuration \
        --bucket "$BACKUP_BUCKET_NAME" \
        --query 'Rules' --output json 2>/dev/null || echo "[]")

    if [[ "$existing_rules" != "[]" ]]; then
        warn "Existing lifecycle rules found — merging (our rule wins by ID)"
        existing_rules=$(echo "$existing_rules" | jq -c --arg id "$LIFECYCLE_RULE_ID" \
            '[.[] | select(.ID != $id)]')
    fi

    jq -s '.[0].Rules = (.[1] + .[0].Rules) | .[0]' \
        <(cat "${tmp_rule}") \
        <(echo "{\"Rules\": ${existing_rules}}") > "${tmp_merged}"

    aws s3api put-bucket-lifecycle-configuration \
        --bucket "$BACKUP_BUCKET_NAME" \
        --lifecycle-configuration "file://${tmp_merged}"

    success "Lifecycle rule applied"
}

verify_lifecycle() {
    local rule
    rule=$(aws s3api get-bucket-lifecycle-configuration \
        --bucket "$BACKUP_BUCKET_NAME" \
        --query "Rules[?ID=='${LIFECYCLE_RULE_ID}']" \
        --output json 2>/dev/null || echo "[]")

    if ! echo "$rule" | jq -e ".[] | select(
        .Status == \"Enabled\" and
        any(.Transitions[]?; .StorageClass == \"GLACIER\" and .Days == ${GLACIER_TRANSITION_DAYS}))" >/dev/null; then
        error "Verification failed: lifecycle rule '${LIFECYCLE_RULE_ID}' not as expected"
        return 1
    fi
    success "Verified: Glacier transition after ${GLACIER_TRANSITION_DAYS} days is Enabled"
}

main() {
    log "=== Backup bucket protection (issue #32) ==="
    check_deps

    if ! bucket_exists; then
        error "Bucket s3://${BACKUP_BUCKET_NAME} does not exist or is not accessible"
        exit 1
    fi

    enable_versioning_mfa_delete
    apply_glacier_lifecycle

    # --- Verificação final (fail-closed) --------------------------------------
    local failed=false
    verify_versioning   || failed=true
    verify_lifecycle    || failed=true

    if [[ "$failed" == "true" ]]; then
        error "=== Bucket protection NOT fully verified — investigate before relying on it ==="
        exit 1
    fi

    success "=== Bucket protection active: MFA Delete + Versioning + Glacier@${GLACIER_TRANSITION_DAYS}d ==="
    log "Next step: ./scripts/backup/test-deletion-protection.sh (4.5.3)"
}

main "$@"
