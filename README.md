<div align="center">
  <img src="/frontend/public/img/images/logo-programer.png" alt="Logo" width="300">

  <h1>Sistema de controle e compartilhamento de videos</h1>

  <p align="center">

  **Controle Share Videos v1.0** — compartilhamento seguro de arquivos para uso interno restrito.

  </p>
</div>

# Controle Share Videos

Sistema de compartilhamento seguro de arquivos para uso interno restrito, em PT-BR. Fork independente do Pingvin Share X v1.21.1, adaptado para upload exclusivamente pelo dono autenticado e armazenamento apenas local (servidor Ubuntu).

> **Documentação:** ver `docs/Visao-geral.md` (visão arquitetural),
> `docs/operacional/DEPLOY.md` (guia de implantação),
> `docs/auditoria/AUDIT_REPORT.md` (auditoria completa).
> Para implantar do zero em um servidor Linux, siga a seção
> **"Implantação em servidor Linux (passo a passo)"** abaixo.

---

## Funcionalidades

### Compartilhamento

- Compartilhamento via link com token UUID v4
- Tamanho de arquivo ilimitado (restrito apenas pelo espaço em disco)
- Data de expiração configurável por share
- Shares protegidos por senha + limite de visitantes e downloads
- **Geração automática de senha forte** (comprimento configurável via `share.generatedPasswordLength`) exibida separadamente no modal de upload completado
- Limites por share: máximo de visualizações, máximo de downloads, expiração
- Página exclusiva de visualização por link (sem cabeçalho/rodapé do painel admin)
- Destinatários de e-mail (smtp opcional)
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

### Usuários e permissões (RBAC)

- Controle de acesso por papéis: `admin` / `operador` / `auditor`
- Apenas `admin` cria usuários via `POST /api/users` escolhendo o papel
- Senha temporária forte (12 chars) exibida uma única vez no modal, ou enviada por e-mail se SMTP habilitado
- **Troca obrigatória de senha no primeiro login** (`passwordMustChange` + Guard)
- Detecção de usuário duplicado com inline field error + debounce pre-validation (admin/signup)

### UX de erro

- **Inline field error** — credenciais inválidas no login, link em uso na criação do share
- **Modal bloqueante** — conta não ativada (com botão "Reenviar verificação"), rate-limit 429 com countdown lendo header `Retry-After`, falha de servidor/rede, `completeShare` 500 (Tentar novamente / Descartar), erro de rede em `isShareIdAvailable`
- **Toast persistente agrupado** — falha de chunks ("Falha ao enviar N. Toque para detalhes") com ID fixo, sem `cleanNotifications()` global
- Helper reutilizável `showBlockingErrorModal` em `frontend/src/components/core/`
- Lacunas i18n corrigidas (PT-BR em `common.error.unknown`, `verify.*`, `signin.*`, `upload.dropzone.description`, `share.notify.copy-*`)

### Outros

- PWA (Service Worker via Serwist, instalação offline-first)
- Painel administrativo (shares, usuários, logs, configurações, saúde do sistema)
- Configuração persistida no banco (categorias: general, appearance, share, cache, email, smtp, legal)
- Healthcheck em `/api/health`, Swagger em `/api/swagger` (dev only)
- Cron jobs de limpeza (shares expirados, arquivos temporários, tokens, usuários não ativados)
- PT-BR como único idioma ativo

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
2. Instale as dependências com `npm install`
3. Aplique o schema ao banco com `npx prisma db push`
4. Popule o banco com `npx prisma db seed`
5. Inicie o backend com `npm run dev`

#### Frontend (porta `3000`)

1. Inicie o backend primeiro
2. Entre na pasta `frontend`
3. Instale as dependências com `npm install` (use `--legacy-peer-deps` em instalação limpa)
4. Inicie o frontend com `npm run dev`

Pronto! Acesse **http://localhost:3000** (o frontend faz proxy de `/api/*` para `http://localhost:8080`).

#### Configuração via `config.yaml` (opcional)

Copie `config.example.yaml` para `config.yaml` na raiz do repositório e ajuste os valores. Se o arquivo existir, ele sobrescreve as configurações do banco; caso contrário, o sistema usa a configuração da UI. O bloco `initUser` cria o primeiro usuário admin no boot.

#### Lint e build

- `npm run lint` (na raiz roda em `backend` e `frontend`)
- `npm run build` (em cada workspace: `backend` e `frontend`)
- Observação: o Prisma Client precisa ser regenerado após mudanças no `schema.prisma` (`npx prisma generate` no `backend`)

#### Testes

Há testes unitários e E2E (backend) e unitários (frontend), com cobertura ≥60% e CI em `.github/workflows/ci.yml` (Node 24, lint/build/unit/coverage/e2e + `npm audit --omit=dev` blocking).

```bash
# Backend
npm run test:unit      # jest — unitários (21 suites, 226 testes)
npm run test:e2e       # jest — e2e efêmero (DB dedicado, não destrutivo)
npm run test:coverage  # jest com cobertura (thresholds ≥60%)
npm test               # alias para test:unit

# Frontend
npm run test           # vitest run
npm run test:unit      # vitest run (mesma coisa)
```

Requisitos: backend precisa do `prisma generate` antes do primeiro run (Postinstall automático em `npm install`); e2e usa DB efêmero próprio. Para detalhes de cobertura e critérios ver `docs/auditoria/TEST_PLAN.md`.

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

> ⚠️ **`JWT_SECRET`**: se mudar após o sistema em produção, todas as sessões
> ativas são invalidadas. Programe rotações em janela de manutenção.

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
| `docker-compose.monitoring.yml` | Observabilidade (prometheus, grafana, loki, promtail) |

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

- `docs/Visao-geral.md` — visão arquitetural completa
- `docs/operacional/DEPLOY.md` — guia de implantação (modelo final de produção)
- `docs/operacional/MONITORAMENTO.md` — healthchecks, logs, alertas
- `docs/operacional/BACKUP_RESTORE.md` — procedimentos de backup/restauração
- `docs/operacional/RUNBOOKS.md` — resposta a incidentes

### Auditoria e análise

- `docs/auditoria/AUDIT_REPORT.md` — relatório final consolidado (nota 9.0/10)
- `docs/auditoria/SECURITY_REPORT.md` — segurança (9.0/10, OWASP A05 ✅)
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

---

## Segurança — Hardening e Limitações Conhecidas

| Item | Status | Detalhes |
|---|---|---|
| CSP | ✅ Ativo | `Caddyfile.prod` — `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' ...` (H-01 / S-05) |
| Rate limit edge | ✅ Ativo | Caddy: 100 req/10s (dynamic), 10 req/60s (auth endpoints) |
| Security headers | ✅ Ativo | HSTS preload, X-Frame-Options DENY, X-Content-Type-Options nosniff, COOP/COEP/CORP, Permissions-Policy |
| Secrets | ✅ Docker secrets | `docker-compose.prod.yml` — `*_FILE` vars + secrets externos; `docker-compose.yml` — variáveis `.env` |
| JWT rotation | ✅ Suportado | Troca de `JWT_SECRET` invalida sessões (previsto); rotação híbrida AES-256-GCM + resolução por kid; middleware do Next.js delega verificação ao backend quando o segredo local está desatualizado (SEC-NEW-4) |
| SQLite | ⚠️ Monitorado | Produção pequena (≤ 500 users simultâneos); migração PostgreSQL em v1.3 se necessário |
| Redis cache | 📦 Backlog v1.3 | Backend já tem `@keyv/redis` + fallback in-memory; ativar = subir Redis + flag |
| S3/MinIO storage | 📦 Backlog v1.4 | `S3UploadRepository` interface pronta (R02); acionar se > 100 GB uploads |
| Auditoria de views/downloads | ✅ Completa | Dashboard `/admin/download-logs` com filtros e paginação |
| Swagger | 🔒 Dev only | Habilitado apenas em `docker-compose.local.yml` (`SWAGGER_ENABLED=true`) |

> Ver `docs/auditoria/SECURITY_REPORT.md` e `docs/auditoria/AUDIT_REPORT.md` para detalhes técnicos e evidências.

---

## Licença

MIT — ver `LICENSE`.
