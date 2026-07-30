#!/usr/bin/env bash
# =============================================================================
# GAP-06: provision the grafana_admin_password secret that
# docker-compose.monitoring.yml binds into the Grafana container.
#
# Works with plain `docker compose` (no Swarm). Generates a strong, freshly
# rotated password if none is provided, prints it once, and tells you how to
# retrieve Grafana at http://localhost:3001.
#
# Usage:
#   scripts/provision/grafana-secret.sh                 # generate (auto)
#   scripts/provision/grafana-secret.sh <my-password>   # use the given value
#
# Re-runnable: idempotent — overwrites the existing secret file.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# scripts/provision/* -> repo root is two levels up
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SECRETS_DIR="${REPO_ROOT}/scripts/secrets"
SECRET_FILE="${SECRETS_DIR}/grafana_admin_password"
GITIGNORE="${REPO_ROOT}/.gitignore"
REL_SECRET_FILE="scripts/secrets/grafana_admin_password"

mkdir -p "${SECRETS_DIR}"
chmod 700 "${SECRETS_DIR}"

# Defensive: refuse to continue if the file somehow ended up tracked by git
# (the .gitignore entry exists to prevent this). Pass the path relative to
# the repo root so `git check-ignore` resolves against the right gitignore.
REL_SECRET_FILE="scripts/secrets/grafana_admin_password"
if ! git -C "${REPO_ROOT}" check-ignore -q "${REL_SECRET_FILE}" 2>/dev/null; then
  echo "[warn] '${REL_SECRET_FILE}' is not ignored by git. Aborting to avoid committing credentials." >&2
  echo "       Add '/scripts/secrets/' to ${GITIGNORE} and re-run." >&2
  exit 1
fi

if [[ $# -ge 1 ]]; then
  PASSWORD="$1"
else
  # cryptographically strong: 32 bytes base64url
  PASSWORD="$(openssl rand -base64 32 | tr -d '\n')"
fi

# Write atomically: write to temp then rename so concurrent readers never see
# a partial file, and never relax file permissions beyond owner-only.
TMP_FILE="${SECRET_FILE}.tmp.$$"
printf '%s' "${PASSWORD}" > "${TMP_FILE}"
chmod 600 "${TMP_FILE}"
mv -f "${TMP_FILE}" "${SECRET_FILE}"
chmod 600 "${SECRET_FILE}"

echo "=== grafana_admin_password secret created ==="
echo "File:   ${SECRET_FILE}"
echo "Mode:   600"
echo "Value:  ${PASSWORD}"
echo
echo "Login URL: http://localhost:3001   (compose maps host 3001 -> container 3000)"
echo "Username:  admin"
echo "Password:  <value above>"
echo
echo "To rotate, re-run this script."
