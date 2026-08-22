<div align="center">
  <img src="/frontend/public/img/images/logo-programer.png" alt="Logo" width="300">

  <h1>Sistema de controle e compartilhamento de vídeos</h1>

  <p align="center">

  **Controle Share Videos v2.7.0** — compartilhamento seguro de arquivos para uso interno restrito.

  </p>
</div>

# Controle Share Videos

Sistema de compartilhamento seguro de arquivos para uso interno restrito, em PT-BR. Fork independente do Pingvin Share X v1.21.1, adaptado para upload exclusivamente pelo dono autenticado e armazenamento apenas local (servidor Ubuntu).

> **Documentação:** ver `docs/VISAO-GERAL.md` (visão arquitetural),
> `docs/operacional/DEPLOY.md` (guia de implantação),
> `docs/auditoria/AUDIT_REPORT.md` (auditoria completa).
> Para implantar do zero em um servidor Linux, siga a seção
> **"Implantação em servidor Linux (passo a passo)"** abaixo.

---

## Status do Projeto

| Item | Status |
|------|--------|
| **Versão** | **2.7.0** |
| **Estado** | **Em Produção (Docker)** |
| **Auditoria** | ✅ Completa (nota 7.5/10, aprovado para produção) |
| **Segurança** | ✅ 9.0/10 (OWASP Top 10 coberto, hardening Docker aplicado) |
| **Hardening Docker** | ✅ 100% itens críticos/altos implementados |
| **Spec Segurança Sessões** | ✅ v1.2 — 17/17 correções aplicadas (7 fases) |
| **Lacunas de Segurança (Fases 1–4)** | ✅ 35/35 issues fechados (#1–#35) com evidência em commit/doc |
| **Pentest de links de compartilhamento** | ✅ Executado (`docs/auditoria/PENTEST-SHARE-LINK-2026-08-22.md`) — 1 achado HIGH corrigido (#40), 11 controles aprovados |
| **Testes** | ✅ Unit (backend 28 suites/286 testes) + E2E + Playwright + Security-E2E no CI |
| **CI/CD** | ✅ GitHub Actions (lint, build, test, audit, Security Gate, SLSA/cosign; deploy SSH opt-in via `DEPLOY_ENABLED`) |

---

## Funcionalidades

### Compartilhamento

- Compartilhamento via link com token UUID v4
- Tamanho de arquivo ilimitado (restrito apenas pelo espaço em disco)
- Data de expiração configurável por share
- Shares protegidos por senha + limite de visitantes e downloads
- **Limites de view/download enforced server-side em TODA via de acesso** (streaming, ZIP, certificado) — token é revogado efetivamente ao esgotar qualquer limite (#40)
- **Geração automática de senha forte** (comprimento configurável via `share.generatedPasswordLength`) exibida separadamente no modal de upload completado
- Limites por share: máximo de visualizações, máximo de downloads, expiração
- Página exclusiva de visualização por link (sem cabeçalho/rodapé do painel admin)
- Destinatários de e-mail (SMTP opcional)
- **Preview de vídeo com tarja de proteção persistente em tela cheia** — botão customizado coloca o wrapper (vídeo + tarja) em fullscreen (v1.2.3)

### Upload e armazenamento

- Upload apenas pelo dono autenticado (sem reverse shares — removido intencionalmente)
- Armazenamento **exclusivamente local** no servidor (sem buckets S3 — removido)
- Upload chunked multipart com progresso e retomada
- **Certificado de Autenticidade PDF automático** por arquivo ao concluir o share — contém hash SHA-256 (também em QR Code), metadados do arquivo/share/sistema e eventos; datas em horário de Brasília (UTC-3) independente do fuso do servidor (v1.2.4). Documentação em `docs/CERTIFICADO.md`

### Auditoria

- Log completo de views e downloads (IP, user-agent, timestamp, sucesso/falha)
- Dashboard admin em `/admin/download-logs` com filtros (shareId, usuário, evento, período, status) e paginação
- Eventos auditados: `view` (acesso via link) e `download` (arquivo único ou ZIP), incluindo tentativas com falha
- **Auditoria de eventos de segurança** (`AuditLog`): 17 eventos mínimos (login, MFA, sessões, senha, permissões, shares) — dashboard `/admin/audit-logs` (admin+auditor)

### Usuários e permissões (RBAC)

- Controle de acesso por papéis: `admin` / `operador` / `auditor`
- Apenas `admin` cria usuários via `POST /api/users` escolhendo o papel
- Senha temporária forte (12 chars) exibida uma única vez no modal, ou enviada por e-mail se SMTP habilitado
- **Troca obrigatória de senha no primeiro login** (`passwordMustChange` + Guard)
- Detecção de usuário duplicado com inline field error + debounce pre-validation (admin/signup)
- **MFA (TOTP)** opcional por usuário; **obrigatório para admins** (TotpAuthGuard)
- **Recovery codes** de uso único
- **Reautenticação recente** para operações críticas (troca de senha, e-mail, permissões, revogação)

### UX de erro

- **Inline field error** — credenciais inválidas no login, link em uso na criação do share
- **Modal bloqueante** — conta não ativada (com botão "Reenviar verificação"), rate-limit 429 com countdown lendo header `Retry-After`, falha de servidor/rede, `completeShare` 500 (Tentar novamente / Descartar), erro de rede em `isShareIdAvailable`
- **Toast persistente agrupado** — falha de chunks ("Falha ao enviar N. Toque para detalhes") com ID fixo, sem `cleanNotifications()` global
- Helper reutilizável `showBlockingErrorModal` em `frontend/src/components/core/`
- Lacunas i18n corrigidas (PT-BR em `common.error.unknown`, `verify.*`, `signin.*`, `upload.dropzone.description`, `share.notify.copy-*`)

### Segurança (implementado)

- **Sessões opacas server-side** (token 256-bit, apenas SHA-256 persistido, validação por requisição: revogado → expirado → usuário ativo → autorização)
- **Idle timeout 30min + expiração absoluta 8h** (atualização condicional de `last_activity_at`)
- **Refresh tokens** como hash com rotação + detecção de reuso (família revogada)
- **Share tokens** opacos com `token_hash` + `revoked_at`
- **Argon2id** para senhas (memoryCost=128MB, timeCost=4, parallelism=2)
- **JWT rotação híbrida** (kid + timeline, AES-256-GCM, mutex)
- **Rate limiting**: global (100 req/60s), login por conta+IP (5/60s), endpoints de share/admin com limites específicos, edge no Caddy (dynamic 100/10s, auth 10/60s)
- **CSP estrito** no Caddy (self-only, `unsafe-inline` apenas em style-src para Mantine)
- **Headers de segurança**: HSTS preload, X-Frame-Options DENY, X-Content-Type-Options nosniff, COOP/COEP/CORP, Permissions-Policy
- **Docker Hardening**: non-root (UID 1002), `cap_drop: ALL`, `no-new-privileges:true`, `read_only: true` + tmpfs, `pids_limit: 512`, rede `internal: true` para backend, seccomp custom (fail-closed 428 syscalls), imagem pinada por digest, Trivy no CI/CD
- **Docker Secrets** em todos os serviços (backend, frontend, caddy, grafana)
- **Caddy** com TLS automático (Let's Encrypt), filtro `pwd=` em query string/logs

### Segurança — Hardening Fases 1–4 (issues #1–#35)

- **Limites de share em todas as vias de acesso** (#40): `maxViews`/`maxDownloads` validados no `ShareSecurityGuard` a cada request público — streaming inline (Range), ZIP e certificado incluídos; token emitido antes do esgotamento é revogado efetivamente quando qualquer limite é atingido
- **Auditoria WORM tamper-evident** (#10): trilha append-only NDJSON com hash chain SHA-256, verificação diária automática e endpoint `/api/admin/audit-logs/chain-status`
- **Revisão de acesso periódica** (#11): `GET /api/admin/access-review` com nível de risco por usuário + cron trimestral enviando resumo aos admins e atestação assinada (HMAC) registrada no WORM
- **Monitoramento de certificado TLS** (#15): gauge `caddy_tls_certificate_expiry_timestamp` exportado ao Prometheus; alertas <30d e expirado
- **Alertmanager** (#24): roteamento crítico→PagerDuty/Slack, warning/info→Slack, regras de inibição; revisão trimestral de tuning (`docs/alert-tuning.md`)
- **Proteção do bucket de backup** (#32): Object Versioning + MFA Delete + transição Glacier 90d + teste anti-deleção (`scripts/backup/test-deletion-protection.sh`)
- **API versionada** (#28): prefixo `/api/v{N}` com negociação via header `Accept: application/vnd.cs.v{N}+json` e política de lifecycle (`docs/api-versioning.md`)
- **Runners CI hardened** (#31): permissões mínimas, todas as actions pinadas por SHA
- **Supply chain** (#18/#19): SBOM CycloneDX assinado (cosign keyless) + SLSA provenance level 3 na release
- **Preservação de evidências forenses** (#33/#34): snapshot forense automatizado SEV-1 (`scripts/incident/forensic-snapshot.sh`) + chain of custody (`docs/forensics.md`) + postmortem sem culpa (`docs/runbooks/postmortem-template.md`)

### Outros

- PWA (Service Worker via Serwist, instalação offline-first)
- Painel administrativo (shares, usuários, logs, configurações, saúde do sistema, sessões ativas)
- Configuração persistida no banco (categorias: general, appearance, share, cache, email, smtp, legal, initUser)
- Healthcheck em `/api/health`, `/api/system/info` (admin), Swagger em `/api/swagger` (dev only)
- Cron jobs de limpeza (shares expirados, arquivos temporários, tokens, usuários não ativados)
- PT-BR como único idioma ativo
- Internacionalização (infra i18n mantida)
- Métricas Prometheus em `/api/metrics` (restrito a redes internas)

---

## Setup

### Requisitos

- **Docker Engine ≥ 24 + Docker Compose v2** (recomendado) — ou
- **Node.js ≥ 24** + npm (setup manual) + **OpenSSL** (para gerar segredos)

### Docker (recomendado)

#### Ambiente local de teste

1. Crie o arquivo `.env.local` a partir do exemplo e gere a senha do admin:

   ```bash
   cp .env.local.example .env.local
   openssl rand -base64 32   # copie a saída para ADMIN_PASSWORD no .env.local
   ```

2. Suba o container único (backend + frontend + Caddy integrado):

   ```bash
   docker compose -f docker-compose.local.yml up -d --build
   ```

3. Acesse **http://localhost:3000** (entrada unificada pelo Caddy).

   Portas expostas: `8090` (backend/api), `3333` (frontend Next.js) e `3000` (Caddy).

   Login inicial: `admin` / `admin@empresa.local` / senha definida em `ADMIN_PASSWORD`.

Recriar o ambiente do zero (apaga o banco SQLite):

```bash
docker compose -f docker-compose.local.yml down
rm data/controle-videos.db
docker compose -f docker-compose.local.yml up -d --build
```

#### Produção

O `docker-compose.yml` (padrão) sobe os serviços `backend`, `frontend` e `caddy`:

```bash
DOMAIN=seu-dominio.com ACME_EMAIL=voce@email.com \
ADMIN_EMAIL=admin@email.com ADMIN_PASSWORD=$(openssl rand -base64 32) \
JWT_SECRET=$(openssl rand -base64 32) \
docker compose up -d --build
```

Requer as variáveis `DOMAIN`, `ACME_EMAIL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `JWT_SECRET` (env ou `.env`). Não há mais secrets em arquivos — credenciais entram via variáveis de ambiente.

Para produção com Docker Swarm/secrets externos e dados em RAID6 (`/srv`):

```bash
docker compose -f docker-compose.prod.yml up -d
```

> Guia completo em `docs/operacional/DEPLOY.md` e `docs/auditoria/ROADMAP.md`.

### Setup manual (desenvolvimento)

#### Backend (porta `8080`)

1. Entre na pasta `backend`
2. Instale as dependências com `npm ci` (usa `package-lock.json` para reprodutibilidade)
3. Aplique o schema ao banco com `npx prisma db push`
4. Popule o banco com `npx prisma db seed`
5. Inicie o backend com `npm run dev`

#### Frontend (porta `3000`)

1. Inicie o backend primeiro
2. Entre na pasta `frontend`
3. Instale as dependências com `npm ci` (use `--legacy-peer-deps` em instalação limpa se necessário)
4. Inicie o frontend com `npm run dev`

Pronto! Acesse **http://localhost:3000** (o frontend faz proxy de `/api/*` para `http://localhost:8080`).

#### Configuração via `config.yaml` (opcional)

Copie `config.example.yaml` para `config.yaml` na raiz do repositório e ajuste os valores. Se o arquivo existir, ele sobrescreve as configurações do banco; caso contrário, o sistema usa a configuração da UI. O bloco `initUser` cria o primeiro usuário admin no boot.

#### Lint e build

- `npm run lint` (na raiz roda em `backend` e `frontend`)
- `npm run build` (em cada workspace: `backend` e `frontend`)
- Observação: o Prisma Client precisa ser regenerado após mudanças no `schema.prisma` (`npx prisma generate` no `backend`); `postinstall` do backend já roda `prisma generate` automaticamente no `npm ci`

#### Testes

Há testes unitários e E2E (backend), unitários (frontend) e E2E de navegador (Playwright), com cobertura ≥60% e CI em `.github/workflows/ci.yml` (Node 24, lint/build/unit/coverage/e2e + **auditoria de segurança completa**).

```bash
# Backend
npm run test:unit      # jest — unitários (28 suites, 286 testes)
npm run test:e2e       # jest — e2e efêmero (DB dedicado, não destrutivo)
npm run test:coverage  # jest com cobertura (thresholds ≥60%)
npm test               # alias para test:unit

# Frontend
npm run test           # vitest run
npm run test:unit      # vitest run (mesma coisa)
```

**Suítes de segurança no CI:**

- `security.e2e-spec.ts` (§35) — job dedicado `Security E2E`: valida rate limiting, CSRF, senha de share, tokens opacos e limites de view/download (cenário do pentest, incl. bypass via stream inline corrigido no issue #40 — spec em `src/share/guard/shareSecurity.guard.spec.ts`)
- `api-version.e2e-spec.ts` (#28) — negociação `/api/v{N}` e headers de deprecação
- **ZAP baseline semanal** (`zap-scan.yml`) — OWASP ZAP contra a imagem de produção; falha apenas em findings HIGH
- **Pentest interno de shares** — metodologia black-box reproduzível em `docs/auditoria/PENTEST-SHARE-LINK-2026-08-22.md`
- **SQL injection** — acesso ao banco 100% via Prisma parametrizado; zero uso de `$queryRawUnsafe`/`$executeRawUnsafe` (auditado em 2026-08-22)

**Auditoria de segurança (reproduzível localmente):**
```bash
# Backend
cd backend && npm audit --audit-level=high
npm audit signatures
# Verificar deps Git/URL externos (bloqueia no CI)
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
function checkDeps(deps) { if (!deps) return []; return Object.entries(deps).filter(([_, v]) => { if (typeof v !== 'string') return false; if (/^file:\.\.?\//.test(v)) return false; return /^(git\+https?|git\+ssh|https?|file):/.test(v); }); }
const issues = [...checkDeps(pkg.dependencies), ...checkDeps(pkg.devDependencies), ...checkDeps(pkg.optionalDependencies), ...checkDeps(lock.dependencies), ...checkDeps(lock.packages)];
if (issues.length > 0) { console.log('Git/URL dependencies found:'); issues.forEach(([name, version]) => console.log('  ' + name + ': ' + version)); process.exit(1); }
console.log('No Git/URL dependencies detected');
"

# Frontend (mesmo procedimento)
cd frontend && npm audit --audit-level=high && npm audit signatures
```

Requisitos: backend precisa do `prisma generate` antes do primeiro run (Postinstall automático em `npm ci`); e2e usa DB efêmero próprio. Para detalhes de cobertura e critérios ver `docs/auditoria/TEST_PLAN.md`.

---

## Implantação em servidor Linux (passo a passo)

Guia do zero até o sistema no ar em um servidor Ubuntu/Debian. **Não é
necessário instalar Node.js, npm, Prisma ou SQLite no host** — tudo roda
dentro de containers Docker.

### 1. Pré-requisitos do servidor

- Ubuntu 22.04/24.04 ou Debian 12 (64-bit)
- 2 GB RAM, 2 vCPU, 20 GB de disco (mínimo recomendado)
- Portas **80** e **443** livres (Caddy escuta ambas)
- Domínio com DNS **A/AAAA apontando para o IP** do servidor (necessário para
  o certificado TLS automático do Let's Encrypt)
- E-mail válido para o Let's Encrypt (`ACME_EMAIL`)

### 2. Conectar e atualizar o sistema

```bash
ssh usuario@seu-servidor
sudo apt-get update && sudo apt-get upgrade -y
```

### 3. Instalar Docker Engine + Docker Compose v2 (Ubuntu)

```bash
# Dependências do apt
sudo apt-get install -y ca-certificates curl

# Adicionar o repositório oficial do Docker
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
| sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker Engine + Compose plugin
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

> **Debian:** troque `ubuntu` por `debian` nas duas linhas do repositório
> (`/etc/apt/keyrings/docker.asc` e `download.docker.com/linux/debian`).

Verifique a instalação:

```bash
docker --version
docker compose version
sudo systemctl enable --now docker
```

Para usar Docker **sem sudo** (opcional, faça logout/login após executar):

```bash
sudo usermod -aG docker "$USER"
```

### 4. Abrir as portas no firewall (se usar `ufw`)

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable   # confirme quando perguntar
```

### 5. Clonar o repositório

```bash
sudo apt-get install -y git
git clone https://github.com/elciomsantos/controle-share-videos-v1.0.git
cd controle-share-videos-v1.0
```

### 6. Criar o `.env` de produção

O `docker-compose.yml` exige as variáveis `DOMAIN`, `ACME_EMAIL`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD` e `JWT_SECRET` (via env ou `.env`).

```bash
cat > .env <<'EOF'
DOMAIN=seu-dominio.com.br
ACME_EMAIL=voce@email.com.br
ADMIN_EMAIL=admin@empresa.local
ADMIN_PASSWORD=<cole a saída de: openssl rand -base64 32>
JWT_SECRET=<cole a saída de: openssl rand -base64 32>
EOF
chmod 600 .env
```

Para gerar os segredos:

```bash
openssl rand -base64 32
```

> ⚠️ **`JWT_SECRET`**: consumido apenas pelo `JwtStrategy` legado (inativo —
> ver Fase 4). As **sessões de autenticação** são opacas e server-side e os
> **share tokens** são opacos com `token_hash` (§23) — a rotação do segredo
> **não** derruba logins ativos nem invalida share tokens emitidos.

**Acesso por IP (sem domínio):** se preferir acessar o sistema por IP (ex:
`http://192.168.1.50`), use `CADDYFILE=ip` no `.env` e omita `DOMAIN`/
`ACME_EMAIL`. Veja `docs/operacional/DEPLOY.md` §6.2.

```bash
cat > .env <<'EOF'
CADDYFILE=ip
ADMIN_EMAIL=admin@empresa.local
ADMIN_PASSWORD=<cole a saída de: openssl rand -base64 32>
JWT_SECRET=<cole a saída de: openssl rand -base64 32>
CORS_ORIGIN=http://192.168.1.50
API_URL=http://192.168.1.50/api
EOF
```

### 7. Subir a stack (build das imagens na 1ª vez: ~3–5 min)

```bash
docker compose up -d --build
```

Acompanhe a subida:

```bash
docker compose logs -f backend frontend caddy
# Ctrl+C apenas para de acompanhar; os containers continuam rodando
```

### 8. Verificar a saúde

```bash
docker ps --filter name=controle-share-videos --format "{{.Names}}: {{.Status}}"
# Esperado: todos (healthy)

docker exec controle-share-videos-backend curl -fs http://127.0.0.1:8080/api/health
# Esperado: OK
```

### 9. Acessar e primeiros passos

1. Acesse **https://seu-dominio.com.br**
2. Faça login com `ADMIN_EMAIL` / `ADMIN_PASSWORD`
3. No primeiro login, a troca de senha é **obrigatória** (`passwordMustChange`)
4. Em `Administração → Configurações`, ajuste `general.appName`,
   `general.appUrl`, `share.maxExpiration`, `share.defaultExpiration`
5. Crie usuários dos papéis `operador` / `auditor`
6. (Opcional) Configure SMTP em `Administração → Configurações → smtp`

### 10. Atualizar o sistema (upgrades)

```bash
cd controle-share-videos-v1.0
git pull --ff-only origin main
docker compose up -d --build
# Migrações do Prisma são aplicadas automaticamente no boot do backend
```

> **Antes de atualizar, faça backup** — ver
> `docs/operacional/BACKUP_RESTORE.md` (backup diário + restore test).
> Rollback e resolução de incidentes em `docs/operacional/RUNBOOKS.md`.

---

## Docker Compose (variantes)

| Arquivo | Uso |
|---|---|
| `docker-compose.yml` | Produção padrão (backend, frontend, caddy; admin e TLS via variáveis de ambiente — `DOMAIN`, `ACME_EMAIL`, `ADMIN_*`, `JWT_SECRET`) |
| `docker-compose.local.yml` | Ambiente de teste local — container único (backend + frontend + Caddy) com `.env.local` |
| `docker-compose.prod.yml` | Produção com secrets externos (Docker Swarm), TLS via Caddy 2.9 e dados em RAID6 (`/srv/controle-share-videos`) |
| `docker-compose.monitoring.yml` | Observabilidade (prometheus, alertmanager, grafana, loki, promtail, node-exporter) |

O serviço `caddy` monta `Caddyfile.${CADDYFILE:-prod}` em
`/etc/caddy/Caddyfile`:

| `CADDYFILE` | Arquivo | Uso |
|---|---|---|
| `prod` (default) | `Caddyfile.prod` | TLS Let's Encrypt (domínio No-IP ou próprio) |
| `ip` | `Caddyfile.ip` | Acesso por IP — HTTP `:80` ou `tls internal` `:443` |
| `local` | `Caddyfile.local` | Homologação/LAN sem TLS (`:3000`) |

Exemplo — acesso por IP: `CADDYFILE=ip docker compose up -d --build` (veja
`docs/operacional/DEPLOY.md` §6.2).

### Acesso por IP via WSL2 (Windows + Docker no WSL2)

Se o Docker roda dentro do WSL2 (modo NAT), use os scripts de
`scripts/wsl2/` para expor as portas na LAN do Windows (portproxy dinâmico):

```powershell
# PowerShell como ADMINISTRADOR
powershell -ExecutionPolicy Bypass -File scripts\wsl2\apply-portproxy.ps1
# Reinício completo pós-reboot (boot WSL + Docker + compose + portproxy):
powershell -ExecutionPolicy Bypass -File scripts\wsl2\fix-wsl-restart.ps1
```

Detalhes em `docs/operacional/DEPLOY.md` §6.3.

---

## Documentação

### Arquitetura e implantação

- `docs/VISAO-GERAL.md` — visão arquitetural completa
- `docs/operacional/DEPLOY.md` — guia de implantação (modelo final de produção)
- `docs/GOLIVE-CHECKLIST.md` — checklist executável de go-live (5 fases com evidências)
- `docs/operacional/HOST-PROVISIONING-ONPREMISE.md` — provisionamento do servidor on-premise (Swarm secrets, deploy key, backup)
- `docs/api-versioning.md` — política de versionamento da API (`/api/v{N}`)
- `docs/operacional/MONITORAMENTO.md` — healthchecks, logs, alertas, certificado TLS
- `docs/alert-tuning.md` — revisão trimestral de tuning de alertas
- `docs/operacional/BACKUP_RESTORE.md` — procedimentos de backup/restauração
- `docs/runbooks/dr-drill.md` — drill trimestral de disaster recovery
- `docs/operacional/RUNBOOKS.md` — resposta a incidentes
- `docs/forensics.md` — preservação de evidências e chain of custody
- `docs/PLANO-DOMINIO.md` — configuração de domínio No-IP/próprio/IP
- `docs/PLANO-IMPLANTACAO.md` — plano de ajuste para modelo final de implantação

### Auditoria e análise

- `docs/auditoria/AUDIT_REPORT.md` — relatório final consolidado (nota 7.5/10)
- `docs/auditoria/SECURITY_REPORT.md` — segurança (9.0/10, OWASP A05 ✅)
- `docs/auditoria/PENTEST-SHARE-LINK-2026-08-22.md` — pentest black-box de links de compartilhamento (achados, correção #40, plano)
- `docs/pentest-scope.md` — escopo para pen test externo (OWASP ASVS L2)
- `docs/SECURITY-GAPS-IMPLEMENTATION-PLAN-PTBR.md` — plano das 4 fases de lacunas (35 issues, 100% fechados)
- `docs/auditoria/PERFORMANCE_REPORT.md` — performance
- `docs/auditoria/DEPENDENCY_AUDIT.md` — dependências (8.5/10)
- `docs/auditoria/TECH_DEBT.md` — dívida técnica
- `docs/auditoria/TEST_PLAN.md` — plano de testes
- `docs/auditoria/ARCHITECTURE_REVIEW.md` — revisão arquitetural
- `docs/auditoria/REFACTORING_PLAN.md` — plano de refatoração
- `docs/auditoria/ROADMAP.md` — roadmap pós-v1.0 (v1.1–v2.0)
- `docs/auditoria/CHANGELOG.md` — changelog da auditoria
- `docs/auditoria/AUDIT_MATRIX.md` — matriz de achados (19/19 verde/aceito)
- `docs/auditoria/DISCOVERY.md` — descoberta inicial
- `docs/auditoria/EVIDENCE_INDEX.md` — índice de evidências

### Segurança

- `docs/ESPECIFICACAO-SEGURANCA.md` — spec v1.2 (sessões, autenticação, tokens, compartilhamento)
- `docs/ESPECIFICACAO_SEGURANCA_DOCKER_HOST_v1.0.md` — hardening obrigatório Linux + Docker
- `docs/Relatorio/PLANO_HARDENING_DOCKER.md` — plano de execução priorizado (100% crítico/alto implementado)
- `docs/SEGURANCA-CORRECTIONS-SUMMARY.md` — resumo de todas as 17 correções (7 fases, 100%)
- `docs/SEGURANCA-CORRECTIONS-TRACKER.md` — tracker detalhado por arquivo/linha
- `docs/PLANO-CORRECOES-SEGURANCA.md` — plano original de correções
- `docs/POLITICA-SEGURANCA-NPM.md` — política de segurança de dependências npm

### Funcionalidades específicas

- `docs/CERTIFICADO.md` — certificado SHA-256 automático (PDF + QR Code + metadados embutidos no vídeo)
- `docs/PLANO-CERTIFICADO.md` — plano original do certificado
- `docs/PLANO-LIMPEZA.md` — política de limpeza de shares/arquivos

---

## Segurança — Hardening e Limitações Conhecidas

| Item | Status | Detalhes |
|---|---|---|
| CSP | ✅ Ativo | `Caddyfile.prod` — `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' ...` (H-01 / S-05) |
| Rate limit edge | ✅ Ativo | Caddy: 100 req/10s (dynamic), 10 req/60s (auth endpoints) |
| Security headers | ✅ Ativo | HSTS preload, X-Frame-Options DENY, X-Content-Type-Options nosniff, COOP/COEP/CORP, Permissions-Policy |
| Secrets | ✅ Docker secrets | `docker-compose.prod.yml` — `*_FILE` vars + secrets externos; `docker-compose.yml` — variáveis `.env` |
| Sessão opaca server-side | ✅ Ativo (Fase 4) | Access token opaco 256-bit (apenas SHA-256 persistido); validação por requisição §10 (revogado → expirado → inativo); idle 30min + absoluta 8h; refresh token como hash §26.3 com rotação + detecção de reuso; share tokens opacos com `token_hash` + `revoked_at` §23 |
| SQLite | ⚠️ Monitorado | Produção pequena (≤ 500 users simultâneos); migração PostgreSQL em v1.3 se necessário |
| Redis cache | 📦 Backlog v1.3 | Backend já tem `@keyv/redis` + fallback in-memory; ativar = subir serviço + flag |
| S3/MinIO storage | 📦 Backlog v1.4 | `S3UploadRepository` interface pronta (R02); acionar se > 100 GB uploads |
| Auditoria de views/downloads | ✅ Completa | Dashboard `/admin/download-logs` com filtros e paginação |
| Auditoria de eventos (§29.4) | ✅ Ativo (Fase 5) | `AuditLog` estruturado (IP/UA/requestId) com 17 eventos mínimos (login, MFA, sessões, senha, permissões, shares); admin `/admin/audit-logs` (admin+auditor) |
| Admin de sessões (§34) | ✅ Ativo (Fase 5) | `/admin/sessions`: listagem com estado (ativa/ociosa/expirada/revogada), IP e User-Agent; revogação com reautenticação recente; `tokenHash` nunca exposto |
| Auditoria WORM | ✅ Ativo (#10) | Hash chain SHA-256 append-only + verificação diária + alerta crítico `AuditLogHashChainBroken`; `/api/admin/audit-logs/chain-status` |
| Revisão de acesso periódica | ✅ Ativo (#11) | `/api/admin/access-review` (nível de risco por usuário) + cron trimestral com atestação assinada no WORM |
| Alertas Prometheus/Alertmanager | ✅ Ativo (#24) | 33 regras promtool-clean, rotas Slack/PagerDuty, inibições e tuning trimestral |
| Certificado TLS monitorado | ✅ Ativo (#15) | Gauge de expiração exportado a cada 6h; alertas <30d e expirado |
| SBOM + assinatura de artefatos | ✅ Ativo (#18/#19) | CycloneDX no CI assinado com cosign keyless; provenance SLSA3 na release |
| Swagger | 🔒 Dev only | Habilitado apenas em `docker-compose.local.yml` (`SWAGGER_ENABLED=true`) |

### CI/CD — deploy de produção

O job `Deploy (produção)` é **opt-in**: só executa quando a variável de
repositório `DEPLOY_ENABLED=true` está definida junto com os secrets
`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT` e `DEPLOY_SSH_KEY`. Sem isso o job
é pulado com segurança (evita falha de SSH a cada push). O workflow **Security
Gate** roda em todo push: secret scanning, hadolint, audit de dependências,
CodeQL (JS+TS), semgrep, Trivy, SBOM e production readiness check.

> Ver `docs/auditoria/SECURITY_REPORT.md` e `docs/auditoria/AUDIT_REPORT.md` para detalhes técnicos e evidências.

---

## Roadmap Pós-v2.7

| Versão | Foco | Principais itens |
|---|---|---|
| **v1.1** (curto) | Estabilização | R01 AuthService decomposto ✅, R02 UploadRepository ✅, CSP ✅, E2E Playwright ✅, restore test ✅, Docker Secrets ✅, rate limit edge ✅ |
| **v1.2** (médio) | SRE | Alertas Prometheus/Grafana, distributed tracing (OpenTelemetry), runbooks completos, chaos testing |
| **v1.3** (médio-longo) | Escala | Redis cache opcional, migração PostgreSQL/MySQL se SQLite contencionar, otimizações de query |
| **v1.4** (longo) | Cloud | Storage S3/MinIO via `IUploadRepository` (interface já existe), multi-região |
| **v2.0** (longo) | Modernização | Avaliar Next.js App Router, NestJS 12+, Prisma 8+, arquitetura modular |

---

## Licença

MIT — ver `LICENSE`.