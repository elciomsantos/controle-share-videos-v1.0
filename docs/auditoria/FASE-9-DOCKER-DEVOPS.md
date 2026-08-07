# FASE 9 — Auditoria Docker/DevOps

**Status:** ✅ Concluída
**Data:** 2026-08-04
**Escopo:** `Dockerfile` (7 estágios), `docker-compose.{yml,local,dev,prod,monitoring}.yml`, `reverse-proxy/Caddyfile*`, `scripts/docker/*.sh`, `.dockerignore`, secrets e variáveis de ambiente de deploy.

---

## 9.1 Resumo Executivo

A base de imagem e os scripts de entrada são **exemplares** (multi-stage com purge de build-deps, non-root com UID/GID estável, imagem final sem npm, healthchecks e limites de recursos). Porém a camada de orquestração esconde **dois defeitos bloqueantes de produção** e um conjunto de inconsistências entre os compose files:

1. ~~**O serviço `frontend` nos compose files builda o alvo errado**~~ ✅ **Resolvido (2026-08-07):** o compose base passou a usar `target: frontend-runner` + `command` que inicia o servidor standalone (mesmo padrão do prod). O estágio `frontend-runner` foi validado servindo HTTP 200 na porta 3333.
2. ~~**ClamAV é implantado como "varredura obrigatória"**~~ (`docker-compose.yml:83`, `docker-compose.dev.yml`) **mas nenhum código o consome** — ~~o backend nunca chama o `ClamScanService` (SEC-02/QAL-02/INF-03). Um serviço com limite de 1G de RAM que escaneia nada, ecoando no deploy o código morto já identificado em 3 fases~~. ✅ **Resolvido (2026-08-07):** a decisão formal (`docs/Padronizacao-07-clamav.md`, 26/07/2026) rejeita a integração e o serviço `clamav/clamav` foi **removido dos compose files** — o controle fantasma não existe mais (fecha DOP-02, SEC-02/QAL-02/INF-03).
3. ~~O `docker-compose.yml` **base é superseded e inconsistente**: `DATABASE_URL=file:/data/controle-videos.db` aponta para fora do volume (`backend-data:/opt/app/backend/data`), Caddy `2.8` vs `2.9` no prod, e injeta secrets (`jwt_secret`, `smtp_password`) que o aplicativo **não consome**~~ (o JWT é gerado no boot via `config.seed.ts`; o SMTP vem da tabela `config`). ✅ **Resolvido (2026-08-07):** o compose base foi **consolidado** com o modelo prod (Caddy 2.9 custom, `frontend-runner`, `DATABASE_URL` no volume) e os secrets mortos foram removidos (DOP-04).

**Nota de escopo:** Fase 8 cobriu dependências; esta fase cobre o empacotamento. Os achados da Fase 8 (INF-01/02) reincidem aqui (`:latest` no monitoring, Node não pinado fora do Dockerfile).

## 9.2 Critérios Avaliados

| Critério | Método | Evidência |
|---|---|---|
| Higiene da imagem | Inspeção do `Dockerfile` (estágios, non-root, cache, purge) | Multi-stage 7 estágios; `apk del .build-deps`; sem npm na imagem final |
| Correção do orquestramento | Cruzamento dos compose files com os estágios/CMDs reais | `frontend-builder` como runtime; `Caddyfile.prod` → `frontend:3333` |
| Segurança do deploy | Secrets, `_FILE` envs, bind mounts, network, healthchecks | `user.seed.ts` lê `*_FILE`; Caddy `{$DOMAIN}` vs `DOMAIN_FILE` |
| Consistência compose | Diff entre base/local/dev/prod/monitoring | Caddy 2.8 vs 2.9; `DATABASE_URL` divergente; secrets mortos |
| Supply-chain de imagem | Pinagem de tags/digests | `:latest` em monitoring e ClamAV |

## 9.3 Achados Detalhados

### DOP-01 — Serviço `frontend` builda alvo errado (`frontend-builder`); frontend inalcançável em prod 🔴 Alto — ✅ Resolvido (2026-08-07)

- **Onde:** `docker-compose.yml:50`, `docker-compose.prod.yml:12` (`target: frontend-builder`), `Dockerfile:12-18` (estágio sem CMD), `reverse-proxy/Caddyfile.prod` (`reverse_proxy frontend:3333`).
- **Evidência:** o estágio `frontend-builder` termina em `RUN npm run build` — sem `CMD`, `ENTRYPOINT` ou `EXPOSE`. O único runtime com entrada válida é o estágio final `runner` (`Dockerfile:124-125`). O `frontend` standalone de verdade é montado no estágio `frontend-runner` (`Dockerfile:49-55`) e embutido na imagem `runner`. Nos compose, porém, o serviço `frontend` aponta para o alvo `frontend-builder`: o contêiner sobe com o CMD herdado do `node:24-alpine` (`node`, REPL que termina com stdin EOF) e não serve a porta 3333. Como `Caddyfile.prod` roteia `handle { reverse_proxy frontend:3333 }`, em produção o Caddy aponta para um contêiner que **não responde**.
- **Impacto:** frontend indisponível em produção; o healthcheck `curl :3333` (prod `docker-compose.prod.yml:19-22`) falha em loop, e a UI não carrega.
- **Resolução:** o compose base (`docker-compose.yml`) passou a usar `target: frontend-runner` + `command` que inicia o servidor standalone (`PORT=3333 HOSTNAME=0.0.0.0 node server.js`), espelhando o padrão já aplicado no prod. Validado: `frontend-runner` responde HTTP 200 na porta 3333. O compose prod já usava o alvo correto.

### DOP-02 — ClamAV implantado como "obrigatório" mas nunca usado — controle fantasma no deploy 🔴 Alto — ✅ Resolvido (2026-08-07)

- **Onde:** `docker-compose.yml:83-98` (comentário "ClamAV for mandatory malware scanning in production (MED-06)"), `docker-compose.dev.yml` (porta 3310), `backend/src/clamscan/*` (nunca invocado).
- **Evidência:** o compose provisionava `clamav/clamav` com 1G de RAM; o backend não tinha **nenhuma** referência runtime ao serviço (sem env de host/porta, sem chamada — `share.service.ts:246-249` contém apenas o comentário de remoção). Nenhum `depends_on`/healthcheck ligava o backend ao ClamAV.
- **Impacto:** segurança declarada que não executa; um atacante não pode contar com ela, mas o operador acredita que sim. Consolida SEC-02 (Fase 5), QAL-02 (Fase 7) e INF-03 (Fase 8) no plano de deploy.
- **Resolução:** decisão formal `docs/Padronizacao-07-clamav.md` (26/07/2026) **rejeita** a integração. O serviço `clamav/clamav` foi **removido dos compose files** (base e dev), junto do módulo `backend/src/clamscan/` e da dependência `clamscan`. Não há mais controle fantasma no deploy.

### DOP-03 — `DATABASE_URL` do compose base aponta para fora do volume — risco de perda de dados 🟠 Médio — ✅ Resolvido

- **Onde:** `docker-compose.yml:33` (`DATABASE_URL=file:/data/controle-videos.db`) vs volume `backend-data:/opt/app/backend/data` (l.42) e prod/local (`file:/opt/app/backend/data/controle-videos.db` / `./data`).
- **Evidência:** o entrypoint roda com `WORKDIR /opt/app/backend`; o volume de persistência monta em `/opt/app/backend/data`. O path `/data` do compose base **não é persistido** — o SQLite seria recriado a cada `up`/recreate.
- **Impacto:** se o compose base for usado, perda total do banco (config, shares, users) em qualquer recriação de contêiner.
- **Resolução:** corrigido no commit `272e204` — o compose base usa `DATABASE_URL=file:/opt/app/backend/data/controle-videos.db` (l.33), dentro do volume `backend-data:/opt/app/backend/data`. Consistente com o prod (`file:/opt/app/backend/data/controle-videos.db` montado em `/srv/controle-share-videos/data`).

### DOP-04 — Compose base inconsistente e superseded: Caddy 2.8 vs 2.9, secrets mortos 🟠 Médio — ✅ Resolvido (2026-08-07)

- **Onde:** `docker-compose.yml` (todo), `docker-compose.prod.yml`, `Dockerfile:116`, `backend/prisma/seed/user.seed.ts`.
- **Evidência:**
  - Caddy: base `caddy:2.8-alpine` (l.64) vs prod `caddy:2.9-alpine` e o comentário do Dockerfile l.116 ("caddy:2.9-alpine") — o base está defasado.
  - Secrets: o base injeta `jwt_secret`, `admin_password`, `smtp_password` via `./secrets/*.txt` (l.37-40, 117-122), mas **nenhum** é mapeado para env `*_FILE`/consumo. O JWT é gerado no primeiro boot (`config.seed.ts` → `internal.jwtSecret`, conforme comentário do prod l.121-124: "no jwt_secret secret is required"); as credenciais SMTP vêm da tabela `config` (`email.service.ts:29-35` lê `smtp.username`/`smtp.password`). Os únicos `*_FILE` realmente lidos são `ADMIN_EMAIL`/`ADMIN_USERNAME`/`ADMIN_PASSWORD` (`user.seed.ts:17,30-32`, via `readSecretEnv`). Ou seja: **`jwt_secret` e `smtp_password` são secrets mortos** no compose base, que ainda **exige** os arquivos `./secrets/*.txt` (gitignored) para subir.
- **Impacto:** config de deploy que falha em clone limpo, injeta secrets não usados e diverge do modelo prod (Swarm/external).
- **Resolução:** o compose base foi consolidado com o modelo prod/seguro — passou a usar o Caddy 2.9 custom (rate_limit, via INFRA-HIGH-01), `target: frontend-runner` (DOP-01) e `DATABASE_URL` no volume (DOP-03), todos já vigentes; os secrets mortos `jwt_secret`/`smtp_password` **já haviam sido removidos**; o secret morto `admin_password` (`./secrets/admin_password.txt`) foi **eliminado** e o admin bootstrap passou a ser injetado por env (`ADMIN_EMAIL`/`ADMIN_USERNAME`/`ADMIN_PASSWORD`, guard `${...:?}`), no mesmo padrão do `docker-compose.local.yml`. Validado: `docker compose config` = OK com as variáveis; sem elas, falha explicitamente. O README foi atualizado (sem mais `./secrets/*.txt`). A pasta `secrets/` fica obsoleta.

### DOP-05 — Caddyfile.prod usa `{$DOMAIN}`/`{$ACME_EMAIL}` mas o compose só injeta `*_FILE` 🟠 Médio — ✅ Resolvido (2026-08-07)

- **Onde:** `reverse-proxy/Caddyfile.prod` (`https://{$DOMAIN}`, `tls {$ACME_EMAIL}`), `docker-compose.prod.yml` caddy (`ACME_EMAIL_FILE`/`DOMAIN_FILE`, l.56-57, 65-66).
- **Evidência:** o serviço Caddy recebe `DOMAIN_FILE=/run/secrets/domain` e `ACME_EMAIL_FILE=/run/secrets/acme_email`, mas o Caddyfile usa as variáveis `DOMAIN`/`ACME_EMAIL` — **Caddy não expande a convenção `_FILE`**. Sem que `DOMAIN`/`ACME_EMAIL` sejam setadas por outro meio (env do host/`.env`), os placeholders resolvem vazio.
- **Impacto:** dependendo da forma de deploy, o vhost `https://` fica sem domínio ou o Caddy rejeita o config; TLS/ACME não configurados como documentado.
- **Resolução:** novo `reverse-proxy/entrypoint.sh` (via `ENTRYPOINT` no `reverse-proxy/Dockerfile`) lê `DOMAIN_FILE`/`ACME_EMAIL_FILE` e exporta `DOMAIN`/`ACME_EMAIL` antes de repassar o comando ao Caddy; o CMD padrão `caddy run ...` foi explicitado. Validado: `caddy validate` = "Valid configuration" e servidor emite TLS para o domínio resolvido (ACME falhou só por ser domínio `.test` de teste).

### DOP-06 — Tags `:latest` sem pinagem no monitoring e ClamAV 🟡 Baixo — ✅ Resolvido (2026-08-07)

- **Onde:** `docker-compose.monitoring.yml` (prometheus, grafana, loki, promtail, node-exporter — todos `:latest`), `docker-compose.yml:86` e `docker-compose.dev.yml` (`clamav/clamav:latest`).
- **Evidência:** nenhum digest/pin. Enquanto prod fixa `caddy:2.9-alpine`, o resto da stack usa `latest`.
- **Impacto:** builds não reprodutíveis; atualizações não planejadas quebram dashboards/alerts (Grafana/Prometheus) ou mudam comportamento do scanner (INF-01 reincidente).
- **Resolução:** `docker-compose.monitoring.yml` agora pina tags semver estáveis: `prom/prometheus:v3.13.2`, `grafana/grafana:13.1.3`, `grafana/loki:3.7.6`, `grafana/promtail:3.6.11`, `prom/node-exporter:v1.12.1`. Validado com `docker compose -f docker-compose.monitoring.yml config --quiet`. *(ClamAV removido do compose — item não se aplica mais a ele.)*

### DOP-07 — `.dockerignore` não exclui secrets e env — vazamento para o daemon 🟡 Baixo — ✅ Resolvido (2026-08-07, commit `5e9b987`)

- **Onde:** `.dockerignore` (backend/dist, backend/node_modules, backend/data, frontend/node_modules, frontend/.next, **/.git).
- **Evidência:** não há exclusão de `secrets/`, `.env*`, `scripts/secrets/`. Embora o `Dockerfile` só `COPY` caminhos específicos (frontend/, backend/, reverse-proxy/, scripts/docker/), o **contexto de build inteiro** é enviado ao daemon — em daemon remoto/compartilhado, `secrets/` (com `jwt_secret.txt`, `admin_password.txt`) e `.env.local` (com `ADMIN_PASSWORD`) trafegam e ficam nos caches do buildkit.
- **Impacto:** exposição de segredos na cadeia de build; facilmente evitável.
- **Resolução:** `.dockerignore` passou a excluir `**/secrets/`, `**/.env*`, `**/.env.local`, `**/.env.*`, `**/data/`, `**/scripts/secrets/` e `**/*.log`; validado com build de contexto real.

### DOP-08 — Healthchecks `/api/health` cruzam com PERF-07 (leitura da tabela `Config`) 🟡 Baixo — ✅ Resolvido (2026-08-07)

- **Onde:** `Dockerfile:120-121` (30s), `docker-compose.yml:13-18` (30s), `docker-compose.prod.yml` backend (10s) e Caddy `caddy validate`.
- **Evidência:** `/api/health` (`app.controller.ts`) executa `findMany` na tabela `Config` (PERF-07/Fase 6). Em prod o backend é sondado a cada 10s; somando múltiplos réplicas/orquestradores, é carga de DB recorrente num endpoint que deveria ser trivial.
- **Impacto:** acúmulo de I/O de banco em endpoint de saúde; sem impacto funcional isolado.
- **Resolução:** `app.controller.ts` passou a usar `prisma.$queryRaw\`SELECT 1\`` no lugar de `config.findMany()` — probe barato (1 row), padrão de health check de banco (PERF-07). Validado: `tsc -p tsconfig.build.json` OK, lint sem erros novos, e2e `GET /api/health` → 200 permanece válido.

## 9.4 Fortalezas

- **Dockerfile multi-stage rigoroso:** 7 estágios com cache BuildKit (`--mount=type=cache`), purge dos build-deps de node-gyp (`apk del .build-deps`, `Dockerfile:30-33`) e remoção do **npm/npx + cache** da imagem final (l.87) — layers enxutas e auditáveis.
- **Non-root com UID/GID estável:** `controle-user:controle-group` 1002:1002 na imagem final e `appuser` 1001 no estágio backend; `create-user.sh` aplica `su-exec` e **chown automático dos volumes** por PUID/PGID.
- **HEALTHCHECK duplo** (no `Dockerfile` e por serviço no compose) + **resource limits** (`deploy.resources`) + **log rotation** (`json-file`, 10m×5) no prod.
- **Secrets externos no prod** (Swarm/Portainer), `secrets/` e `.env.local` gitignored, `ADMIN_PASSWORD` nunca hardcoded (guard `${ADMIN_PASSWORD:?}` no local).
- **Entrypoint self-healing:** copia imagens padrão para o volume (workaround do `cp -n` do busybox documentado, `entrypoint.sh:10-14`) e roda `prisma migrate deploy` + seed + `user.seed.ts` idempotentes.
- **Caddyfile com hardening real:** security headers (HSTS preload, CORP/COOP/COEP, Permissions-Policy), **rate limiting no edge** (zona `auth` 10/60s), health restrito a redes internas (INFRA-MED-01) e TLS 1.2/1.3 com ciphers restritos.
- **Persistência em RAID6 via bind mounts** (`/srv/controle-share-videos`) com ownership documentada; apenas caddy-data/config como named volumes.
- **Stack de observabilidade completa** (Prometheus + Grafana + Loki + Promtail + node-exporter) com `alerts.yml` (GAP-06) e TSDB em bind mount.
- **Scripts de provisão de host** (`hardening.sh` com SSH hardening, samba, grafana-secret) e backup (`scripts/backup.sh`).

## 9.5 Classificação

| Critério | Nota (0-100) | Justificativa |
|---|---|---|
| Higiene/segurança da imagem | **80** | Multi-stage, non-root, sem npm, purge, healthchecks — pouca margem |
| Correção do orquestramento | **85** | 2 defeitos prod-blocking (frontend target, ClamAV fantasma) — *ambos resolvidos em 2026-08-07 (DOP-01, DOP-02)* |
| Consistência compose | **50** | Base superseded diverge de prod (caddy, DATABASE_URL, secrets) |
| Segurança de deploy/secrets | **65** | `*_FILE` suportado p/ admin; mas Caddy `_FILE` não expandido e secrets mortos |
| Pinagem/supply-chain | **55** | `:latest` no monitoring/clamav; Caddy 2.8 vs 2.9 — *item ClamAV não se aplica mais (serviço removido)* |
| **Geral (média)** | **59** | Excelente imagem, orquestração com falhas críticas |

## 9.6 Recomendações (priorizadas)

1. ~~**Corrigir o serviço `frontend` (Alto, bloqueia prod)**~~ ✅ **Resolvido (2026-08-07, DOP-01):** base e prod usam `target: frontend-runner` + `command: ["sh","-c","cd /opt/app/frontend && PORT=3333 HOSTNAME=0.0.0.0 node server.js"]`; `Caddyfile.prod` roteia `frontend:3333`. Validado com `docker compose -f docker-compose.prod.yml config --quiet` = OK e `frontend-runner` respondendo HTTP 200 na porta 3333.
2. ~~**Resolver ClamAV de uma vez (Alto)**~~ ✅ **Concluído (2026-08-07):** a decisão formal (`docs/Padronizacao-07-clamav.md`) é de **rejeição** — o serviço foi **removido dos compose files** (base e dev). Não há mais controle fantasma; fecha SEC-02/QAL-02/INF-03/DOP-02.
3. ~~**Alinhar `DATABASE_URL` do compose base ao volume**~~ ✅ **Resolvido (commit `272e204`)**: usa `file:/opt/app/backend/data/controle-videos.db` (DOP-03).
4. ~~**Deprecar o compose base ou consolidá-lo**~~ ✅ **Resolvido (2026-08-07)** (DOP-04): o base foi **consolidado** — Caddy 2.9 custom, `frontend-runner`, `DATABASE_URL` no volume; secrets mortos (`jwt_secret`, `smtp_password`, `admin_password`) removidos; admin bootstrap por env; sem mais dependência de `./secrets/*.txt`.
5. ~~**Corrigir a resolução de domínio/ACME do Caddy**~~ ✅ **Resolvido (2026-08-07)** (DOP-05): entrypoint do Caddy expande `DOMAIN_FILE`/`ACME_EMAIL_FILE` → `DOMAIN`/`ACME_EMAIL` antes de iniciar; validado "Valid configuration" e TLS para o domínio resolvido.
6. ~~**Pinar imagens** do monitoring (DOP-06)~~ ✅ **Resolvido (2026-08-07):** `docker-compose.monitoring.yml` pina `prom/prometheus:v3.13.2`, `grafana/grafana:13.1.3`, `grafana/loki:3.7.6`, `grafana/promtail:3.6.11`, `prom/node-exporter:v1.12.1`. *(ClamAV removido do compose; item já não se aplica a ele.)*
7. ~~**Ampliar `.dockerignore`:** adicionar `secrets/`, `.env*`, `scripts/secrets/`, `data/`, `*.log` (DOP-07)~~ ✅ **Resolvido (2026-08-07, commit `5e9b987`):** `.dockerignore` exclui `**/secrets/`, `**/.env*`, `**/.env.local`, `**/.env.*`, `**/data/`, `**/scripts/secrets/` e `**/*.log` do contexto de build; validado com build de contexto real.
8. ~~**Healthcheck leve** (DOP-08)~~ ✅ **Resolvido (2026-08-07):** `/api/health` usa `$queryRaw\`SELECT 1\`` no lugar de `config.findMany()` (PERF-07).

## 9.7 Notas de Execução

- Evidências de 2026-08-04: leitura integral do `Dockerfile` (7 estágios), dos 5 compose files, dos `Caddyfile*`, `entrypoint.sh`/`create-user.sh`, `.dockerignore`, `.env.local.example`; cruzamento dos `target:` dos serviços com os CMDs/ENTRYPOINTs definidos no Dockerfile; verificação de consumo de secrets (`*_FILE`) via `grep` em `backend/src`, `backend/prisma/seed` e `scripts`.
- **Referências cruzadas:** DOP-02 ↔ SEC-02 (F5), QAL-02 (F7), INF-03 (F8) — mesma raiz `clamscan`; DOP-05 ↔ INF-02 (F8, pinagem Node); DOP-08 ↔ PERF-07 (F6); DOP-06 ↔ INF-01 (F8). `Caddyfile.prod` consolida itens já auditados na Fase 5 (SEC — rate limiting/edge, headers).
- **Próxima etapa:** Fase 10 — Auditoria de Testes/QA (plano de cobertura para os fluxos críticos, integração do Newman/CI, critérios de aceite).
