#!/usr/bin/env bash
# forensic-snapshot.sh - Preserva evidências forenses em incidente SEV-1/2 (SEC-4.6)
# Usage: sudo ./forensic-snapshot.sh --incident INC-2026-001 [--output /var/evidence] [--no-upload]
#
# Captura, nesta ordem:
#   1. Estado volátil do host/containers (ps, netstat, docker inspect, logs)
#   2. Banco SQLite (checkpoint WAL + cópia consistente)
#   3. Volumes de dados (uploads) via tar preservando timestamps/permissões
#   4. Manifest com hashes SHA-256 de cada artefato (baseline chain of custody)
#
# NUNCA modifique os artefatos após a captura. Trabalhe apenas sobre cópias.
# Ver docs/forensics.md para o procedimento completo de custódia.

set -euo pipefail

INCIDENT_ID=""
OUTPUT_DIR="/var/evidence"
UPLOAD=false
DATA_DIR="${DATA_DIR:-/opt/controle-share-videos-v1.0/data}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-controle-share-videos-v1_0}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --incident) INCIDENT_ID="$2"; shift 2 ;;
        --output) OUTPUT_DIR="$2"; shift 2 ;;
        --data-dir) DATA_DIR="$2"; shift 2 ;;
        --compose-project) COMPOSE_PROJECT="$2"; shift 2 ;;
        --upload) UPLOAD=true; shift ;;
        -h|--help)
            grep '^#' "$0" | head -20; exit 0 ;;
        *) echo "Argumento desconhecido: $1"; exit 1 ;;
    esac
done

[[ -z "$INCIDENT_ID" ]] && { echo "ERRO: --incident é obrigatório (ex: INC-2026-001)"; exit 1; }

TIMESTAMP=$(date -u '+%Y%m%dT%H%M%SZ')
EVIDENCE_DIR="${OUTPUT_DIR}/${INCIDENT_ID}_${TIMESTAMP}"
VOLATILE_DIR="${EVIDENCE_DIR}/volatile"
DB_DIR="${EVIDENCE_DIR}/database"
FILES_DIR="${EVIDENCE_DIR}/files"

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }

mkdir -p "$VOLATILE_DIR" "$DB_DIR" "$FILES_DIR"
chmod 700 "$EVIDENCE_DIR"

log "=== Snapshot forense ${INCIDENT_ID} iniciado ==="

# -----------------------------------------------------------------------------
# 1. ESTADO VOLÁTIL — capturar ANTES de qualquer contenção
# -----------------------------------------------------------------------------
log "[1/5] Capturando estado volátil..."

{ date -u; uname -a; uptime; } > "$VOLATILE_DIR/system.txt" 2>&1
ps auxfww > "$VOLATILE_DIR/processes.txt" 2>&1 || true
ss -tulpn > "$VOLATILE_DIR/network-sockets.txt" 2>&1 || \
    netstat -tulpn > "$VOLATILE_DIR/network-sockets.txt" 2>&1 || true
ip addr > "$VOLATILE_DIR/network-interfaces.txt" 2>&1 || true
ip neigh > "$VOLATILE_DIR/network-neighbors.txt" 2>&1 || true
last -Fai > "$VOLATILE_DIR/logins.txt" 2>&1 || true
docker ps -a --no-trunc > "$VOLATILE_DIR/docker-ps.txt" 2>&1 || true
docker images --no-trunc > "$VOLATILE_DIR/docker-images.txt" 2>&1 || true

for svc in backend frontend caddy; do
    if docker inspect "${COMPOSE_PROJECT}-${svc}-1" >/dev/null 2>&1; then
        docker inspect "${COMPOSE_PROJECT}-${svc}-1" \
            > "$VOLATILE_DIR/docker-inspect-${svc}.json" 2>/dev/null || true
        docker logs --timestamps --since 24h "${COMPOSE_PROJECT}-${svc}-1" \
            > "$VOLATILE_DIR/logs-${svc}-24h.log" 2>&1 || true
        docker top "${COMPOSE_PROJECT}-${svc}-1" \
            > "$VOLATILE_DIR/docker-top-${svc}.txt" 2>&1 || true
    fi
done

cp /etc/passwd "$VOLATILE_DIR/passwd.txt" 2>/dev/null || true
crontab -l > "$VOLATILE_DIR/crontab-root.txt" 2>&1 || true

# -----------------------------------------------------------------------------
# 2. BANCO DE DADOS — checkpoint WAL e cópia consistente
# -----------------------------------------------------------------------------
log "[2/5] Capturando banco de dados..."
DB_FILE="${DATA_DIR}/backend/controle-videos.db"

if [[ -f "$DB_FILE" ]]; then
    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "$DB_FILE" ".backup '${DB_DIR}/controle-videos-snapshot.db'" 2>/dev/null \
            || cp "$DB_FILE" "${DB_DIR}/controle-videos-snapshot.db"
    else
        # Sem sqlite3: copiar DB + WAL + SHM juntos (menos ideal, documentar)
        cp "$DB_FILE" "${DB_DIR}/controle-videos-snapshot.db"
        [[ -f "${DB_FILE}-wal" ]] && cp "${DB_FILE}-wal" "${DB_DIR}/" || true
        [[ -f "${DB_FILE}-shm" ]] && cp "${DB_FILE}-shm" "${DB_DIR}/" || true
        log "AVISO: sqlite3 ausente — copiado DB+WAL brutos; validar integridade depois"
    fi
else
    log "AVISO: DB não encontrado em $DB_FILE"
fi

# -----------------------------------------------------------------------------
# 3. VOLUMES (uploads) — tar preservando metadados
# -----------------------------------------------------------------------------
log "[3/5] Empacotando volume de uploads..."
UPLOADS_DIR="${DATA_DIR}/uploads"

if [[ -d "$UPLOADS_DIR" ]]; then
    tar -cpf "${FILES_DIR}/uploads.tar" \
        --atime-preserve=system --numeric-owner -C "$(dirname "$UPLOADS_DIR")" \
        "$(basename "$UPLOADS_DIR")" 2>/dev/null \
        || tar -cpf "${FILES_DIR}/uploads.tar" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
    gzip "${FILES_DIR}/uploads.tar"
else
    log "AVISO: diretório de uploads não encontrado em $UPLOADS_DIR"
fi

# Logs de auditoria da aplicação (se persistidos fora do DB)
AUDIT_DIR="${DATA_DIR}/logs"
if [[ -d "$AUDIT_DIR" ]]; then
    tar -czpf "${EVIDENCE_DIR}/app-logs.tar.gz" -C "$(dirname "$AUDIT_DIR")" "$(basename "$AUDIT_DIR")" \
        2>/dev/null || true
fi

# -----------------------------------------------------------------------------
# 4. UPLOAD OPCIONAL PARA BUCKET IMUTÁVEL
# -----------------------------------------------------------------------------
if [[ "$UPLOAD" == true ]]; then
    log "[4/5] Enviando para bucket imutável..."
    if command -v aws >/dev/null 2>&1 && [[ -n "${EVIDENCE_BUCKET:-}" ]]; then
        tar -czf "/tmp/${INCIDENT_ID}_${TIMESTAMP}.tar.gz" -C "$OUTPUT_DIR" "${INCIDENT_ID}_${TIMESTAMP}"
        aws s3 cp "/tmp/${INCIDENT_ID}_${TIMESTAMP}.tar.gz" \
            "s3://${EVIDENCE_BUCKET}/evidence/" --sse aws:kms \
            --metadata incident-id="$INCIDENT_ID",captured-at="$TIMESTAMP" \
            && log "Upload concluído" \
            || log "ERRO: upload falhou — artefatos permanecem em $EVIDENCE_DIR"
        shred -u "/tmp/${INCIDENT_ID}_${TIMESTAMP}.tar.gz" 2>/dev/null || rm -f "/tmp/${INCIDENT_ID}_${TIMESTAMP}.tar.gz"
    else
        log "AVISO: aws CLI ou EVIDENCE_BUCKET ausente — pulando upload"
    fi
else
    log "[4/5] Upload pulado (--upload não informado)"
fi

# -----------------------------------------------------------------------------
# 5. MANIFEST + HASHES (baseline da cadeia de custódia)
# -----------------------------------------------------------------------------
log "[5/5] Gerando manifest com hashes SHA-256..."
MANIFEST="${EVIDENCE_DIR}/MANIFEST.sha256"

cat > "${EVIDENCE_DIR}/manifest.json" <<EOF
{
  "incident_id": "${INCIDENT_ID}",
  "captured_at": "${TIMESTAMP}",
  "captured_by": "$(whoami)",
  "host": "$(hostname)",
  "kernel": "$(uname -r)",
  "data_dir": "${DATA_DIR}",
  "tool_version": "forensic-snapshot.sh v1.0",
  "hash_algorithm": "sha256",
  "manifest_file": "MANIFEST.sha256"
}
EOF

cd "$EVIDENCE_DIR"
find . -type f ! -name MANIFEST.sha256 -exec sha256sum {} \; > "$MANIFEST"
chmod 600 "$MANIFEST" manifest.json

ARTIFACTS=$(grep -c . "$MANIFEST" || echo 0)
log "=== Snapshot concluído: $ARTIFACTS artefatos em $EVIDENCE_DIR ==="
echo ""
echo "PRÓXIMOS PASSOS (docs/forensics.md):"
echo "  1. Registrar coleta no Chain of Custody Log (data/hora/responsável)"
echo "  2. Transferir mídia somente leitura (write-blocker se disco físico)"
echo "  3. Verificar hashes na chegada ao repositório seguro"
echo "  4. Anexar caminho dos artefatos à issue do incidente"
