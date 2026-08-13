# DEPLOY — Controle Share Videos

> Guia de implantação em produção. Coberto por `docs/auditoria/AUDIT_REPORT.md` (nota 7.5/10).
> Versão do documento: 1.0 · Atualizado em 2026-08-12

---

## 1. Pré-requisitos

| Item | Obrigatório | Observação |
|---|---|---|
| Docker Engine ≥ 24 | ✅ | `docker --version` |
| Docker Compose v2 | ✅ | `docker compose version` |
| Portas 80 e 443 livres no host | ✅ | Caddy escuta ambas |
| Domínio apontando (DNS A/AAAA) para o host | ✅ | Necessário para TLS Let's Encrypt |
| E-mail válido para Let's Encrypt | ✅ | `ACME_EMAIL` |
| `openssl` (gerar segredos) | ✅ | Gera `JWT_SECRET` e `ADMIN_PASSWORD` |
| 2 GB RAM, 2 vCPU, 20 GB disco | Mínimo | Produção pequena; ver §8 sobre escala |

Verifique o ambiente:

```bash
docker --version && docker compose version
ss -ltnp 'sport = :80 or sport = :443'   # deve virar vazio
```

> **Não há** requisito de Node.js, npm, Prisma ou SQLite CLI no host — tudo
> roda dentro dos containers. Instalar essas ferramentas no host é opcional,
> apenas para desenvolvimento.

---

## 2. Variantes de deploy

| Arquivo | Quando usar | Secrets | Dados persistentes |
|---|---|---|---|
| `docker-compose.yml` | Produção padrão (TLS Let's Encrypt) | variáveis de ambiente (`.env`) | volumes nomeados |
| `docker-compose.prod.yml` | Produção com Docker Swarm/secrets externos | Docker secrets (arquivo) | bind mounts em `/srv/...` (RAID6) |
| `docker-compose.local.yml` | Teste local (HTTP, sem TLS) | `.env.local` | volume nomeado (backend-data) |
| `docker-compose.monitoring.yml` | Stack de observabilidade (prometheus, grafana, loki, promtail) | — | — |

> Detalhes de cada variante em `README.md` → "Docker Compose (variantes)".

### 2.1 Selecionar o Caddyfile (`CADDYFILE`)

O serviço `caddy` do compose monta o arquivo `Caddyfile.${CADDYFILE:-prod}`
em `/etc/caddy/Caddyfile`. Assim, sem editar o compose, você escolhe o modo:

| `CADDYFILE` | Arquivo | Uso | Porta |
|---|---|---|---|
| `prod` (default) | `Caddyfile.prod` | TLS Let's Encrypt (domínio No-IP ou próprio) | 80/443 |
| `ip` | `Caddyfile.ip` | Acesso por IP — HTTP (`:80`) ou `tls internal` (`:443`) | 80/443 |
| `local` | `Caddyfile.local` | Homologação/LAN sem TLS | 3000 |

Exemplos:

```bash
# Produção com domínio (default; ou exporte CADDYFILE=prod)
docker compose up -d --build

# Acesso por IP (HTTP, sem certificado)
CADDYFILE=ip docker compose up -d --build

# Homologação local
CADDYFILE=local docker compose up -d --build
```

> No modo `ip` e `local` os secrets/variáveis `DOMAIN`/`ACME_EMAIL` não são
> usados pelo Caddyfile — podem ficar vazios (apenas avisos no boot).

---

## 3. Variáveis de ambiente

### 3.1 Obrigatórias (produção — `docker-compose.yml`)

| Variável | Descrição | Como gerar |
|---|---|---|
| `DOMAIN` | Domínio público (ex: `controle.prefeitura.gov.br`) | DNS |
| `ACME_EMAIL` | E-mail do responsável para Let's Encrypt | — |
| `ADMIN_EMAIL` | Login do admin bootstrap (ex: `admin@empresa.local`) | — |
| `ADMIN_PASSWORD` | Senha inicial do admin (será forçada a trocar no 1º login) | `openssl rand -base64 32` |
| `JWT_SECRET` | Segredo de assinatura JWT compartilhado com o frontend (middleware) | `openssl rand -base64 32` |

> ⚠️ **Atenção ao `JWT_SECRET`**: se for alterado após o sistema em produção,
> **todas as sessões ativas serão invalidadas** (esperado após rotação de
> segredo). Programe a rotação em janela de manutenção.

### 3.2 Opcionais (com defaults)

| Variável | Default | Descrição |
|---|---|---|
| `ADMIN_USERNAME` | `admin` | Username do admin bootstrap |
| `BACKEND_PORT` | `8080` | Porta interna do backend |
| `PORT` | `3333` | Porta interna do frontend (Next.js) |
| `CORS_ORIGIN` | `https://${DOMAIN}` | Origem permitida (modo produção) |
| `TRUST_PROXY` | `true` (compose) | Confiar em `X-Forwarded-*` do Caddy |
| `NODE_ENV` | `production` | Ambiente |
| `SWAGGER_ENABLED` | `true` (dev) | Swagger em `/api/swagger` (ver §7) |

### 3.3 Modo de passar variáveis

- **Com `.env`** (recomendado para `docker-compose.yml`):
  ```bash
  cat > .env <<'EOF'
  DOMAIN=controle.example.gov.br
  ACME_EMAIL=sre@example.gov.br
  ADMIN_EMAIL=admin@empresa.local
  ADMIN_PASSWORD=<cole a saída de: openssl rand -base64 32>
  JWT_SECRET=<cole a saída de: openssl rand -base64 32>
  EOF
  chmod 600 .env
  ```
  Em seguida `docker compose up -d --build` (o compose lê `.env` automaticamente).

- **Na linha de comando** (uma única vez):
  ```bash
  DOMAIN=controle.example.gov.br ACME_EMAIL=sre@example.gov.br \
  ADMIN_EMAIL=admin@empresa.local ADMIN_PASSWORD=$(openssl rand -base64 32) \
  JWT_SECRET=$(openssl rand -base64 32) \
  docker compose up -d --build
  ```

---

## 4. Docker Secrets (produção com `docker-compose.prod.yml`)

A variante Swarm usa **arquivos de secret** lidos via `*_FILE`. As secrets
devem ser criadas **externamente** antes do `compose up`:

```bash
docker swarm init   # se ainda não estiver em swarm mode
echo "controle.example.gov.br"        | docker secret create domain -
echo "sre@example.gov.br"             | docker secret create acme_email -
echo "admin@empresa.local"            | docker secret create admin_email -
echo "admin"                          | docker secret create admin_username -
openssl rand -base64 32              | docker secret create admin_password -
openssl rand -base64 32              | docker secret create jwt_secret -
# SMTP opcional:
echo "smtp-password"                  | docker secret create smtp_password -
```

Os containers leem:
- `ADMIN_EMAIL_FILE=/run/secrets/admin_email`
- `ADMIN_USERNAME_FILE=/run/secrets/admin_username`
- `ADMIN_PASSWORD_FILE=/run/secrets/admin_password`
- `JWT_SECRET_FILE=/run/secrets/jwt_secret` (frontend)
- `ACME_EMAIL_FILE=/run/secrets/acme_email` (caddy)
- `DOMAIN_FILE=/run/secrets/domain` (caddy)

> O segredo JWT **também** fica persistido no banco SQLite pela `config.seed.ts`
> (entrada `internal.jwtSecret`, `locked=true`). A secret Docker é a fonte
> autoritativa para o frontend; a do banco é usada pelo backend para assinar.

---

## 5. Passo a passo — Produção padrão (`docker-compose.yml`)

```bash
# 1. Clonar o repositório no host
git clone https://github.com/elciomsantos/controle-share-videos-v1.0.git
cd controle-share-videos-v1.0

# 2. Criar o .env (ver §3.3) e proteger as permissões
chmod 600 .env

# 3. Subir a stack (build das images na primeira vez; ~3-5 min)
docker compose up -d --build

# 4. Acompanhar a subida
docker compose logs -f backend frontend caddy
# Saia com Ctrl+C (apenas acompanha; containers continuam rodando)
```

### 5.1 Verificar saúde

```bash
# Backend (porta 8080 interna → via Caddy faça https://<DOMAIN>/api/health)
docker exec controle-share-videos-backend curl -fs http://127.0.0.1:8080/api/health
# Esperado: OK

# Frontend (porta 3333 interna)
docker exec controle-share-videos-frontend curl -fs http://127.0.0.1:3333
# Esperado: HTML 200

# Caddy (validar config)
docker exec controle-share-videos-caddy caddy validate --config /etc/caddy/Caddyfile
```

Se todos os três responderem, acesse `https://<DOMAIN>` e faça login com
`ADMIN_EMAIL` / `ADMIN_PASSWORD`. No **primeiro login** será pedida a troca
de senha (regra `passwordMustChange`).

### 5.2 Primeiros passos pós-deploy

1. **Trocar a senha do admin** (obrigatório no primeiro login).
2. Revisar `Administração → Configurações` e ajustar: `general.appName`,
   `general.appUrl`, `share.maxExpiration`, `share.defaultExpiration`.
3. Criar usuários dos papéis `operador` / `auditor` conforme a equipe.
4. (Opcional) Configurar SMTP em `Administração → Configurações → smtp`.

---

## 6. Caddyfile de produção

O `reverse-proxy/Caddyfile.prod` já vem com:

- **TLS** automático via Let's Encrypt (`tls {$ACME_EMAIL}`), TLS 1.2/1.3,
  cifras fortes (AES-256-GCM / ChaCha20-Poly1305).
- **HSTS** com preload (2 anos), `X-Frame-Options: DENY`, `X-Content-Type-Options:
  nosniff`, `Referrer-Policy`, cross-origin isolation, `Permissions-Policy`.
- **CSP** estrita (H-01 / S-05): `default-src 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline' ...` — ver comentário no arquivo.
- **Rate limit** no edge: `100 req / 10s` por IP (zona `dynamic`) e
  `10 req / 60s` para endpoints de auth (zona `auth`).
- **Health check** interno `/api/health` restrito a redes internas
  (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`).
- **Logs** JSON com filtro `replace pwd REDACTED` (SEC-05: mascara senha
  em query string quando `share.includePasswordInShareLink=true`).

### 6.1 Como adaptar o domínio

O domínio entra pela variável `DOMAIN` (lida via `{$DOMAIN}` no Caddyfile).
Não edite o Caddyfile — apenas ajuste `.env`:

```bash
# .env
DOMAIN=novo.dominio.gov.br
ACME_EMAIL=novo@email.gov.br
```
```bash
docker compose up -d   # Caddy re-emitirá certificado para o novo domínio
```

> Em homologação sem TLS, use `reverse-proxy/Caddyfile.local` (porta 3000,
> sem HTTPS, sem rate limit) — basta `CADDYFILE=local`. Em proxy reverso atrás
> de outro TLS terminator (ex: Cloudflare, nginx externo), use
> `reverse-proxy/Caddyfile.trust-proxy`.

### 6.2 Acesso por IP (sem domínio)

> ⚠️ **Let's Encrypt não emite certificado para IP nu** — o `Caddyfile.prod`
> (`https://{$DOMAIN}` + `tls {$ACME_EMAIL}`) falha se `DOMAIN` for um IP.
> Use `CADDYFILE=ip` (arquivo `reverse-proxy/Caddyfile.ip`), que traz duas
> variantes:

- **C1 — HTTP puro (`:80`)** — padrão do arquivo. Para uso externo/LAN sem
  certificado. `general.appUrl = http://<ip-publico>`.
- **C2 — TLS autoassinado (`:443`, `tls internal`)** — bloco comentado no
  arquivo; descomente para HTTPS por IP (navegador exibirá aviso de
  certificado não confiável).

**Configuração para o modo IP (`docker-compose.yml`):**

```bash
cat > .env <<'EOF'
CADDYFILE=ip
ADMIN_EMAIL=admin@empresa.local
ADMIN_PASSWORD=<openssl rand -base64 32>
JWT_SECRET=<openssl rand -base64 32>
# Substitua pelo IP público fixo (ou IP da LAN, se for uso interno):
CORS_ORIGIN=http://192.168.1.50
API_URL=http://192.168.1.50/api
EOF
docker compose up -d --build
```

Depois defina `general.appUrl = http://192.168.1.50` (Administração →
Configurações → Geral), para links de share/email usarem a URL correta.

> Sem criptografia em trânsito (C1) — **não usar em produção com dados
> sensíveis**. Para exposição pública real, prefira um domínio (modos 6.1
> No-IP ou domínio próprio).

### 6.3 Acesso por IP via WSL2 (Windows + Docker no WSL2)

Ambiente de **teste/desenvolvimento** em que o Docker roda nativo dentro do
WSL2 (modo NAT) e o Windows expõe as portas na LAN via `netsh portproxy`.

**Topologia:** `Windows IP da LAN (ex: 192.168.0.200)` → portproxy →
`IP do WSL2 (172.30.x.y, muda a cada boot)` → `container Caddy :3000`.

> O IP do WSL2 **muda a cada reinício** do WSL — por isso os scripts usam
> `wsl.exe hostname -I` para descobrir o IP atual dinamicamente (não
> hardcodam o IP).

**Scripts utilitários (`scripts/wsl2/`):**

| Script | Função |
|---|---|
| `apply-portproxy.ps1` | Descobre o IP do WSL2, cria portproxy `0.0.0.0:3000/3333/8090 → <IP-WSL2>`, garante regras de firewall inbound e testa. **Rode como Administrador.** |
| `clear-portproxy.ps1` | Remove as regras portproxy (limpeza). |
| `fix-wsl-restart.ps1` | One-shot pós-reboot: `wsl --shutdown` → boot da distro → inicia Docker → `compose up -d` → chama `apply-portproxy.ps1`. **Rode como Administrador.** |

**Como usar (PowerShell como Administrador):**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\wsl2\apply-portproxy.ps1
# ou, para reinício completo (computador reiniciou / IP do WSL2 mudou):
powershell -ExecutionPolicy Bypass -File scripts\wsl2\fix-wsl-restart.ps1
```

Se a máquina não usa os defaults (distro Debian, usuário `urubu`, caminho
`/home/urubu/projects/controle-share-videos-v1.0`), passe os parâmetros:

```powershell
.\scripts\wsl2\fix-wsl-restart.ps1 -Distro Ubuntu -User nome \
  -ProjectPath /home/nome/projects/controle-share-videos-v1.0
```

**Passo a passo (primeira vez):**

1. Suba a stack no WSL2: `docker compose -f docker-compose.local.yml --env-file .env.local up -d --build`
2. No Windows, rode `apply-portproxy.ps1` como Administrador.
3. Teste pelo Windows: `http://localhost:3000` e por outro PC da LAN: `http://<IP-da-LAN-do-Windows>:3000`.
4. Defina `general.appUrl = http://<IP-da-LAN-do-Windows>:3000` (Administração → Configurações → Geral), para links de share/email usarem a URL correta (usado em `docker-compose.local.yml`).

> **Portas mapeadas:** 3000 (Caddy → app), 3333 (frontend interno),
> 8090 (backend interno) — as duas últimas são utilitárias (debug).

> **Troubleshooting:** se `localhost:3000` responde mas `http://<IP-LAN>:3000`
> dá timeout e os containers estão `healthy`, verifique o **iptables do Docker
> no WSL2**: a rede bridge pode ter perdido as regras `FORWARD ACCEPT` (política
> `DROP`). Recrie a rede: `docker compose -f docker-compose.local.yml down && up -d`
> (volumes nomeados preservam os dados). Sintoma: containers saudáveis entre si
> não se comunicam, mas host→container funciona.

---

## 7. Swagger (apenas em desenvolvimento)

O backend expõe Swagger em **`/api/swagger`** quando `SWAGGER_ENABLED=true`.
**Em produção deixe desativado** (`SWAGGER_ENABLED=false` ou indefinido) —
expor a documentação de API interna aumenta a superfície de ataque.

No `docker-compose.local.yml` o Swagger vem habilitado (dev); no `docker-compose.yml`
e `docker-compose.prod.yml` ele vem desligado por padrão.

---

## 8. Escala e limites

Os recursos por container estão definidos no compose:

| Serviço | Limite | Reserva |
|---|---|---|
| backend | 2 GB / 1.0 vCPU (prod.yml: 2 vCPU) | 512 MB / 0.5 vCPU |
| frontend | 512 MB / 0.5 vCPU | 128 MB / 0.1 vCPU |
| caddy | 256 MB / 0.25 vCPU | 64 MB / 0.05 vCPU |

**Quando considerar escala (roadmap v1.3):**
- > 500 usuários simultâneos → avaliar migração SQLite → PostgreSQL
  (estimativa 2-3 semanas; ver `docs/auditoria/ROADMAP.md` seção 3).
- Cache de configurações/permissões → subir Redis e setar `cache.redis-enabled=true`
  + `cache.redis-url` (backend já tem `@keyv/redis` + fallback in-memory).
- Volume de uploads > 100 GB → avaliar storage S3/MinIO (v1.4, `S3UploadRepository`).

### 8.1 Limites de runtime conhecidos

| Limite | Valor | Onde ajustar |
|---|---|---|
| Tamanho máximo por share | 50 GB (default 1 GB) | `share.maxSize` (config UI) |
| Tamanho máximo por arquivo | default config | `share.maxFileSize` |
| Tamanho do chunk de upload | 10 MB | `share.chunkSize` |
| Limite de rate (edge) | 100 req/10s/IP | `Caddyfile.prod` zona `dynamic` |
| Limite de rate (auth) | 10 req/60s/IP | `Caddyfile.prod` zona `auth` |
| Tamanho de body do Caddy | ilimitado (stream) | — |

---

## 9. Upgrade de versão

```bash
# 1. Backup antes do upgrade (ver docs/operacional/BACKUP_RESTORE.md)
docker run --rm -v controle-share-videos-backend-data:/data:ro \
  -v "$PWD/backup:/backup" alpine tar czf /backup/db-$(date +%F).tgz -C /data .

# 2. Baixar a nova versão
git pull --ff-only origin main

# 3. Rebuild e subida (migrações rodam no boot do backend)
docker compose up -d --build

# 4. Acompanhar healthcheck
watch -n5 'docker ps --filter name=controle-share-videos --format "{{.Names}}: {{.Status}}"'
# Saia com Ctrl+C

# 5. Revalidar endpoints
docker exec controle-share-videos-backend curl -fs http://127.0.0.1:8080/api/health
```

Migrações do Prisma são aplicadas automaticamente no boot do backend
(`prisma migrate deploy` no `scripts/docker/entrypoint.sh`). Caso o schema
tenha mudado, o seed idempotente (`user.seed.ts`, `config.seed.ts`) atualiza
o admin e as configs sem sobrescrever dados de usuários/shares.

### 9.1 Rollback

Se a nova versão apresentar problema:

```bash
git checkout <commit-anterior>
docker compose up -d --build
# Se a migração do Prisma foi "para cima" e não tem down(), restaurar backup:
docker compose down
docker run --rm -v controle-share-videos-backend-data:/data \
  -v "$PWD/backup:/backup" alpine sh -c "rm -rf /data/* && tar xzf /backup/db-<data>.tgz -C /data"
docker compose up -d
```

> ⚠️ O rollback **restaura o banco**, descartando shares criados após o
> backup. Programe o upgrade em janela de baixo uso.

---

## 10. Reinício e parada

```bash
# Parar mantendo dados
docker compose down

# Parar e APAGAR volumes (atenção: apaga o banco SQLite)
docker compose down -v

# Reiniciar um serviço específico
docker compose restart backend

# Recriar sem rebuild (aplica mudanças no compose/Caddyfile)
docker compose up -d --force-recreate
```

---

## 11. Troubleshooting comum

| Sintoma | Causa provável | Ação |
|---|---|---|
| `ADMIN_PASSWORD is required` no boot | `.env` sem a variável | Criar `.env` (ver §3.3) |
| Caddy não emite certificado | DNS não aponta para o host | `dig +short <DOMAIN>` e corrigir DNS |
| 401 em massa após reinício | `JWT_SECRET` mudou | Revalidar `.env` e avisar usuários para logar de novo |
| Backend `unhealthy` | DB locked / disco cheio | `docker logs backend` + ver RUNBOOKS.md |
| Frontend `unhealthy` | porta 3333 não responde | `docker logs frontend` e ver healthcheck |
| `502 Bad Gateway` | backend reiniciando | `docker logs backend -f`, aguardar `start_period: 120s` |
| Swagger exposto em prod | `SWAGGER_ENABLED=true` | Remover/zerar a variável (ver §7) |

Mais cenários em `docs/operacional/RUNBOOKS.md`.

---

## 12. Referências

- `README.md` — visão geral e variantes do compose
- `docs/operacional/MONITORAMENTO.md` — healthchecks, logs, alertas
- `docs/operacional/BACKUP_RESTORE.md` — procedimentos de backup/restauração
- `docs/operacional/RUNBOOKS.md` — resposta a incidentes
- `docs/auditoria/SECURITY_REPORT.md` — hardening de segurança (nota 9.0/10)
- `docs/auditoria/ROADMAP.md` — escala (v1.2/v1.3) e backlog
- `reverse-proxy/Caddyfile.prod` — referência autoritativa do proxy
