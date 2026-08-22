#!/usr/bin/env bash
# =============================================================================
# alertmanager-secrets.sh — Issue #24 (3.8.2): provisiona os secrets que o
# serviço `alertmanager` (docker-compose.monitoring.yml) renderiza no config:
#
#   scripts/secrets/slack_webhook_url      -> __SLACK_API_URL__
#   scripts/secrets/pagerduty_routing_key  -> __PAGERDUTY_ROUTING_KEY__
#
# Usage:
#   scripts/provision/alertmanager-secrets.sh <slack-webhook-url> <pagerduty-routing-key>
#
# Sem argumentos, cria placeholders "UNCONFIGURED" (o Alertmanager sobe, mas
# as notificações falham nos logs até configurar de verdade).
#
# Re-runnable: idempotente — sobrescreve os arquivos.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SECRETS_DIR="${REPO_ROOT}/scripts/secrets"
SLACK_FILE="${SECRETS_DIR}/slack_webhook_url"
PD_FILE="${SECRETS_DIR}/pagerduty_routing_key"

mkdir -p "${SECRETS_DIR}"
chmod 700 "${SECRETS_DIR}"

for rel in "scripts/secrets/slack_webhook_url" "scripts/secrets/pagerduty_routing_key"; do
  if ! git -C "${REPO_ROOT}" check-ignore -q "${rel}" 2>/dev/null; then
    echo "[warn] '${rel}' is not ignored by git. Aborting to avoid committing credentials." >&2
    exit 1
  fi
done

SLACK="${1:-UNCONFIGURED}"
PD="${2:-UNCONFIGURED}"

write_secret() {
  local file="$1" value="$2"
  local tmp="${file}.tmp.$$"
  printf '%s' "${value}" > "${tmp}"
  chmod 600 "${tmp}"
  mv -f "${tmp}" "${file}"
}

write_secret "${SLACK_FILE}" "${SLACK}"
write_secret "${PD_FILE}" "${PD}"

echo "=== alertmanager secrets provisioned ==="
echo "Slack webhook:      ${SLACK_FILE} $([[ ${SLACK} == UNCONFIGURED ]] && echo '(placeholder — notificações Slack NÃO funcionarão)')"
echo "PagerDuty routing:  ${PD_FILE} $([[ ${PD} == UNCONFIGURED ]] && echo '(placeholder — paging PagerDuty NÃO funcionará)')"
echo
echo "Para aplicar: docker compose -f docker-compose.monitoring.yml up -d alertmanager"