#!/bin/bash
# =============================================================================
# Restore test — valida que o backup mais recente é restaurável (D05/H-02).
#
# Restaura o backup SQLite mais recente de BACKUP_DIR em um banco temporário
# e valida: (1) descompactação/descriptografia, (2) PRAGMA integrity_check,
# (3) schema (tabelas do Prisma presentes) e (4) counts mínimos de sanidade
# (User >= 1, Config >= 1). Nada é gravado no banco de produção.
#
# Fail-closed: se o backup não descriptografa/descomprime, o PRAGMA falha ou
# o schema/counts divergem, o script sai com código 1 e o job/cron de
# monitoramento detecta o backup corrompido antes que ele seja necessário.
#
# Uso (no host):
#   BACKUP_DIR=/opt/app/backups ./scripts/restore-test.sh
#
# Variáveis:
#   BACKUP_DIR     diretório com os backups (default /opt/app/backups).
#   GPG_RECIPIENT  email/key-id do GPG. Quando setado, o script TENTA
#                  descriptografar backups *.db.gz.gpg (e verifica *.sig quando
#                  presente); a chave privada precisa existir no ambiente de
#                  teste. Default: vazio (usa backups .db/.db.gz diretos).
#   MIN_USERS      count mínimo de usuários (default 1).
#   MIN_CONFIGS    count mínimo de configs (default 1).
#
# Schedule (root crontab -e), semanal com retenção de log:
#   30 4 * * 1 /opt/controle-share-videos-v1.0/scripts/restore-test.sh \
#             >> /var/log/controle-share-videos-restore-test.log 2>&1
# =============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/app/backups}"
GPG_RECIPIENT="${GPG_RECIPIENT:-}"
MIN_USERS="${MIN_USERS:-1}"
MIN_CONFIGS="${MIN_CONFIGS:-1}"

# Tabelas esperadas no schema Prisma (backend/prisma/schema.prisma). A ordem
# não importa — apenas presença. Se o schema evoluir, atualizar esta lista.
EXPECTED_TABLES="User RefreshToken LoginToken ResetPasswordToken Share ShareRecipient File ShareSecurity Config DownloadLog"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*"; }

fail() { log "ERROR: $*" >&2; exit 1; }

# --- Sanidade do diretório ---------------------------------------------------
if [ ! -d "${BACKUP_DIR}" ]; then
  fail "BACKUP_DIR '${BACKUP_DIR}' não existe"
fi

# --- Selecionar o backup mais recente ----------------------------------------
# Nome gerado por backup.sh: controle-videos_YYYYMMDD_HHMMSS.db[.gz[.gpg|.sig]]
# Ordenar lexicograficamente pelo timestamp do nome = mais recente por último.
latest="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'controle-videos_*' \
  | sort | tail -n1 || true)"
if [ -z "${latest}" ]; then
  fail "nenhum backup encontrado em ${BACKUP_DIR} (controle-videos_*)"
fi
log "backup mais recente: ${latest}"

# --- Workspace temporário ----------------------------------------------------
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/restore-test.XXXXXX")"
trap 'rm -rf -- "${TMP_DIR}"' EXIT

restored_db="${TMP_DIR}/restored.db"
compressed="${TMP_DIR}/restore.db.gz"

# --- 1. Descriptografar / descomprimir ---------------------------------------
case "${latest}" in
  *.gpg)
    [ -n "${GPG_RECIPIENT}" ] || fail "backup é .gpg mas GPG_RECIPIENT não foi informado"
    log "descriptografando .gpg (recipient: ${GPG_RECIPIENT})..."
    gpg --batch --yes --decrypt "${latest}" > "${compressed}" || fail "gpg --decrypt falhou"
    ;;
  *.sig)
    # .sig não é o backup — é a assinatura do .gz correspondente. O find acima
    # pode tê-la selecionado se um .gz assinado for o item mais novo no nome.
    # Busca o .gz base.
    gz="${latest%.sig}"
    if [ ! -f "${gz}" ]; then
      fail "assinatura encontrada mas ${gz} não existe"
    fi
    log "verificando assinatura GPG..."
    gpg --batch --yes --verify "${latest}" "${gz}" || fail "gpg --verify falhou"
    cp "${gz}" "${compressed}"
    ;;
  *.gz)
    cp "${latest}" "${compressed}"
    ;;
  *.db)
    log "backup sem compressão — usando direto"
    cp "${latest}" "${restored_db}"
    ;;
  *)
    fail "extensão de backup não reconhecida: ${latest}"
    ;;
esac

if [ -f "${compressed}" ]; then
  log "descomprimindo .gz..."
  gzip -dc "${compressed}" > "${restored_db}" || fail "gzip -dc falhou"
fi

[ -s "${restored_db}" ] || fail "banco restaurado está vazio"

# --- 2. PRAGMA integrity_check ------------------------------------------------
log "executando PRAGMA integrity_check..."
integrity="$(sqlite3 "${restored_db}" 'PRAGMA integrity_check;' 2>&1 || true)"
if [ "${integrity}" != "ok" ]; then
  fail "integrity_check falhou: ${integrity}"
fi
log "integrity_check: ok"

# --- 3. Validação de schema --------------------------------------------------
missing=""
for t in ${EXPECTED_TABLES}; do
  exists="$(sqlite3 "${restored_db}" \
    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='${t}';" 2>/dev/null || echo 0)"
  if [ "${exists}" != "1" ]; then
    missing="${missing} ${t}"
  fi
done
if [ -n "${missing}" ]; then
  fail "tabelas ausentes no backup:${missing}"
fi
expected_count="$(wc -w <<< "${EXPECTED_TABLES}")"
log "schema ok (${expected_count} tabelas esperadas presentes)"

# --- 4. Counts mínimos de sanidade -------------------------------------------
users="$(sqlite3 "${restored_db}" 'SELECT count(*) FROM User;' 2>/dev/null || echo 0)"
configs="$(sqlite3 "${restored_db}" 'SELECT count(*) FROM Config;' 2>/dev/null || echo 0)"
log "counts — User: ${users}, Config: ${configs}"

if [ "${users}" -lt "${MIN_USERS}" ]; then
  fail "User count (${users}) abaixo do mínimo (${MIN_USERS}) — backup vazio/incompleto?"
fi
if [ "${configs}" -lt "${MIN_CONFIGS}" ]; then
  fail "Config count (${configs}) abaixo do mínimo (${MIN_CONFIGS}) — seed ausente?"
fi

log "RESTORE TEST PASSED — backup restaurável e íntegro (${latest})"
exit 0