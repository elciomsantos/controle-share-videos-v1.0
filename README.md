<div align="center">
  <img src="/frontend/public/img/logo-dark.png" alt="Logo" width="300">

  <h1>Sistema de controle e compartilhamento de videos</h1>

  <p align="center">

  **Controle Share Videos v1.0** — compartilhamento seguro de arquivos para uso interno restrito.

  </p>
</div>

# Controle Share Videos

Sistema de compartilhamento seguro de arquivos para uso interno restrito, em PT-BR. Fork independente do Pingvin Share X v1.21.1, adaptado para upload exclusivamente pelo dono autenticado e armazenamento apenas local (servidor Ubuntu).

> **Documentação:** ver `docs/Visao-geral.md` (visão arquitetural), `docs/PLANO-IMPLANTACAO.md` (plano de implantação) e `docs/auditoria-final.md` (auditoria completa).

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

### Upload e armazenamento

- Upload apenas pelo dono autenticado (sem reverse shares — removido intencionalmente)
- Armazenamento **exclusivamente local** no servidor (sem buckets S3 — removido)
- Upload chunked multipart com progresso e retomada

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

## Setup

### Requisitos

- **Docker Engine + Docker Compose v2** (recomendado) — ou
- **Node.js ≥ 24** + npm (setup manual) + **OpenSSL** (para gerar senhas)

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
docker compose up -d --build
```

Requer as variáveis `DOMAIN` e `ACME_EMAIL` (env) e os arquivos de secret em `./secrets/` (`jwt_secret.txt`, `admin_password.txt`, `smtp_password.txt`).

Para produção com Docker Swarm/secrets externos e dados em RAID6 (`/srv`):

```bash
docker compose -f docker-compose.prod.yml up -d
```

> Guia completo em `docs/PLANO-IMPLANTACAO.md` e `docs/conf-dominio.md`.

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

Existem apenas testes de sistema para o backend (coleção Newman). Para rodá-los:

```bash
npm run test:system   # na pasta backend
```

Recria o banco (`prisma migrate reset -f`), inicia o servidor na porta `8080` e executa a coleção em `backend/test/newman-system-tests.json`.

## Docker Compose (variantes)

| Arquivo | Uso |
|---------|-----|
| `docker-compose.yml` | Produção padrão (backend, frontend, caddy; secrets em arquivos `./secrets/*.txt`) |
| `docker-compose.local.yml` | Ambiente de teste local — container único (backend + frontend + Caddy) com `.env.local` |
| `docker-compose.prod.yml` | Produção com secrets externos (Docker Swarm), TLS via Caddy 2.9 e dados em RAID6 (`/srv/controle-share-videos`) |
| `docker-compose.monitoring.yml` | Observabilidade (prometheus, grafana, loki, promtail) |

## Documentação

### Arquitetura e implantação

- `docs/Visao-geral.md` — visão arquitetural completa
- `docs/PLANO-IMPLANTACAO.md` — plano de implantação (modelo final de produção)
- `docs/conf-dominio.md` — configuração de domínio gratuito No-IP com IP fixo

### Auditoria e análise

- `docs/auditoria-final.md` — resumo executivo da auditoria
- `docs/auditoria/Especificacao-final.md` — especificação da auditoria (14 fases)
- `docs/auditoria/FASE-0-DESCOBERTA.md` … `docs/auditoria/FASE-12-REFATORACAO.md` — relatórios por fase
- `docs/auditoria/relatorios/AUDIT_REPORT.md` — relatório final consolidado
- `docs/auditoria/relatorios/` — demais relatórios: `SECURITY_REPORT`, `PERFORMANCE_REPORT`, `DEPENDENCY_AUDIT`, `TECH_DEBT`, `TEST_PLAN`, `ARCHITECTURE_REVIEW`, `REFACTORING_PLAN`, `ROADMAP`, `CHANGELOG_SUGERIDO`
