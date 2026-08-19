#!/bin/bash
# =============================================================================
# Docker Bench Security — auditoria CIS do daemon/containers (INFRA-MED-03).
#
# Executa o docker-bench-security oficial (docker/docker-bench-security) contra
# o daemon do host e gera um relatório com todas as seções do CIS Benchmark.
#
# Fail-closed: se o scan não completa ou encontra checagens com status FAIL,
# o script sai com código 1 para que o cron de monitoramento detecte a regressão.
# Checagens WARN não bloqueiam (muitas são ambientes/específicas e exigem
# decisão de aceitação de risco).
#
# Uso (no host, como root):
#   ./scripts/security/docker-bench.sh
#
# Variáveis:
#   LOG_DIR        diretório dos relatórios (default /var/log/docker-bench).
#   KEEP_N         quantidade de relatórios antigos a manter (default 12).
#   IGNORE_WARN    quando "1", não falha em WARN; default "0" (falha em FAIL
#                  apenas, WARN é reportado no log).
#
# Schedule (root crontab -e), semanal com retenção de log:
#   30 5 * * 1 /opt/controle-share-videos-v1.0/scripts/security/docker-bench.sh
#
# Observações:
#   - Requer acesso ao socket do Docker e ao filesystem do host (montagens
#     abaixo). O container roda com os mesmos namespaces do host para auditar
#     a configuração real do daemon.
#   - A imagem é pull por digest (supply chain): docker/docker-bench-security.
#     Atualizar o digest periodicamente.
#   - A saída completa do CIS fica no LOG_DIR com a data no nome.
# =============================================================================
set -euo pipefail

LOG_DIR="${LOG_DIR:-/var/log/docker-bench}"
KEEP_N="${KEEP_N:-12}"
IGNORE_WARN="${IGNORE_WARN:-0}"

BENCH_IMAGE="docker/docker-bench-security@sha256:ddbdf4f86af4405da4a8a7b7cc62bb63bfeb75e85bf22d2ece70c204d7cfabb8"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*"; }

# --- Pré-requisitos ----------------------------------------------------------
command -v docker >/dev/null 2>&1 || { echo "ERROR: docker não encontrado" >&2; exit 1; }

if ! docker info >/dev/null 2>&1; then
    echo "ERROR: sem acesso ao daemon do Docker (docker info falhou)" >&2
    exit 1
fi

mkdir -p "$LOG_DIR"
REPORT="$LOG_DIR/docker-bench-$(date +%Y%m%d-%H%M%S).log"

# --- Pull da imagem pinada ---------------------------------------------------
log "Pulling $BENCH_IMAGE ..."
docker pull "$BENCH_IMAGE"

# --- Execução do benchmark ---------------------------------------------------
# Montagens: socket do Docker, /var/lib (containers/images), /etc (config do
# daemon), /usr/lib/systemd/system (unit files). Auditoria = read-only.
log "Running Docker Bench Security -> $REPORT"
set +e
docker run --rm \
    --net host \
    --pid host \
    --userns host \
    --cap-add audit_control \
    -v /var/lib:/var/lib:ro \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v /usr/lib/systemd/system:/usr/lib/systemd/system:ro \
    -v /etc:/etc:ro \
    -e DOCKER_CONTENT_TRUST=0 \
    -e DOCKER_API_VERSION=1.40 \
    "$BENCH_IMAGE" > "$REPORT" 2>&1
RC=$?
set -e

# --- Análise do resultado ----------------------------------------------------
# As linhas têm prefixos ANSI de cor; usar grep -E "[...\]" sem âncora de início.
FAIL_COUNT=$(grep -c "\[PASS\]" "$REPORT" || true)
FAIL_LINES=$(grep "\[FAIL\]" "$REPORT" || true)
WARN_LINES=$(grep "\[WARN\]" "$REPORT" || true)

log "Checagens PASS: $FAIL_COUNT"
log "Checagens FAIL: $(printf '%s\n' "$FAIL_LINES" | grep -c . || true)"
log "Checagens WARN: $(printf '%s\n' "$WARN_LINES" | grep -c . || true)"

# Rotação: remove relatórios antigos além de KEEP_N
ls -1t "$LOG_DIR"/docker-bench-*.log 2>/dev/null | tail -n +$((KEEP_N + 1)) | xargs -r rm -f

if [ "$RC" -ne 0 ]; then
    log "ERROR: docker-bench falhou com código $RC (ver $REPORT)"
    exit 1
fi

if [ -n "$FAIL_LINES" ]; then
    log "Checagens FAIL detectadas — ver $REPORT"
    exit 1
fi

if [ "$IGNORE_WARN" != "1" ] && [ -n "$WARN_LINES" ]; then
    log "Atenção: checagens WARN detectadas (não bloqueante) — ver $REPORT"
fi

log "Docker Bench Security OK"