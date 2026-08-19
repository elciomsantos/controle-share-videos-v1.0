# Manual de Operação — Controle Share Videos

Este documento reúne os comandos principais para desenvolvimento, teste de hardening, produção e manutenção Docker.

---

## 1. Visão Rápida dos Docker Compose

| Arquivo | Finalidade | TLS | Hardening |
|---------|------------|-----|-----------|
| `docker-compose.local.yml` | **Desenvolvimento local** (padrão) | ❌ HTTP :3000 | ❌ Básico |
| `docker-compose.staging.yml` | **Overlay hardening** (sobe em cima do local) | ❌ HTTP :3000 | ✅ Completo |
| `docker-compose.yml` | **Produção** (domínio real + Let's Encrypt) | ✅ HTTPS :443 | ✅ Completo |
| `docker-compose.prod.yml` | **Produção Swarm/RAID6** (secrets externos, bind mounts `/srv`) | ✅ HTTPS :443 | ✅ Completo |
| `docker-compose.monitoring.yml` | **Observabilidade** (Prometheus, Grafana, Loki, Promtail, node-exporter) | — | — |

---

## 2. Desenvolvimento Local (sem hardening)

### Pré-requisitos
```bash
# 1. Copiar e editar variáveis
cp .env.local.example .env.local
# Editar .env.local:
#   ADMIN_PASSWORD=<openssl rand -base64 32>
#   JWT_SECRET=<openssl rand -base64 32>
#   ADMIN_EMAIL=admin@empresa.local (opcional)
#   ADMIN_USERNAME=admin (opcional)
```

### Subir ambiente
```bash
docker compose --env-file .env.local -f docker-compose.local.yml up -d --build
```

### Acessar
- **Frontend + API unificada:** http://localhost:3000
- **Backend direto (Swagger):** http://localhost:8080/api/swagger (se `SWAGGER_ENABLED=true`)
- **Frontend direto:** http://localhost:3333

### Parar e limpar
```bash
docker compose --env-file .env.local -f docker-compose.local.yml down
# Para apagar banco de dados (reset total):
docker compose --env-file .env.local -f docker-compose.local.yml down -v
```

---

## 3. Testar Hardening Localmente (valida config de produção)

O `docker-compose.staging.yml` é um **overlay** — sobe **em cima** do `docker-compose.local.yml`, aplicando:
- `read_only: true` + `tmpfs` nos 3 serviços
- `cap_drop: ALL` (+ `NET_BIND_SERVICE` no Caddy)
- `security_opt: [no-new-privileges:true, seccomp=./docker/seccomp/default.json]`
- `pids_limit: 512` + limites de CPU/memória (`deploy.resources`)
- `logging: json-file` com rotação (10m × 5)
- Rede `internal: true` (sem internet nos containers)

### Subir com hardening
```bash
docker compose --env-file .env.local \
  -f docker-compose.local.yml \
  -f docker-compose.staging.yml \
  up -d --build
```

### Acessar
- **Frontend + API unificada:** http://localhost:3000

### Validar hardening aplicado
```bash
# Verificar read_only, capabilities, seccomp, pids_limit
docker inspect controle-videos-local-backend | grep -A5 '"ReadOnly\|CapDrop\|CapAdd\|SecurityOpt\|PidsLimit"'

# Verificar se rede é internal
docker network inspect controle-videos-local | grep -A2 '"Internal"'

# Verificar logs com rotação
docker logs controle-videos-local-backend 2>&1 | head -5
```

### Parar
```bash
docker compose --env-file .env.local \
  -f docker-compose.local.yml \
  -f docker-compose.staging.yml \
  down
```

---

## 4. Produção (domínio real + Let's Encrypt)

### Variáveis obrigatórias
```bash
export DOMAIN=seu-dominio.com
export ACME_EMAIL=voce@email.com
export ADMIN_EMAIL=admin@email.com
export ADMIN_PASSWORD=$(openssl rand -base64 32)
export JWT_SECRET=$(openssl rand -base64 32)
# Opcionais:
export CORS_ORIGIN=https://${DOMAIN}
export API_URL=https://${DOMAIN}/api
```

### Subir
```bash
docker compose up -d --build
```

### Acessar
- **HTTPS:** https://${DOMAIN}
- **Healthcheck:** https://${DOMAIN}/api/health

### Modo acesso por IP (sem domínio / homologação)
```bash
export CADDYFILE=ip
export ADMIN_EMAIL=admin@empresa.local
export ADMIN_PASSWORD=$(openssl rand -base64 32)
export JWT_SECRET=$(openssl rand -base64 32)
export CORS_ORIGIN=http://192.168.1.50
export API_URL=http://192.168.1.50/api
docker compose up -d --build
# Acessar: http://192.168.1.50:3000 (ou porta 80 se Caddyfile.ip usa :80)
```

Ver guia completo em `docs/operacional/DEPLOY.md` e `docs/PLANO-DOMINIO.md`.

---

## 5. Produção com Docker Swarm / RAID6 (`/srv`)

Usa `docker-compose.prod.yml` com:
- **Secrets externos** (Docker Swarm): `domain`, `acme_email`, `admin_email`, `admin_username`, `admin_password`, `smtp_password`
- **Bind mounts** para `/srv/controle-share-videos/data` (RAID6)
- **UID/GID 1002:1002** consistente host↔container

Ver `docs/PLANO-IMPLANTACAO.md` e `docs/operacional/DEPLOY.md` §7–10.

---

## 6. Monitoramento (Opcional)

```bash
# Sobe stack de observabilidade junto com a app
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# Acessos (rede interna, configurar proxy ou SSH tunnel):
# Grafana:      http://localhost:3001  (admin / senha em scripts/secrets/grafana_admin_password)
# Prometheus:   http://localhost:9090
# Loki:         http://localhost:3100
```

Ver `docs/operacional/MONITORAMENTO.md`.

---

## 7. Comandos de Inspeção e Debug

```bash
# Status dos containers da stack local
docker compose --env-file .env.local -f docker-compose.local.yml ps

# Status com staging (hardening)
docker compose --env-file .env.local -f docker-compose.local.yml -f docker-compose.staging.yml ps

# Logs em tempo real
docker compose --env-file .env.local -f docker-compose.local.yml logs -f backend
docker compose --env-file .env.local -f docker-compose.local.yml logs -f frontend
docker compose --env-file .env.local -f docker-compose.local.yml logs -f caddy

# Healthcheck status
docker ps --filter name=controle-videos --format "{{.Names}}: {{.Status}}"

# Entrar no container (debug)
docker exec -it controle-videos-local-backend sh
docker exec -it controle-videos-local-frontend sh
docker exec -it controle-videos-local-caddy sh

# Verificar variáveis de ambiente ativas
docker exec controle-videos-local-backend env | grep -E 'JWT_SECRET|DATABASE_URL|ADMIN_'
```

---

## 8. Limpeza e Recuperação de Espaço Docker

> **Atenção:** Muitos comandos removem dados permanentemente. Certifique-se de que não há contêineres, imagens ou volumes importantes antes de executá-los.

### Verificar uso de espaço
```bash
docker system df
```

### Limpeza seletiva (segura)
```bash
# Remover containers parados
docker container prune -f

# Remover imagens não referenciadas (dangling)
docker image prune -f

# Remover todas as imagens não usadas por containers
docker image prune -a -f

# Remover volumes não usados
docker volume prune -f

# Remover redes não usadas
docker network prune -f

# Limpar cache de build
docker builder prune -a -f
```

### Limpeza completa (apaga tudo não usado)
```bash
docker system prune -a --volumes -f
```

### Limpeza específica do projeto
```bash
# Parar e remover containers, redes, volumes do projeto local
docker compose --env-file .env.local -f docker-compose.local.yml down -v --remove-orphans

# Parar e remover projeto com staging
docker compose --env-file .env.local -f docker-compose.local.yml -f docker-compose.staging.yml down -v --remove-orphans

# Produção
docker compose down -v --remove-orphans
```

---

## 9. Backup e Restore (Produção)

```bash
# Backup manual (executa scripts/backup.sh no host)
sudo /opt/controle-share-videos-v1.0/scripts/backup.sh

# Restore test (valida backup em DB temporário)
sudo /opt/controle-share-videos-v1.0/scripts/restore-test.sh

# Ver integridade do SQLite
sqlite3 /srv/controle-share-videos/data/controle-videos.db "PRAGMA integrity_check;"
```

Ver `docs/operacional/BACKUP_RESTORE.md`.

---

## 10. Atualização do Sistema (Produção)

```bash
cd /opt/controle-share-videos-v1.0

# 1. Backup antes de atualizar
sudo ./scripts/backup.sh

# 2. Pull + rebuild
git pull --ff-only origin main
docker compose up -d --build

# 3. Verificar saúde
docker ps --filter name=controle-share-videos --format "{{.Names}}: {{.Status}}"
docker exec controle-share-videos-backend curl -fs http://127.0.0.1:8080/api/health
```

> **Rollback:** `git checkout <tag-anterior> && docker compose up -d --build`
> Ver `docs/operacional/RUNBOOKS.md`.

---

## 11. Resumo de Comandos por Objetivo

| Objetivo | Comando |
|----------|---------|
| **Dev rápido (HTTP)** | `docker compose --env-file .env.local -f docker-compose.local.yml up -d --build` |
| **Testar hardening (HTTP)** | `docker compose --env-file .env.local -f docker-compose.local.yml -f docker-compose.staging.yml up -d --build` |
| **Produção (HTTPS + domínio)** | `DOMAIN=... ACME_EMAIL=... ADMIN_PASSWORD=... JWT_SECRET=... docker compose up -d --build` |
| **Produção IP (HTTP)** | `CADDYFILE=ip ADMIN_PASSWORD=... JWT_SECRET=... docker compose up -d --build` |
| **Produção Swarm/RAID6** | `docker compose -f docker-compose.prod.yml up -d` |
| **Monitoramento** | `docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d` |
| **Parar dev** | `docker compose --env-file .env.local -f docker-compose.local.yml down` |
| **Parar dev + staging** | `docker compose --env-file .env.local -f docker-compose.local.yml -f docker-compose.staging.yml down` |
| **Parar produção** | `docker compose down` |
| **Reset total dev (apaga DB)** | `docker compose --env-file .env.local -f docker-compose.local.yml down -v` |
| **Logs backend** | `docker compose --env-file .env.local -f docker-compose.local.yml logs -f backend` |
| **Validar hardening** | `docker inspect controle-videos-local-backend \| grep -A5 '"ReadOnly\|CapDrop\|SecurityOpt\|PidsLimit"'` |
| **Ver espaço Docker** | `docker system df` |
| **Limpeza segura** | `docker system prune -f` |
| **Limpeza completa** | `docker system prune -a --volumes -f` |

---

## 12. Boas Práticas

- Execute `docker system df` antes e depois da limpeza para verificar espaço recuperado
- Utilize `docker system prune -a --volumes -f` periodicamente em ambientes de desenvolvimento
- **Não remova volumes** se eles contiverem bancos de dados ou arquivos importantes
- Antes de apagar imagens, confirme se elas não serão reutilizadas por projetos ativos
- Faça backup de dados importantes antes de realizar limpezas completas
- Em produção, **sempre faça backup antes de atualizar** (`scripts/backup.sh`)
- Valide o hardening no staging **antes** de promover para produção