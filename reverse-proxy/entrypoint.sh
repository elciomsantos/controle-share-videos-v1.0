#!/bin/sh
# =============================================================================
# Caddy entrypoint wrapper (DOP-05)
#
# Docker secrets mounted as files (convencao *_FILE, e.g. DOMAIN_FILE=/run/
# secrets/domain) are NOT expanded by Caddy's {$VAR} placeholders. This
# wrapper reads each *_FILE and exports the corresponding variable so the
# Caddyfile can use {$DOMAIN} / {$ACME_EMAIL}.
# =============================================================================
set -eu

resolve_file_var() {
    file_var="$1"
    var="$2"
    file_path="$(eval "printf '%s' \"\${$file_var:-}\"")"
    if [ -n "$file_path" ] && [ -r "$file_path" ]; then
        eval "export $var=\"\$(cat \"\$file_path\")\""
    fi
}

resolve_file_var DOMAIN_FILE DOMAIN
resolve_file_var ACME_EMAIL_FILE ACME_EMAIL

# CMD da imagem: ["caddy", "run", "--config", ...]. Argumentos passados no
# `docker run` substituem o CMD, entao prefixa "caddy" quando ausente para
# preservar o comportamento padrao e permitir subcomandos (validate, fmt).
if [ "${1:-}" = "caddy" ]; then
    exec "$@"
fi
exec caddy "$@"
