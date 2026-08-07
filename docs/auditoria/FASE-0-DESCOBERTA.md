# Fase 0 — Descoberta do Projeto

> Auditoria de Código — *Controle Share Videos v1.0*
> Data: 2026-08-04
> Metodologia: Especificação Final em `docs/auditoria/Especificacao-final.md`

## 1. Visão Geral

**Controle Share Videos v1.0** é um sistema de compartilhamento seguro de arquivos para uso interno restrito, em PT-BR. Fork independente do *Pingvin Share X v1.21.1*, adaptado para:

- Upload **exclusivamente pelo dono autenticado** (removidos reverse shares)
- Armazenamento **apenas local** no servidor (removidos buckets S3)
- RBAC com papéis `admin` / `operador` / `auditor`
- Auditoria completa de views e downloads
- ClamAV — **rejeitado por decisão formal** (`docs/Padronizacao-07-clamav.md`); ver nota de reconciliação em §5

## 2. Stack Tecnológica

### Backend (`backend/`)

| Categoria | Tecnologia | Versão |
|---|---|---|
| Runtime | Node.js | 24 (via `node:24-alpine`) |
| Framework | NestJS | ^11.1.28 |
| Linguagem | TypeScript | ^6.0.3 |
| ORM | Prisma | ^7.9.0 (adapter better-sqlite3) |
| Banco | SQLite | via `better-sqlite3@12.11.1` |
| Auth | Passport + `@nestjs/jwt` | passport 0.7 / jwt 11.0 |
| Hashing | argon2 | ^0.45.1 (native addon) |
| 2FA/TOTP | otplib | ^13.3.0 |
| Cache | `cache-manager` + `@keyv/redis` | 6.4.2 / 4.4.0 |
| Rate limit | `@nestjs/throttler` | ^6.5.0 |
| Upload/Multimídia | multer (override), sharp | multer ^2.2.0 / sharp ^0.35.3 |
| E-mail | nodemailer | ^9.0.1 |
| JS doc/I18n | `nestjs-i18n`, `@nestjs/swagger` | 10.8.5 / 11.1.3 |
| Agendamento | `@nestjs/schedule` | ^5.0.1 |
| Segurança HTTP | helmet | ^8.3.0 |

### Frontend (`frontend/`)

| Categoria | Tecnologia | Versão |
|---|---|---|
| Framework | Next.js | ^16.2.12 (webpack build) |
| Linguagem | TypeScript | ^6.0.3 |
| UI | Mantine | ^9.4.2 (core/dropzone/form/hooks/modals/notifications) |
| Estado/Form | `@mantine/form` | ^9.4.2 |
| HTTP | axios | ^1.7.7 |
| i18n | react-intl | ^10.1.18 |
| JWT client | `jose`, `jwt-decode` | jose ^6.2.4 / jwt-decode ^4.0.0 |
| Markdown | `@uiw/react-md-editor`, `markdown-to-jsx` | 4.1.0 / 9.9.0 |
| PWA/SW | `@serwist/next` + serwist | ^9.5.12 |
| Validação | yup | ^1.4.0 |
| Sanitização | dompurify | ^3.2.0 |

### Infra/DevOps

| Categoria | Tecnologia |
|---|---|
| Container | Docker (multi-stage, 7 estágios) — `Dockerfile` único |
| Orquestração | Docker Compose v2 (4 variantes: `.yml`, `.local`, `.prod`, `.monitoring`; a 5ª `.dev` foi removida com o ClamAV — ver nota em §5) |
| Reverse proxy / TLS | Caddy 2.9 (interno desativável via `CADDY_DISABLED=true` + externo `caddy:2.9-alpine`) |
| Observabilidade | Prometheus + Grafana + Loki + Promtail (`scripts/monitoring/`) |
| Hardening | `scripts/provision/hardening.sh` |
| Provisionamento | `scripts/provision/samba.sh`, `scripts/wsl2/*.ps1` (portproxy) |
| Manutenção | `scripts/maintenance/cleanup-temp.sh`, `scripts/backup.sh` |

## 3. Estrutura de Diretórios

```
controle-share-videos-v1.0/
├── backend/                # NestJS + Prisma (SQLite)
│   ├── prisma/             # schema.prisma, migrations/, seed/, generated/
│   ├── src/
│   │   ├── auth/           # JWT, local strategy, TOTP, guards, DTOs
│   │   ├── cache/           # cache-manager + Redis (Keyv)
│   │   ├── common/         # request-context (AsyncLocalStorage), zip, duplicated-field
│   │   ├── config/         # ConfigService persistido no banco + logo.service
│   │   ├── download-log/   # auditoria de views/downloads + admin-download-logs
│   │   ├── email/          # nodemailer wrapper
│   │   ├── file/           # upload/download de arquivos (local + chunked)
│   │   ├── i18n/           # pt-BR único ativo, SystemLanguageResolver
│   │   ├── jobs/           # cron: shares expirados, tmp files, tokens, usuários
│   │   ├── prisma/         # PrismaService
│   │   ├── share/          # Share CRUD, security, recipients, guard
│   │   ├── system/         # health check, disk space, admin
│   │   ├── throttler/      # exception filter customizado
│   │   ├── user/           # RBAC, passwordMustChange
│   │   └── utils/
│   ├── test/               # newman-system-tests.json (teste de sistema)
│   ├── eslint.config.mjs
│   └── tsconfig.{build,seed}.json
├── frontend/
│   ├── src/
│   │   ├── components/     # account, admin, auth, core, footer, header, share, upload
│   │   ├── hooks/         # config, confirm-leave, useTranslate, user
│   │   ├── i18n/
│   │   ├── middleware.ts   # Next middleware (cookies-next)
│   │   ├── pages/         # 404, _app, _document, account, admin, auth, error, imprint, privacy, s, share, upload
│   │   ├── services/      # api, auth, config, downloadLog, share, system, user
│   │   ├── sw.ts          # Service Worker (Serwist)
│   │   ├── types/
│   │   └── utils/
│   └── next.config.js
├── reverse-proxy/         # Caddyfile variants
├── scripts/               # docker, maintenance, monitoring, provision, wsl2
├── docs/                   # Visão-geral, Padronizacao-NN, Implantacao/, auditoria/
├── data/                   # controle-videos.db, images/, uploads/
├── secrets/                # admin_password.txt, jwt_secret.txt, smtp_password.txt
├── docker-compose*.yml     # 4 variantes (a 5ª `.dev` removida com o ClamAV)
├── Dockerfile              # multi-stage único
├── eslint.config.mjs       # raiz
└── package.json            # raiz (lint/format orquestradores)
```

**Métricas iniciais de tamanho**

- Backend: **90** arquivos `.ts` em `src/` ≈ **6 421 LOC**
- Frontend: **109** arquivos `.ts`/`.tsx` em `src/`
- Prisma: **1** schema, múltiplas migrations (4 recentes em 2026-07/08)

## 4. Arquitetura

### Padrão

- Backend: **NestJS modular** (módulos de feature) com controllers/services/DTOs, guards via `APP_GUARD` (Throttler → JWT → Roles → PasswordMustChange), Prisma como camada de persistência, AsyncLocalStorage para correlation ID.
- Frontend: **Next.js Pages Router** (`pages/`) com componentes de feature, hooks customizados, services centralizando chamadas axios, middleware Next para auth.

### Fluxo de Requisição (Backend)

1. Express raw body (octet-stream, chunked)
2. Cookie parser
3. `trust proxy` (configurável)
4. CORS (com credenciais, origem via env)
5. Correlation ID middleware (`X-Request-Id` + AsyncLocalStorage)
6. CSRF double-submit cookie (CRIT-01) — exceto em GET e endpoints `sameSite=strict`
7. Helmet (CSP, HSTS preload 2y, COOP/CORP same-origin, referrer same-origin)
8. Permissions-Policy custom header
9. NestJS pipes (I18nValidation), filters (I18nValidation, Throttler), interceptors (ClassSerializer)
10. Global prefix `/api`
11. APP_GUARDs: Throttler → Jwt → Roles → PasswordMustChange

### Persistência

- **SQLite** único arquivo (`data/controle-videos.db`) via Prisma 7 com adapter `better-sqlite3`.
- 12 modelos: `User`, `RefreshToken`, `LoginToken`, `ResetPasswordToken`, `Share`, `ShareRecipient`, `File`, `ShareSecurity`, `Config`, `DownloadLog`.
- Migrations versionadas (`prisma/migrations/`), `migration_lock.toml` presente.
- Índices em `DownloadLog` (shareId, userId, createdAt, event, requestId) — bom.
- **Observado na Fase 0:** campos `size: String` em `File` (não BigInt/Decimal) — sinal de alerta para Fase 4.

### Configuração Persistente

- Categoria única `Config` no banco: general, appearance, share, cache, email, smtp, legal.
- Algumas flags são `obscured` e `secret` (e.g., SMTP credentials, JWT secret).,omitempty.

### Segurança (primeira impressão — será aprofundada na Fase 5)

- CSRF cookie double-submit (`csrf_token` httpOnly sameSite=strict) em `main.ts:109`.

- Helmet CSP rigorosa (apenas `styleSrc` permite `'unsafe-inline'`).
- HSTS com `preload + includeSubDomains` (2 anos).
- `Permissions-Policy` desabilita geolocation/camera/microphone.
- Hashing: **argon2** (bcrypt descontinuado pelo OWASP para novas implantações — aderente).
- 2FA/TOTP via otplib + QR code.
- Rate limit global: **100 req/60s** (ThrottlerModule em `app.module.ts:45`).
- JWT secret vindo de `secrets/jwt_secret.txt` (flag `ensure_jwt_secret` em migration 2026-07-29).
- **Upload só pelo dono autenticado** — reduz superfície de ataque.

### Observabilidade

- Correlation ID propagado via `X-Request-Id` e `AsyncLocalStorage` (MED-04 + GAP-02).

- Download logs auditados com `shareId, fileId, fileName, fileSize, userId, username, ip, userAgent, success, reason, event, requestId`.
- Prometheus + Grafana + Loki + Promtail (stack opcional via `docker-compose.monitoring.yml`).

## 5. DevOps

### Docker

- `Dockerfile` **único, multi-stage (7 estágios)** combinando frontend+backend+caddy na imagem final.

- Usuário não-root `controle-user:controle-group` (uid 1002).
- Frontend standalone Next.js (`output: 'standalone'` implícito).
- Backend runner copia apenas `dist`, `prisma`, `node_modules` production.
- Healthcheck explícito (`curl /api/health` com `start-period=120s`).
- `npm` binary removido da imagem final (redução de superfície).

### Compose — 4 variantes

| Arquivo | Propósito |
|---|---|
| `docker-compose.yml` | Base de produção |
| `docker-compose.local.yml` | Override local/teste |
| `docker-compose.prod.yml` | Prod com secrets externos e domínio |
| `docker-compose.monitoring.yml` | Observabilidade stack |

> **Nota de reconciliação (2026-08-08):** na descoberta original havia uma 5ª variante, `docker-compose.dev.yml` ("Dev — adiciona ClamAV"), removida em 2026-08-07 junto com a integração ClamAV (decisão formal — `docs/Padronizacao-07-clamav.md`).

## 6. Documentação Existente (relevante p/ auditoria)

- `README.md` — visão produto + setup
- `docs/Visao-geral.md` — arquitetural
- `docs/Padronizacao.md` + 11 temas específicos
- `docs/Especificacao-analise-{0,1,2}.md` — análises anteriores
- `docs/auditoria-final.md`, `docs/Auditoria-pre-producao.md` — auditorias prévias
- `docs/analise-hard.md` + `docs/plano-correcoes-analise-hard.md` — hardening
- `docs/Implantacao/` — guia prod completo (Ubuntu, Caddy TLS, RAID6, Samba)
- `SECURITY.md` — política de segurança do repositório

> **Atenção:** Há auditorias prévias (`docs/auditoria-final.md`, `docs/Auditoria-pre-producao.md`). A auditoria atual **deve** referenciar essas análises e verificar se findings antigos foram endereçados ou persistem — isso alimenta diretamente a Fase 12 (Refatoração) e o `TECH_DEBT.md`.

## 7. Testes

- Apenas **testes de sistema** no backend (`backend/test/newman-system-tests.json`, via Newman/Postman), acionados por `npm run test:system`.
- Script: `prisma migrate reset` + start + `wait-on` + newman run.
- **Sem** testes unitários ou de integração visíveis no backend; **sem** testes no frontend.
- Falta flagrada como dívida técnica — entra na Fase 10.

## 8. Pontos de Atenção Iniciais (sinais para próximas fases)

Estas são **hipóteses iniciais**, a serem confirmadas/refutadas nas fases específicas:

- **Arquitetura**: Monolito Next.js + NestJS bem modularizado; aparentemente baixo acoplamento entre features. Verificar Fase 1.
- **Banco**:SQLite em produção com compartilhamento de arquivos ilimitado — questões sobre concorrência de Writes, locks e recuperação (Fase 4). Campo `File.size` como `String` (não numérico) — checar Fase 4.
- **Segurança**: CSRF/CSP/HSTS/argon2/TOTP — superfície bem defendida. Verificar JWT rotation, refresh token revogação, validação de upload MIME, path traversal em `file.service` (Fase 5).
- **Performance**: Cache via Keyv/Redis opcional; throttler 100/min global pode ser baixo para admin. Verificar queries Prisma sem paginação (Fase 6).
- **Qualidade**: TypeScript strict a confirmar; ESLint flat config (`eslint.config.mjs`) em ambos workspaces. Verificar métodos longos em `share.service.ts`/`file.service.ts` (Fase 7).
- **Dependências**: Backend usa vários **overrides** de segurança (`handlebars`, `path-to-regexp`, `multer`, `js-yaml`, `uuid`, `axios`, `brace-expansion`, `sharp`, `find-my-way`, `glob`, `minimatch`) — investigar contexto na Fase 8.
- **Docker/DevOps**: Multi-stage bem construído. Verificar utilização de `.env.local` em prod, secrets management (Fase 9).
- **Testes**: Cobertura mínima — Fase 10 esperada com nombreuses achados.
- **Docs**: Rica visão produto, mas README_limit. Verificar consistência entre `docs/Padronizacao-NN` e o código real (Fase 11).

## 9. Entregáveis da Fase 0 (conforme especificação)

- [x] Linguagens, frameworks e bibliotecas identificados
- [x] Arquitetura e padrões analisados (NestJS modular + Next Pages Router)
- [x] Estrutura de diretórios e módulos examinada
- [x] Banco de dados (SQLite via Prisma 7) e ferramentas DevOps mapeadas

## 10. Critérios de Risco × Impacto × Esforço (premissa para próximas fases)

Será aplicada a tabela:

| Risco | Impacto | Esforço |
|---|---|---|
| Crítico — exploração direta / data loss / perda de confidencialidade | Segurança — máxima prioridade | Muito Baixo — ajuste de 1 linha / config |
| Alto — comportamento incorreto sob condições específicas | Performance — latência visível ao usuário | Baixo — < 30 min (Quick Win) |
| Médio — má prática sem falha imediata | Escalabilidade — degrada em escala | Médio — 30 min – 4 h |
| Baixo — code smell / legibilidade | Disponibilidade — downtime | Alto — 4 h – 1 dia |
| — | Manutenibilidade / Legibilidade | Muito Alto — > 1 dia / refatoração arquitetural |

## 11. Notas de Execução

- Refatorações (Fase 12) serão **apenas propostas**, não aplicadas.
- Formato de recomendação será completo (9 campos) conforme especificação.
- Artefatos finais serão gravados em `docs/auditoria/relatorios/`.
