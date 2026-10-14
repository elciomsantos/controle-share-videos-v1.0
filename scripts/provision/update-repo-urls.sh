#!/usr/bin/env bash
# =============================================================================
# update-repo-urls.sh — Repontua as URLs hardcodadas do repositório
# =============================================================================
# Usado no fork para a empresa (docs/operacional/FORK-EMPRESA.md): substitui
# todas as referências ao repositório de origem (elciomsantos/...) pelo
# repositório da empresa em:
#   - package.json (raiz, backend, frontend, scripts) — campo repository.url
#   - scripts/monitoring/alerts.yml — runbook_url de cada alerta
#   - README.md / SECURITY.md / docs/operacional/DEPLOY.md — URLs de clone
#
# Uso (no clone da EMPRESA, após o fork):
#   NEW_REPO_URL=https://github.com/minha-empresa/controle-share-videos.git \
#     ./scripts/provision/update-repo-urls.sh
#   # ou: ./scripts/provision/update-repo-urls.sh minha-empresa/controle-share-videos
#
# Idempotente: pode ser re-executado (substitui a origem anterior, seja ela
# qual for). Fail-closed: sai com 1 se sobrar referência à origem antiga.
#
# NOTA: o CI/CD (GHCR, cosign, SLSA, dependabot) é 100% dinâmico
# (usa ${{ github.repository }}) — não precisa de ajuste. Este script cobre
# apenas as URLs literais em arquivos rastreados.
# =============================================================================
set -euo pipefail

UPSTREAM_REPO="elciomsantos/controle-share-videos-v1.0"

if [ "${1:-}" != "" ] && [ -n "${NEW_REPO_URL:-}" ]; then
  echo "[update-repo-urls] ERRO: informe o destino via argumento OU via NEW_REPO_URL, não ambos" >&2
  exit 1
fi

if [ "${1:-}" != "" ]; then
  NEW_REPO_URL="https://github.com/${1#https://github.com/}"
fi
NEW_REPO_URL="${NEW_REPO_URL:-}"
# Normaliza sufixo .git (package.json usa .git; docs/alerts não).
NEW_REPO="${NEW_REPO_URL%.git}"

if [ -z "${NEW_REPO_URL}" ]; then
  echo "[update-repo-urls] ERRO: informe o repositório de destino" >&2
  echo "  Uso: NEW_REPO_URL=https://github.com/org/repo.git ./scripts/provision/update-repo-urls.sh" >&2
  echo "   ou: ./scripts/provision/update-repo-urls.sh org/repo" >&2
  exit 1
fi

if [ "${NEW_REPO}" = "${UPSTREAM_REPO}" ]; then
  echo "[update-repo-urls] ERRO: destino (${NEW_REPO}) é igual à origem (${UPSTREAM_REPO}) — nada a fazer" >&2
  exit 1
fi

echo "[update-repo-urls] origem : https://github.com/${UPSTREAM_REPO}"
echo "[update-repo-urls] destino: ${NEW_REPO_URL}"

# --- 1. Substituição nos arquivos rastreados -------------------------------
# package.json usam URL com sufixo .git; docs/alertas usam sem sufixo.
FILES=(
  package.json
  backend/package.json
  frontend/package.json
  scripts/package.json
  scripts/monitoring/alerts.yml
  README.md
  SECURITY.md
  docs/operacional/DEPLOY.md
)

for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "[update-repo-urls] AVISO: ${f} não encontrado — pulando" >&2
    continue
  fi
  if grep -q "github.com/${UPSTREAM_REPO}" "$f"; then
    sed -i \
      -e "s|https://github\.com/${UPSTREAM_REPO}\.git|${NEW_REPO}.git|g" \
      -e "s|https://github\.com/${UPSTREAM_REPO}|${NEW_REPO}|g" \
      "$f"
    echo "[update-repo-urls] atualizado: ${f}"
  fi
done

# --- 2. Fail-closed: nenhuma referência à origem pode restar ----------------
LEFT=$(grep -rn "github.com/${UPSTREAM_REPO}" \
  --include="*.json" --include="*.yml" --include="*.yaml" --include="*.md" \
  . 2>/dev/null | grep -v "docs/operacional/FORK-EMPRESA.md" | grep -v ".git/" || true)

if [ -n "${LEFT}" ]; then
  echo "[update-repo-urls] ERRO: referências à origem ainda presentes:" >&2
  echo "${LEFT}" >&2
  exit 1
fi

# --- 3. Validar JSON dos package.json editados ------------------------------
for f in package.json backend/package.json frontend/package.json scripts/package.json; do
  [ -f "$f" ] || continue  # ausência já foi avisada no passo 1
  node -e "JSON.parse(require('fs').readFileSync('${f}','utf8'))" \
    || { echo "[update-repo-urls] ERRO: ${f} ficou inválido" >&2; exit 1; }
done

echo "[update-repo-urls] OK — nenhuma referência restante; JSONs válidos."
echo "[update-repo-urls] Próximos passos (ver docs/operacional/FORK-EMPRESA.md):"
echo "  1. Commit + push na branch main da empresa"
echo "  2. Configurar secrets DEPLOY_* e variable DEPLOY_ENABLED no repo da empresa"
echo "  3. Reapontar o clone do host de produção (origin) para o repo da empresa"
