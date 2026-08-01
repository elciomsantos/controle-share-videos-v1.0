#!/bin/bash
# =============================================================================
# Daily cleanup of stale temp uploads.
#
# The application writes incoming chunks to
#   /srv/controle-share-videos/data/uploads/_temp/
# before moving them into /srv/controle-share-videos/data/uploads/shares/
# upon completion. Aborted/interrupted uploads leave files behind; this
# script removes them once they're older than RETENTION_MINUTES so the
# _temp directory never grows unbounded.
#
# Safe by design:
#   - Only touches _temp/, never shares/.
#   - Uses mmin (modification minutes) so in-flight uploads are safe.
#   - Logs every removed path for auditability.
#
# Schedule (root crontab -e):
#   0 3 * * * /opt/controle-share-videos-v1.0/scripts/maintenance/cleanup-temp.sh \
#             >> /var/log/controle-share-videos-cleanup.log 2>&1
# =============================================================================
set -euo pipefail

TEMP_DIR="${TEMP_DIR:-/srv/controle-share-videos/data/uploads/_temp}"
# 1440 min = 24h — tolerates long uploads started late the previous day.
RETENTION_MINUTES="${RETENTION_MINUTES:-1440}"
CONTAINER_USER="${CONTAINER_USER:-1002}"
CONTAINER_GROUP="${CONTAINER_GROUP:-1002}"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*"; }

log "cleanup-temp start — dir=${TEMP_DIR} retention=${RETENTION_MINUTES}m"

if [ ! -d "${TEMP_DIR}" ]; then
  log "warn: ${TEMP_DIR} does not exist; nothing to do."
  exit 0
fi

# Defensive: refuse to run if the path looks wrong (must end in /_temp).
case "${TEMP_DIR}" in
  */_temp) ;;
  *) log "error: TEMP_DIR must end in '/_temp' (got ${TEMP_DIR})" >&2; exit 1 ;;
esac

removed=0
# Find leaf files older than RETENTION_MINUTES and delete them. We delete
# files only; empty dirs are pruned afterwards.
while IFS= read -r -d '' f; do
  if [ -f "$f" ]; then
    log "rm '$f'"
    rm -f -- "$f"
    removed=$((removed + 1))
  fi
done < <(find "${TEMP_DIR}" -type f -mmin "+${RETENTION_MINUTES}" -print0)

# Prune now-empty subdirectories (best effort, never removes non-empty).
find "${TEMP_DIR}" -type d -empty -mindepth 1 -delete 2>/dev/null || true

log "cleanup-temp done — removed ${removed} file(s)"

# Defensive: ensure the _temp dir itself keeps container ownership so the
# app can keep writing to it (Samba or docker might have created subdirs
# with different owners).
chown "${CONTAINER_USER}:${CONTAINER_GROUP}" "${TEMP_DIR}" 2>/dev/null || true
chmod 2775 "${TEMP_DIR}" 2>/dev/null || true
