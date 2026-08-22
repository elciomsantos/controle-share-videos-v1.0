#!/usr/bin/env bash
# =============================================================================
# test-deletion-protection.sh — Issue #32, tarefa 4.5.3
# Simula credenciais comprometidas tentando DESTRUIR uma versão de backup:
#
#   1. Faz upload de um canário em s3://<bucket>/protection-test/
#   2. Tenta delete PERMANENTE da versão SEM MFA  -> DEVE FALHAR (AccessDenied)
#   3. Se MFA_SERIAL/MFA_TOKEN fornecidos, deleta COM MFA -> DEVE FUNCIONAR
#      (prova que a proteção é MFA e não apenas permissão ausente)
#
# Fail-closed: se a deleção sem MFA conseguir destruir a versão, sai com 1.
# Cron sugerido (mensal): 0 6 1 * * /opt/.../scripts/backup/test-deletion-protection.sh
#
# Uso:
#   AWS_PROFILE=prod BACKUP_BUCKET_NAME=controle-share-videos-backups \
#     ./scripts/backup/test-deletion-protection.sh
#   # com verificação positiva opcional:
#   MFA_SERIAL=arn:aws:iam::<acct>:mfa/<user> MFA_TOKEN=123456 \
#     AWS_PROFILE=root ./scripts/backup/test-deletion-protection.sh
# =============================================================================
set -euo pipefail

BACKUP_BUCKET_NAME="${BACKUP_BUCKET_NAME:-controle-share-videos-backups}"
AWS_REGION="${AWS_REGION:-us-east-1}"
MFA_SERIAL="${MFA_SERIAL:-}"
MFA_TOKEN="${MFA_TOKEN:-}"
CANARY_PREFIX="${CANARY_PREFIX:-protection-test}"
KEEP_CANARY="${KEEP_CANARY:-false}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()     { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
error()   { log "${RED}[ERROR]${NC} $*" >&2; }
success() { log "${GREEN}[SUCCESS]${NC} $*"; }
warn()    { log "${YELLOW}[WARN]${NC} $*"; }

cleanup_canary() {
    local key="$1" version_id="$2"
    if [[ "$KEEP_CANARY" == "true" ]]; then
        warn "KEEP_CANARY=true — canário s3://${BACKUP_BUCKET_NAME}/${key} mantido"
        return 0
    fi
    if [[ -n "$MFA_SERIAL" && -n "$MFA_TOKEN" && -n "$version_id" ]]; then
        aws s3api delete-object \
            --bucket "$BACKUP_BUCKET_NAME" --key "$key" \
            --version-id "$version_id" \
            --mfa "${MFA_SERIAL} ${MFA_TOKEN}" &>/dev/null || true
        warn "Canário removido com MFA"
    else
        warn "Canário s3://${BACKUP_BUCKET_NAME}/${key} não pôde ser removido sem MFA (esperado); remova via console/root"
    fi
}

main() {
    log "=== Backup deletion protection test (issue #32 / 4.5.3) ==="
    command -v aws &>/dev/null || { error "aws cli not found"; exit 1; }

    aws s3api head-bucket --bucket "$BACKUP_BUCKET_NAME" &>/dev/null || {
        error "Bucket s3://${BACKUP_BUCKET_NAME} inacessível"
        exit 1
    }

    # --- Pré-checagem: Versioning + MFADelete ativos --------------------------
    log "[0/3] Checking bucket protection state..."
    local status mfa_delete
    status=$(aws s3api get-bucket-versioning --bucket "$BACKUP_BUCKET_NAME" \
        --query 'Status' --output text 2>/dev/null || echo "Absent")
    mfa_delete=$(aws s3api get-bucket-versioning --bucket "$BACKUP_BUCKET_NAME" \
        --query 'MFADelete' --output text 2>/dev/null || echo "Disabled")

    if [[ "$status" != "Enabled" || "$mfa_delete" != "Enabled" ]]; then
        error "Proteção inativa: Status=${status}, MFADelete=${mfa_delete}"
        error "Execute primeiro: scripts/provision/backup-bucket-protection.sh"
        exit 1
    fi
    success "Versioning=${status}, MFADelete=${mfa_delete}"

    # --- [1/3] Upload do canário ----------------------------------------------
    log "[1/3] Uploading canary object..."
    local canary_key="protection-test/canary_$(date '+%Y%m%d_%H%M%S').txt"
    printf 'deletion-protection-canary %s\n' "$(date -Iseconds)" \
        > /tmp/deletion-canary.txt

    aws s3api put-object \
        --bucket "$BACKUP_BUCKET_NAME" --key "$canary_key" \
        --body /tmp/deletion-canary.txt \
        --server-side-encryption AES256 >/dev/null
    rm -f /tmp/deletion-canary.txt

    local version_id
    version_id=$(aws s3api head-object \
        --bucket "$BACKUP_BUCKET_NAME" --key "$canary_key" \
        --query 'VersionId' --output text)
    [[ -n "$version_id" && "$version_id" != "None" ]] || {
        error "Não foi possível obter VersionId (versioning realmente ativo?)"
        exit 1
    }
    success "Canary uploaded: s3://${BACKUP_BUCKET_NAME}/${canary_key} (${version_id})"

    # --- [2/3] Deleção PERMANENTE sem MFA -> deve FALHAR ----------------------
    log "[2/3] Attempting PERMANENT deletion WITHOUT MFA (simulating compromised credentials)..."
    local delete_output exit_code=0
    delete_output=$(aws s3api delete-object \
        --bucket "$BACKUP_BUCKET_NAME" \
        --key "$canary_key" \
        --version-id "$version_id" 2>&1) || exit_code=$?

    if [[ "$exit_code" -eq 0 ]]; then
        error "FALHA DE SEGURANÇA: deleção permanente da versão SUCEDIDA sem MFA!"
        error "O bucket NÃO está protegido contra credenciais comprometidas."
        exit 1
    fi

    if ! echo "$delete_output" | grep -qiE "AccessDenied|InvalidRequest|MFA|MultiFactor"; then
        warn "Delete falhou, mas sem mensagem clara de MFA:"
        warn "${delete_output}"
        warn "Verifique se a falha é por MFA Delete (e não por IAM)."
    fi

    # Confirma que a versão ainda existe (a falha foi real)
    if ! aws s3api head-object \
        --bucket "$BACKUP_BUCKET_NAME" --key "$canary_key" \
        --version-id "$version_id" &>/dev/null; then
        error "Versão do canário desapareceu após delete sem MFA — proteção ineffectiva!"
        exit 1
    fi
    success "Deleção sem MFA REJEITADA (versão preservada): $(echo "$delete_output" | head -c 200)"

    # --- [3/3] Deleção COM MFA -> deve FUNCIONAR (opcional) -------------------
    if [[ -n "$MFA_SERIAL" && -n "$MFA_TOKEN" ]]; then
        log "[3/3] Attempting permanent deletion WITH MFA..."
        if aws s3api delete-object \
            --bucket "$BACKUP_BUCKET_NAME" --key "$canary_key" \
            --version-id "$version_id" \
            --mfa "${MFA_SERIAL} ${MFA_TOKEN}" &>/dev/null; then
            success "Deleção com MFA funcionou — proteção validada nas duas direções"
        else
            error "Deleção com MFA falhou — investigue serial/token/políticas"
            exit 1
        fi
    else
        log "[3/3] Skipping positive MFA test (MFA_SERIAL/MFA_TOKEN not provided)"
        cleanup_canary "$canary_key" "$version_id"
    fi

    success "=== PASS: backup versions cannot be destroyed without MFA ==="
}

main "$@"
