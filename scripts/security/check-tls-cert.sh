#!/usr/bin/env bash
# =============================================================================
# check-tls-cert.sh — Issue #15 (2.8.3): verificação manual/agendada do cert
# TLS público. Complementa o exporter do backend (TlsCertificateChecker, que
# alimenta o Prometheus) com um check standalone para cron/terminal.
#
# Uso:
#   ./scripts/security/check-tls-cert.sh <dominio> [dominio2 ...]
#   TLS_PROBE_DOMAINS="a.com b.com" ./scripts/security/check-tls-cert.sh
#
# Saída: status por domínio; exit 1 se algum cert expira em menos de
# TLS_MIN_DAYS (default 30) ou se o handshake falhar.
# =============================================================================
set -euo pipefail

TLS_MIN_DAYS="${TLS_MIN_DAYS:-30}"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

domains=("$@")
if [[ ${#domains[@]} -eq 0 && -n "${TLS_PROBE_DOMAINS:-}" ]]; then
    read -r -a domains <<< "$TLS_PROBE_DOMAINS"
fi
if [[ ${#domains[@]} -eq 0 ]]; then
    echo "uso: $0 <dominio> [...]  (ou export TLS_PROBE_DOMAINS=\"...\")" >&2
    exit 2
fi

failed=0
for domain in "${domains[@]}"; do
    end_date=$(echo | openssl s_client -servername "$domain" -connect "${domain}:443" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)

    if [[ -z "$end_date" ]]; then
        echo -e "${RED}[FAIL]${NC} ${domain}: handshake falhou ou certificado ilegível"
        failed=1
        continue
    fi

    end_epoch=$(date -d "$end_date" +%s)
    days_left=$(( (end_epoch - $(date +%s)) / 86400 ))
    issuer=$(echo | openssl s_client -servername "$domain" -connect "${domain}:443" 2>/dev/null \
        | openssl x509 -noout -issuer 2>/dev/null | sed 's/^issuer=//' || echo "?")

    if (( days_left < 0 )); then
        echo -e "${RED}[EXPIRADO]${NC} ${domain} expirou em ${end_date}"
        failed=1
    elif (( days_left < TLS_MIN_DAYS )); then
        echo -e "${YELLOW}[WARN]${NC} ${domain} expira em ${days_left} dias (${end_date}) — ${issuer}"
        failed=1
    else
        echo -e "${GREEN}[OK]${NC} ${domain} expira em ${days_left} dias (${end_date})"
    fi
done

exit "$failed"
