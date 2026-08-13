# MONITORAMENTO — Controle Share Videos

> Healthchecks, logs e alertas do stack de produção.
> Versão do documento: 1.0 · Atualizado em 2026-08-12

---

## 1. Healthchecks

Cada serviço do `docker-compose.yml`/`docker-compose.prod.yml` já vem com
healthcheck declarado, então `docker ps` mostra o estado em `(healthy)`:
![ healthy / unhealthy / starting ].

| Serviço | Endpoint | Intervalo | Esperado |
|---|---|---|---|
| **backend** | `GET http://127.0.0.1:8080/api/health` | 30s (prod.yml: 10s) | `200 OK` |
| **frontend** | `GET http://127.0.0.1:3333` | 10s | `200` (HTML) |
| **caddy** | `caddy validate --config /etc/caddy/Caddyfile` | 30s | `valid configuration` |

### 1.1 O que o healthcheck do backend verifica

Implementado em `backend/src/app.controller.ts:10-20`:

1. Executa `SELECT 1` no SQLite via Prisma (`$queryRaw`).
2. Se funcionar → `200 OK`; se falhar → `500 ERROR` (DB indisponível).

> O healthcheck é **stateless** e não valida Redis, SMTP ou filesystem de
> uploads. Falhas nesses subsistemas aparecem nos logs (ver §2) e na UI de
> "Administração → Saude".

### 1.2 Como verificar manualmente

```bash
# Pelo host (via rede interna do compose)
docker exec controle-share-videos-backend  curl -fs http://127.0.0.1:8080/api/health
docker exec controle-share-videos-frontend curl -fs http://127.0.0.1:3333
docker exec controle-share-videos-caddy    caddy validate --config /etc/caddy/Caddyfile

# Pelo Caddy (HTTPS público) — restrito a redes internas por INFRA-MED-01
curl -sk https://<DOMAIN>/api/health        # somente de dentro do backend/caddy
```

### 1.3 Comando one-liner de status

```bash
watch -n5 'docker ps --filter name=controle-share-videos \
  --format "{{.Names}}: {{.Status}}"'
```

---

## 2. Logs

### 2.1 Backend (Nest.js Logger)

Por padrão o backend loga no stdout em texto legível. Em produção
(`docker-compose.prod.yml`) o driver é `json-file` com rotação:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "5"
```

Acompanhar em tempo real:

```bash
docker compose logs -f backend
docker logs -f controle-share-videos-backend
# Filtrar histórico por erro
docker logs controle-share-videos-backend 2>&1 | grep -iE "error|fail|exception"
```

### 2.2 Caddy (JSON com filtro de redação)

O `Caddyfile.prod` loga em JSON **mascarando a senha** em query string
(SEC-05: `replace pwd REDACTED` quando `share.includePasswordInShareLink=true`):

```bash
docker logs -f controle-share-videos-caddy
# Exemplo de linha (sem a senha):
# {"level":"info","request":{"uri":"/share/abc?pwd=REDACTED", ...}}
```

### 2.3 Frontend (Next.js)

```bash
docker logs -f controle-share-videos-frontend
```

### 2.4 O que procurar nos logs (sinais de problema)

| Padrão | Dimensão | Ação |
|---|---|---|
| `SQLITE_BUSY` / `database is locked` | DB contensão | RUNBOOKS §1 |
| `PrismaClientInitializationError` | DB indisponível | RUNBOOKS §1 |
| `UnhandledAsyncError` | Erro não capturado | RUNBOOKS §2 |
| `Complete share failed` / `removeShare error` | Upload/limpeza | RUNBOOKS §3 |
| `429` em massa no Caddy | Rate limit edge | Revisar `Caddyfile.prod` |
| `EACCES` / `EROFS` nos uploads | Permissão do volume | RUNBOOKS §4 |
| `JWTSECRET not configured` | Secret faltante | Revalidar `.env` `JWT_SECRET` |

### 2.5 Stack de observabilidade (opcional, backlog v1.2)

O `docker-compose.monitoring.yml` já existe com Prometheus, Grafana, Loki e
Promtail. Não é obrigatório para go-live; o roadmap **v1.2** cobre Integração
com Alertmanager e tracing OTel. Para subir:

```bash
docker compose -f docker-compose.monitoring.yml up -d
# Grafana em http://localhost:3001 (admin/admin)

# Subir o stack de produção + monitoramento:
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d --build
```

Dashboards e alertas recomendados estão no backlog de v1.2 (ver
`docs/auditoria/ROADMAP.md` seção 2).

---

## 3. Alertas recomendados

Mesmo sem o stack de observabilidade no ar, monitore estes sinais (script
simples + cron, ou Prometheus quando v1.2 estiver disponível):

| Alerta | Gatilho | Severidade | Runbook |
|---|---|---|---|
| Backend `unhealthy` | healthcheck `SELECT 1` falha | CRÍTICO | RUNBOOKS §1 |
| Frontend `unhealthy` | porta 3333 não responde | ALTO | RUNBOOKS §2 |
| SQLite lock contention | `SQLITE_BUSY` > 5/min | ALTO | RUNBOOKS §1 |
| Job de limpeza falhou | erro em `deleteExpiredShares` no log | MÉDIO | RUNBOOKS §3 |
| Disco > 80% | `df` no volume `/srv/...` | ALTO | RUNBOOKS §4 |
| Disco > 95% | `df` no volume `/srv/...` | CRÍTICO | RUNBOOKS §4 |
| Latência p95 > 500ms | métrica de API (ex: via Caddy logs) | MÉDIO | Avaliar Redis/migração |
| 429 excessivo | > 50 req/s rejeitadas no edge | MÉDIO | Ajustar `Caddyfile.prod` |
| Falha de emissão TLS | Caddy repetindo `obtain certificate` | ALTO | Verificar DNS/ACME_EMAIL |

### 3.1 Script mínimo de alerta (sem Prometheus)

Exemplo: alerta de disco e healthcheck via cron + webhook simples (substitua
o webhook pela sua ferramenta):

```bash
# /usr/local/bin/csv-health.sh  (chmod +x)
#!/usr/bin/env bash
set -euo pipefail
BK=$(docker exec controle-share-videos-backend  curl -fs http://127.0.0.1:8080/api/health 2>/dev/null || echo ERR)
FR=$(docker exec controle-share-videos-frontend curl -fs http://127.0.0.1:3333 2>/dev/null || echo ERR)
DISK=$(df -P /srv/controle-share-videos 2>/dev/null | awk 'NR==2{gsub(/%/,"",$5); print $5}')
[ "$BK" = "OK" ] && [ "$FR" != "ERR" ] || alert "Controle-Share: backend=$BK frontend=$FR"
[ "${DISK:-0}" -lt 80 ] || alert "Controle-Share: disco em ${DISK}%"
# agende com: */5 * * * * /usr/local/bin/csv-health.sh
```

---

## 4. Métricas-chave

| Métrica | Como obter | Meta |
|---|---|---|
| Disponibilidade backend | healthcheck 5m | > 99% |
| Disponibilidade frontend | healthcheck 5m | > 99% |
| Latência p95 `/api/*` | Caddy logs (Duration) | < 500 ms |
| Erro 5xx por 5 min | Caddy logs `status >= 500` | < 1% |
| Uploads completos / dia | `Share` por `createdAt` no DB | histórico |
| Downloads / dia | `DownloadLog` por `createdAt` | histórico |
| Uso de disco do volume | `df` / Prometheus node_exporter | < 80% |

> Os eventos de auditoria (`view`, `download`) ficam em `DownloadLog` e são
> visíveis em **Administração → Download logs** com filtros por período.

---

## 5. Referências

- `docs/operacional/DEPLOY.md` — healthchecks descritos no deploy (§5.1)
- `docs/operacional/RUNBOOKS.md` — resposta a incidentes mencionados acima
- `docs/auditoria/ROADMAP.md` seção 2 — backlog de observabilidade (v1.2)
- `backend/src/app.controller.ts:10` — implementação do `/api/health`
- `backend/src/jobs/jobs.service.ts` — cron jobs de limpeza
- `reverse-proxy/Caddyfile.prod` — logs com redação de senha (SEC-05)
