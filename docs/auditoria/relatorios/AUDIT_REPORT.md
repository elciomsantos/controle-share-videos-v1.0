# AUDIT_REPORT.md — Relatório Principal de Auditoria

> **Projeto:** Controle Share Videos v1.0
> **Metodologia:** `docs/auditoria/Especificacao-final.md` (auditoria evidence-based em 14 fases)
> **Período de execução:** 2026-08-04 em diante
> **Abrangência:** Backend NestJS + Frontend Next.js + Prisma/SQLite + Docker/DevOps + Documentação
> **Auditor:** Automação conduzida fase por fase, com validação interativa do solicitante
> **Decisões de escopo registradas:**
> - Execução: **fase por fase, interativa**
> - Artefatos finais em: `docs/auditoria/relatorios/`
> - Profundidade por recomendação: **completa (9 campos obrigatórios)**
> - Refatoração (Fase 12): **apenas proposta, sem alteração de código**

## Introdução

Relatório principal da auditoria do **Controle Share Videos v1.0** — fork do Pingvin Share X (v1.21.1, BSD-2-Clause) especializado em compartilhamento de vídeos. Conduzida em 14 fases (0–13) segundo a Especificação-final, a auditoria é **evidence-based**: todo achado cita arquivo/linha e documentação oficial, e **nenhum código foi alterado** — a entrega é diagnóstica (Fases 0–11), de proposta de refatoração (Fase 12) e de plano de execução (Fase 13). Este arquivo concentra o índice, a metodologia, as fases 0–4 detalhadas e o Sumário Executivo final; as fases 5–13 estão resumidas no Índice e detalhadas em arquivos dedicados.

## Sumário

| Categoria | Nota Atual | Critério |
|---|---|---|
| Arquitetura | TBD | Definida na Fase 1 |
| Segurança | TBD | Definida na Fase 5 |
| Performance | TBD | Definida na Fase 6 |
| Qualidade | TBD | Definida na Fase 7 |
| Testabilidade | 18 | Definida na Fase 10 |
| Documentação | 40 | Definida na Fase 11 |
| Manutenibilidade | 41 | Definida na Fase 12 |

> As notas (0–100) são atribuídas ao fim de cada fase correspondente e consolidadas no **Sumário Executivo (Fase 13)**. Categorias não pontuadas numericamente nas Fases 1–8 são avaliadas qualitativamente nas seções de cada fase.

## Índice de Fases

- [Fase 0 — Descoberta do Projeto](#fase-0--descoberta-do-projeto)
- [Fase 1 — Auditoria Arquitetural](#1-fase-1--auditoria-arquitetural)
- [Fase 2 — Auditoria de Backend](#2-fase-2--auditoria-de-backend)
- [Fase 3 — Auditoria de Frontend](#3-fase-3--auditoria-de-frontend)
- [Fase 4 — Auditoria de Banco de Dados](#4-fase-4--auditoria-de-banco-de-dados)
- Fase 5 — Auditoria de Segurança (✅ concluída)
- Fase 6 — Auditoria de Performance (✅ concluída)
- Fase 7 — Auditoria de Qualidade de Código (✅ concluída)
- Fase 8 — Auditoria de Infraestrutura/Dependências (✅ concluída)
- Fase 9 — Auditoria de Docker/DevOps (✅ concluída)
- Fase 10 — Auditoria de Testes (✅ concluída)
- Fase 11 — Auditoria de Documentação (✅ concluída)
- Fase 12 — Refatoração (✅ concluída)
- Fase 13 — Plano de Execução (✅ concluída)

## Metodologia

Conforme `docs/auditoria/Especificacao-final.md`, a auditoria segue:

1. **Base em evidências** — toda recomendação cita fonte oficial (NestJS, Next.js, Prisma, OWASP, NIST, CVE, RFCs).
2. **Priorização Risco × Impacto × Esforço** — classificação de cada finding.
3. **Formato obrigatório de recomendação** (9 campos):
   1. Problema | 2. Localização | 3. Evidência | 4. Situação Atual | 5. Implementação Recomendada | 6. Código Atual | 7. Código Sugerido | 8. Benefícios | 9. Riscos | 10. Compatibilidade
4. **Critérios de aceitação** aplicados a cada recomendação (resolve problema real? reduz complexidade? melhora segurança/performance? reduz dívida técnica? alinha-se à doc oficial? não quebra compatibilidade? benefício supera custo?).
5. **Processo controlado de implementação** — mesmo na Fase 12, será apenas proposta; nada é aplicado sem validação prévia do solicitante.

Artefatos finais obrigatórios (em `docs/auditoria/relatorios/`):
1. `AUDIT_REPORT.md` (este)
2. `SECURITY_REPORT.md`
3. `PERFORMANCE_REPORT.md`
4. `TECH_DEBT.md`
5. `REFACTORING_PLAN.md`
6. `ROADMAP.md`
7. `CHANGELOG_SUGERIDO.md`
8. `DEPENDENCY_AUDIT.md`
9. `TEST_PLAN.md`
10. `ARCHITECTURE_REVIEW.md`

## Evidências

- **Artefatos por fase:** `FASE-0-DESCOBERTA.md` a `FASE-12-REFATORACAO.md` em `docs/auditoria/` — cada um com achados nomeados (ARQ/BKD/FRN/BDB/SEC/PERF/QAL/INF/DOP/QTS/DOC), localização exata e documentação oficial citada.
- **Relatórios dedicados:** os 9 acima em `docs/auditoria/relatorios/`.
- **Fontes primárias de código:** `backend/prisma/schema.prisma`, `backend/src/**` (guards, services, controllers), `frontend/**`, `docker-compose*.yml`, `reverse-proxy/Caddyfile.prod`, `package.json`s, workflows/CI (ausente), coleções Newman.
- **Conteúdo consolidado:** 75 achados priorizados P0–P3 em `FASE-12-REFATORACAO.md`; contagens (772 LOC / 27 métodos do `ShareService`), comandos reais de build/test e CVEs citadas nas fases 8–9.

---

## Fase 0 — Descoberta do Projeto

### Objetivo da Fase
Compreender completamente o projeto antes de qualquer análise: identificar linguagens, frameworks e bibliotecas; analisar arquitetura e padrões; examinar estrutura de diretórios e módulos; identificar banco de dados e ferramentas DevOps. Entrega: documento completo de descoberta (arquivado em `docs/auditoria/FASE-0-DESCOBERTA.md`).

### 0.1 Visão Geral do Projeto

**Controle Share Videos v1.0** é um sistema de compartilhamento seguro de arquivos para uso interno restrito, em PT-BR. Fork independente do *Pingvin Share X v1.21.1*, adaptado para:

- Upload **exclusivamente pelo dono autenticado** (removidos reverse shares).
- Armazenamento **apenas local** no servidor (removidos buckets S3).
- RBAC com papéis `admin` / `operador` / `auditor`.
- Auditoria completa de views e downloads (IP, user-agent, timestamp, sucesso/falha).
- Integração opcional com ClamAV.
- TLS automático via Caddy 2.9 (Let's Encrypt) no ambiente de produção.

### 0.2 Stack Tecnológica

#### Backend (`backend/`)

| Categoria | Tecnologia | Versão |
|---|---|---|
| Runtime | Node.js | 24 (via `node:24-alpine`) |
| Framework HTTP | NestJS | ^11.1.28 |
| Linguagem | TypeScript | ^6.0.3 |
| ORM | Prisma | ^7.9.0 (adapter `better-sqlite3`) |
| Banco de Dados | SQLite | `better-sqlite3@12.11.1` |
| Autenticação | Passport + `@nestjs/jwt` | passport 0.7 / jwt 11.0 |
| Hashing de senha | argon2 | ^0.45.1 (native addon) |
| 2FA / TOTP | otplib + qrcode-svg | ^13.3.0 |
| Cache | `cache-manager` + `@keyv/redis` | 6.4.2 / 4.4.0 |
| Rate limit | `@nestjs/throttler` | ^6.5.0 |
| Upload / Multimídia | multer, sharp | multer ^2.2.0 / sharp ^0.35.3 |
| Antivírus | clamscan | ^2.4.0 |
| E-mail | nodemailer | ^9.0.1 |
| Validação | class-validator, class-transformer | 0.15.1 / 0.5.1 |
| I18n / Swagger | `nestjs-i18n`, `@nestjs/swagger` | 10.8.5 / 11.1.3 |
| Agendamento | `@nestjs/schedule` | ^5.0.1 |
| Segurança HTTP | helmet | ^8.3.0 |

#### Frontend (`frontend/`)

| Categoria | Tecnologia | Versão |
|---|---|---|
| Framework | Next.js (Pages Router, build webpack) | ^16.2.12 |
| Linguagem | TypeScript | ^6.0.3 |
| UI | Mantine | ^9.4.2 (core/dropzone/form/hooks/modals/notifications) |
| HTTP | axios | ^1.7.7 |
| i18n | react-intl | ^10.1.18 |
| JWT client | `jose`, `jwt-decode` | jose ^6.2.4 / jwt-decode ^4.0.0 |
| Markdown | `@uiw/react-md-editor`, `markdown-to-jsx`, dompurify | 4.1.0 / 9.9.0 / 3.2.0 |
| PWA / Service Worker | `@serwist/next` + serwist | ^9.5.12 |
| Validação client | yup | ^1.4.0 |
| Cookies | cookies-next | ^6.1.1 |

#### Infraestrutura / DevOps

| Categoria | Tecnologia |
|---|---|
| Container | Docker (multi-stage, 7 estágios — `Dockerfile` único) |
| Orquestração | Docker Compose v2 (5 variantes) |
| Reverse proxy / TLS | Caddy 2.9 (interno desativável + externo `caddy:2.9-alpine`) |
| Observabilidade | Prometheus + Grafana + Loki + Promtail (`scripts/monitoring/`) |
| Hardening | `scripts/provision/hardening.sh` |
| Provisionamento | `scripts/provision/samba.sh`, `scripts/wsl2/*.ps1` (portproxy) |
| Manutenção | `scripts/maintenance/cleanup-temp.sh`, `scripts/backup.sh` |

### 0.3 Estrutura de Diretórios

```
controle-share-videos-v1.0/
├── backend/                # NestJS + Prisma (SQLite)
│   ├── prisma/             # schema.prisma, migrations/, seed/, generated/
│   ├── src/
│   │   ├── auth/           # JWT, local strategy, TOTP, guards, DTOs
│   │   ├── cache/          # cache-manager + Redis (Keyv)
│   │   ├── clamscan/       # ClamAV opcional
│   │   ├── common/         # request-context (AsyncLocalStorage), zip, duplicated-field
│   │   ├── config/         # ConfigService persistido no banco + logo.service
│   │   ├── download-log/   # auditoria de views/downloads + admin-download-logs
│   │   ├── email/          # nodemailer wrapper
│   │   ├── file/           # upload/download (local + chunked)
│   │   ├── i18n/           # pt-BR único ativo, SystemLanguageResolver
│   │   ├── jobs/           # cron: shares expirados, tmp, tokens, usuários
│   │   ├── prisma/         # PrismaService
│   │   ├── share/          # Share CRUD, security, recipients, guard
│   │   ├── system/         # health check, disk space, admin
│   │   ├── throttler/      # exception filter customizado
│   │   ├── user/           # RBAC, passwordMustChange
│   │   └── utils/
│   ├── test/               # newman-system-tests.json (teste de sistema)
│   └── tsconfig.{build,seed}.json
├── frontend/
│   ├── src/
│   │   ├── components/     # account, admin, auth, core, footer, header, share, upload
│   │   ├── hooks/         # config, confirm-leave, useTranslate, user
│   │   ├── i18n/
│   │   ├── middleware.ts   # Next middleware
│   │   ├── pages/         # 404, _app, _document, account, admin, auth, error, imprint, privacy, s, share, upload
│   │   ├── services/      # api, auth, config, downloadLog, share, system, user
│   │   ├── sw.ts          # Service Worker (Serwist)
│   │   ├── types/
│   │   └── utils/
│   └── next.config.js
├── reverse-proxy/         # Caddyfile variants (dev, prod, trust-proxy)
├── scripts/               # docker, maintenance, monitoring, provision, wsl2
├── docs/                  # Visão-geral, Padronizacao-NN, Implantacao/, auditoria/
├── data/                  # controle-videos.db, images/, uploads/ (volumes Docker)
├── secrets/               # admin_password.txt, jwt_secret.txt, smtp_password.txt
├── docker-compose*.yml    # 5 variantes (.yml, .dev, .local, .prod, .monitoring)
└── Dockerfile             # multi-stage único
```

### 0.4 Métricas Iniciais de Tamanho

| Métrica | Valor |
|---|---|
| Arquivos TypeScript no backend (`src/`) | **90** |
| Linhas de código TS backend (LOC) | ~**6.421** |
| Arquivos TS/TSX no frontend (`src/`) | **109** |
| Modelos Prisma (`schema.prisma`) | 10 |
| Migrations Prisma | múltiplas (4 recentes em 2026-07/08) |
| Variantes docker-compose | 5 |
| Estágios do Dockerfile | 7 |

### 0.5 Arquitetura

#### 0.5.1 Padrão arquitetural

- **Backend**: NestJS modular, com módulos por feature (auth, share, file, user, config, system, jobs, download-log, email, cache, clamscan, i18n, prisma, throttler, common). Cada módulo expõe controller, service e DTOs; guards globais registrados via `APP_GUARD`. Prisma como camada de persistência. AsyncLocalStorage (`common/request-context`) para correlation ID.
- **Frontend**: Next.js **Pages Router** (`pages/`) com componentes de feature, hooks customizados, services centralizando chamadas axios, middleware Next para autenticação de cookies.

#### 0.5.2 Fluxo de requisição HTTP (backend)

1. Express raw body parser (octet-stream, limite configurável por `share.chunkSize`)
2. `cookieParser`
3. `trust proxy` (configurável via env)
4. CORS (com credenciais; `origin` via `CORS_ORIGIN`)
5. **Correlation ID middleware** — `X-Request-Id` inbound ou `crypto.randomUUID()`, propagado via `AsyncLocalStorage` (MED-04 + GAP-02)
6. **CSRF double-submit cookie** (CRIT-01) — `csrf_token` httpOnly sameSite=strict; métodos mutantes devem ecoar via header `x-csrf-token`
7. Helmet — CSP rigorosa (`scriptSrc: 'self'`; apenas `styleSrc` permite `'unsafe-inline'`), HSTS preload 2 anos, COOP/CORP same-origin, referrer same-origin
8. `Permissions-Policy` custom header (geolocation, camera, microphone desabilitados)
9. NestJS pipes globais: `I18nValidationPipe` (whitelist, forbidNonWhitelisted, transform)
10. Filters globais: `I18nValidationExceptionFilter`, `ThrottlerExceptionFilter`
11. Interceptor global: `ClassSerializerInterceptor`
12. Prefixo global `/api`
13. **APP_GUARDs encadeados**: `ThrottlerGuard` → `JwtGuard` → `RolesGuard` → `PasswordMustChangeGuard`

#### 0.5.3 Persistência

- **Banco**: SQLite único arquivo em `data/controle-videos.db` via Prisma 7 com adapter `better-sqlite3`.
- **10 modelos**: `User`, `RefreshToken`, `LoginToken`, `ResetPasswordToken`, `Share`, `ShareRecipient`, `File`, `ShareSecurity`, `Config`, `DownloadLog`.
- Migrations versionadas em `prisma/migrations/`, `migration_lock.toml` presente.
- Índices observados em `DownloadLog` (shareId, userId, createdAt, event, requestId) — boas práticas de auditoria.
- **Sinal de alerta registrado para Fase 4:** campo `File.size` modelado como `String` (não BigInt/Decimal/Int) — armazenamento de tamanho numérico como texto, potencial fonte de bugs de comparação e ordenação.

#### 0.5.4 Configuração persistente

Categoria única `Config` no banco (categorias: general, appearance, share, cache, email, smtp, legal). Algumas flags `obscured` e `secret` (credenciais SMTP, JWT secret). `ConfigService` lê e aplica defaults do schema.

### 0.6 Segurança — Primeira Impressão

> Detalhamento na Fase 5.

- CSRF cookie double-submit (`csrf_token` httpOnly sameSite=strict) — `backend/src/main.ts:109`.
- Helmet CSP rigorosa; HSTS com `preload + includeSubDomains` (2 anos).
- `Permissions-Policy` desabilitando geolocation/camera/microphone.
- Hashing: **argon2** (aderente à orientação OWASP para novas implantações).
- 2FA/TOTP via otplib + QR code.
- Rate limit global: **100 req/60s** (`ThrottlerModule`).
- JWT secret via `secrets/jwt_secret.txt` (migration `ensure_jwt_secret` em 2026-07-29).
- Upload **só pelo dono autenticado** — reduz superfície de ataque anônima.
- CORS com credenciais habilitado (origens via env) — verificado detalhadamente na Fase 5.

### 0.7 Observabilidade

- Correlation ID propagado via `X-Request-Id` e `AsyncLocalStorage` (referenciado como MED-04 + GAP-02 nos comentários do código).
- Download logs auditados com `shareId, fileId, fileName, fileSize, userId, username, ip, userAgent, success, reason, event, requestId`.
- Stack opcional (Prometheus + Grafana + Loki + Promtail) em `docker-compose.monitoring.yml`.

### 0.8 DevOps

#### 0.8.1 Docker

- `Dockerfile` **único, multi-stage (7 estágios)** combinando frontend+backend+caddy na imagem final.
- Usuário não-root `controle-user:controle-group` (uid/gid 1002).
- Frontend standalone Next.js (saída `.next/standalone`).
- Backend runner copia apenas `dist`, `prisma`, `node_modules` production.
- Healthcheck explícito (`curl /api/health`, `start-period=120s`).
- `npm` binary removido da imagem final (redução de superfície).

#### 0.8.2 Compose — 5 variantes

| Arquivo | Propósito |
|---|---|
| `docker-compose.yml` | Base de produção |
| `docker-compose.local.yml` | Override local/teste |
| `docker-compose.dev.yml` | Dev (adiciona ClamAV) |
| `docker-compose.prod.yml` | Produção com secrets externos e domínio |
| `docker-compose.monitoring.yml` | Stack de observabilidade |

### 0.9 Documentação Existente Relevante para a Auditoria

- `README.md` — visão produto + setup
- `docs/Visao-geral.md` — arquitetural
- `docs/Padronizacao.md` + **11 temas específicos** (link seguro, auditoria logs, usuários/permissões, limite tamanho, clamav, popups erro, usuário duplicado)
- `docs/Especificacao-analise-{0,1,2}.md` — análises anteriores
- `docs/auditoria-final.md`, `docs/Auditoria-pre-producao.md` — auditorias prévias
- `docs/analise-hard.md` + `docs/plano-correcoes-analise-hard.md` — hardening
- `docs/Implantacao/` — guia de produção (Ubuntu, Caddy TLS, RAID6, Samba)
- `SECURITY.md` — política de segurança do repositório

> **Implicação metodológica:** A auditoria atual **deve** referenciar essas análises prévias e verificar quais findings foram endereçados ou persistem. Isso alimenta diretamente a Fase 12 (Refatoração) e o artefato `TECH_DEBT.md`.

### 0.10 Testes — Estado Atual

- Apenas **testes de sistema** no backend (`backend/test/newman-system-tests.json`, acionados por `npm run test:system`).
- Script de teste: `prisma migrate reset` + start Nest + `wait-on` + `newman run`.
- **Ausência de testes unitários** no backend (sem `.spec.ts` visíveis em `src/`).
- **Ausência de testes no frontend** (sem setup de Jest/Vitest/Testing Library).
- Dívida técnica flagrada — entra como achado principal da Fase 10.

### 0.11 Pontos de Atenção Iniciais (hipóteses a confirmar/refutar nas próximas fases)

> Estas são **observações iniciais**, a serem validadas nas fases específicas:

| Hipótese | Fase que validará |
|---|---|
| Monolito bem modular aparenta baixo acoplamento entre features — verificar dependências circulares e duplicação | Fase 1 |
| SQLite em produção com upload de tamanho ilimitado — concorrência de writes, locks, recuperação | Fase 4 |
| `File.size` em `String` — bug de comparação/ordenação; tipo numérico (BigInt/Decimal) seria adequado | Fase 4 |
| JWT rotation, refresh token revogação, validação MIME de upload, path traversal em `file.service` | Fase 5 |
| Cache via Keyv/Redis opcional; throttler 100/min global pode ser baixo para admin; queries Prisma sem paginação | Fase 6 |
| Métodos longos em `share.service.ts`/`file.service.ts`; TypeScript strict a confirmar | Fase 7 |
| Backend com múltiplos **overrides** de segurança em `package.json` (handlebars, path-to-regexp, multer, js-yaml, uuid, axios, brace-expansion, sharp, find-my-way, glob, minimatch) — investigar CVEs | Fase 8 |
| Multi-stage Dockerfile bem construído; verificar `.env.local` em prod e gestão de secrets | Fase 9 |
| Cobertura de testes mínima — Fase 10 esperada com diversos achados | Fase 10 |
| Rica documentação de produto; verificar consistência entre `docs/Padronizacao-NN` e o código real | Fase 11 |

### 0.12 Entregáveis da Fase 0 (conforme especificação)

| Item | Status |
|---|---|
| Identificar linguagens, frameworks e bibliotecas | ✅ Concluído |
| Analisar arquitetura e padrões de projeto | ✅ Concluído (NestJS modular + Next Pages Router) |
| Examinar estrutura de diretórios e módulos | ✅ Concluído |
| Identificar banco de dados e ferramentas DevOps | ✅ Concluído (SQLite via Prisma 7; Docker multi-stage; Caddy; observabilidade opcional) |
| Documento completo de descoberta | ✅ Arquivado em `docs/auditoria/FASE-0-DESCOBERTA.md` |

### 0.13 Classificação de Risco × Impacto × Esforço aplicada

Esta tabela será aplicada a **todos** os findings das próximas fases:

| Risco | Impacto | Esforço |
|---|---|---|
| **Crítico** — exploração direta / data loss / perda de confidencialidade | Segurança — máxima prioridade | Muito Baixo — ajuste de 1 linha/config |
| **Alto** — comportamento incorreto sob condições específicas | Performance — latência visível ao usuário | Baixo — < 30 min (Quick Win) |
| **Médio** — má prática sem falha imediata | Escalabilidade — degrada em escala | Médio — 30 min – 4 h |
| **Baixo** — code smell / legibilidade | Disponibilidade — downtime | Alto — 4 h – 1 dia |
| — | Manutenibilidade / Legibilidade | Muito Alto — > 1 dia / refatoração arquitetural |

### 0.14 Notas de Execução da Fase 0

- Nenhum finding formal foi aberto nesta fase — descoberta é descritiva e mapeia o território.
- Hipóteses levantadas aqui viram **achados** formalizados nas fases 1–11.
- A Fase 0 não atribui ainda nota às categorias do Sumário (somente após a fase correspondente).
- Documento detalhado archivado em `docs/auditoria/FASE-0-DESCOBERTA.md` para referência cruzada.

---

## 1. Fase 1 — Auditoria Arquitetural

**Status:** ✅ Concluída | **Documento detalhado:** `docs/auditoria/FASE-1-ARQUITETURAL.md`

### 1.1 Escopo

Organização do projeto, acoplamento, coesão, modularização, dependências circulares, código duplicado e conformidade com boas práticas arquiteturais (Clean / MVC / DDD / Hexagonal).

### 1.2 Sumário de Achados

| ID | Severidade | Resumo |
|---|---|---|
| ARQ-01 | 🟠 Alto | Dependência circular bidirecional `ShareModule` ↔ `FileModule` (`forwardRef` em um lado, import direto no outro) |
| ARQ-02 | 🟠 Alto | God class `ShareService` — 772 LOC / 27 métodos (create, createZip, complete, increaseViewCount, getShareToken) |
| ARQ-03 | 🟡 Médio | Util `date.util.ts` duplicado entre backend/frontend com implementações divergentes (locale pt-br só no frontend) |
| ARQ-04 | 🟡 Médio | Boilerplate repetido de `@UseGuards(JwtGuard, RolesGuard)` + `@Roles()` nos controllers; cadeia global `APP_GUARD` já aplica os mesmos |

### 1.3 Análise Detalhada

**ARQ-01 — Dependência circular `ShareModule` ↔ `FileModule`**

- **Localização:** `backend/src/share/share.module.ts:14` (`forwardRef(() => FileModule)`); `backend/src/file/file.module.ts:15` (import direto).
- **Evidência:** ciclo fechado: `ShareModule →(forwardRef)→ FileModule → ShareModule`.
- **Situação Atual:** NestJS funciona via `forwardRef`, mas bloqueia extração de módulos para pacote independente e dificulta testes.
- **Implementação (proposta):** extrair `ShareDomainModule` (tokens, validação de password, limites) importado por ambos.
- **Código Atual:**
  ```ts
  // share.module.ts
  imports: [JwtModule.register({}), EmailModule, forwardRef(() => FileModule), forwardRef(() => DownloadLogModule), SystemModule],
  // file.module.ts
  imports: [JwtModule.register({}), EmailModule, ShareModule, DownloadLogModule],
  ```
- **Código Sugerido:**
  ```ts
  // ambos passam a importar o módulo de domínio
  imports: [JwtModule.register({}), EmailModule, ShareDomainModule, SystemModule],
  ```
- **Benefícios:** quebra o ciclo; testes isolados; permite extração de pacote. **Riscos:** refatoração média; regressão possível em rotas de share/download. **Compatibilidade:** sem mudança de API.

**ARQ-02 — God class `ShareService` (772 LOC / 27 métodos)**

- **Localização:** `backend/src/share/share.service.ts`.
- **Evidência:** `create()` ~65 linhas (l.49), `createZip()` ~75 (l.114), `complete()` ~75 (l.190), `increaseViewCount()` ~60 (l.551), `getShareToken()` ~70 (l.638).
- **Situação Atual:** responsabilidades de ciclo de vida, ZIP, views, tokens, segurança concentradas em uma classe.
- **Implementação (proposta):** decompor em `ShareLifecycleService`, `ShareZipService`, `ShareViewService`, `ShareTokenService`, `ShareSecurityService`, mantendo `ShareService` como fachada fina.
- **Benefícios:** coesão, testes isolados, mudanças localizadas. **Riscos:** esforço Alto–Muito Alto (4h–1dia+); regressão em DI dos controllers. **Compatibilidade:** sem mudança de API.

**ARQ-03 — Util `date.util.ts` duplicado e divergente**

- **Localização:** `backend/src/utils/date.util.ts` (47 LOC) vs `frontend/src/utils/date.util.ts` (59 LOC).
- **Evidência:** backend exporta `parseRelativeDateToAbsolute`/`isEpochZero` (inexistentes no frontend); frontend exporta `getExpirationPreview` e configura `dayjs.locale("pt-br")` (inexistentes no backend). Nenhum pacote `shared/`.
- **Situação Atual:** drift manual entre implementações; risco de formatos inconsistentes.
- **Implementação (proposta):** criar pacote `shared/` com o util e tipagens (`Timespan`), importado por ambos. Monorepo já existente viabiliza.
- **Benefícios:** fonte única; elimina drift. **Riscos:** ajuste de imports em ~10 arquivos. **Compatibilidade:** interna.

**ARQ-04 — Boilerplate repetido de guardas**

- **Localização:** `share.controller.ts` (13 `@UseGuards`), `user.controller.ts` (8), e demais controllers protegidos.
- **Evidência:** `app.module.ts:65-82` já registra a cadeia global `APP_GUARD` (Throttler → Jwt → Roles → PasswordMustChange); decorators explícitos redundantes.
- **Situação Atual:** dupla aplicação e risco de esquecimento de `@Roles` em endpoint sensível.
- **Implementação (proposta):** confiar na cadeia global e criar decorators compostos (`@AdminOnly()`, `@ShareOwner()`).
- **Benefícios:** remove redundância; reduz erro humano. **Riscos:** mudança transversal (~7 arquivos); exige testes de integração. **Compatibilidade:** sem mudança de API.

### 1.4 Classificação Risco × Impacto × Esforço

| ID | Achado | Risco | Impacto | Esforço | Quick Win |
|---|---|---|---|---|---|
| ARQ-01 | Dependência circular | Alto | Manutenibilidade | Alto | ❌ |
| ARQ-02 | God class `ShareService` | Alto | Manutenibilidade | Muito Alto | ❌ |
| ARQ-03 | `date.util.ts` duplicado | Médio | Manutenibilidade | Médio | ✅ |
| ARQ-04 | Boilerplate de guardas | Médio | Manutenibilidade | Médio | ✅ |

### 1.5 Recomendações Prioritárias

1. **ARQ-01** — extrair módulo de domínio para eliminar o ciclo (bloqueia evolução modular).
2. **ARQ-02** — decompor `ShareService` em 5 serviços coesos mantendo a fachada.
3. **ARQ-03** — criar pacote `shared/` e migrar o util de datas (quick win).
4. **ARQ-04** — consolidar guardas na cadeia global `APP_GUARD` (quick win).

### 1.6 Notas de Execução

- Correções arquiteturais **propostas, não aplicadas** (escopo da Fase 12 — Refatoração).
- Pontos de acompanhamento em fases específicas: `File.size` como `String` (Fase 4), uso de `any` em `get()` (Fase 2), cadeia de guardas (Fase 6).

## 2. Fase 2 — Auditoria de Backend

**Status:** ✅ Concluída | **Documento detalhado:** `docs/auditoria/FASE-2-BACKEND.md`

### 2.1 Escopo

Qualidade de código do backend NestJS (tipagem, tratamento de exceções, casos de borda, lógica de serviços/controllers, agendamentos, auditoria), com foco em `any`/`parseInt`/throttling e fluxos sensíveis (reset de senha, sign-out, jobs, download-log).

### 2.2 Sumário de Achados

| ID | Severidade | Resumo |
|---|---|---|
| BKD-01 | 🔴 Alto | `resetPassword()` não valida a expiração do token (inconsistente com `verifyAccount`) |
| BKD-02 | 🟡 Médio | Tipos `any` difusos em `ConfigService.get()` e `ShareService.get()` |
| BKD-03 | 🟡 Médio | `parseInt` sem guarda de NaN em tamanhos/limites; `File.size` como `String` |
| BKD-04 | 🟡 Médio | Trilha de auditoria com falha engolida em `DownloadLogService.record()` |
| BKD-05 | 🟡 Médio | `ThrottlerExceptionFilter` com `Retry-After` fixo em 60 s (ttl real de 300 s) |
| BKD-06 | 🟢 Baixo | Jobs de expiração sem transação — risco de órfãos disco/banco |
| BKD-07 | 🟢 Baixo | `signOut()` usa `jwtService.decode()` sem verificação de assinatura |
| BKD-08 | 🟢 Baixo | `ConfigService.get()` lança `Error` puro (500 genérico se exposto a HTTP) |

### 2.3 Análise Detalhada (destaques)

**BKD-01 — `resetPassword()` não valida expiração do token** (`auth.service.ts:175-193`)

- Token criado com `expiresAt: +1h` (l.166), mas o consumo checa apenas a existência. `verifyAccount()` (l.195-204) valida `activationTokenExpiresAt`; `resetPassword()` não — token vencido segue utilizável até o cron horário limpar.
- **Código Atual:** `where: { resetPasswordToken: { token } }` sem filtro de data.
- **Código Sugerido:** `where: { resetPasswordToken: { token, expiresAt: { gt: new Date() } } }`.
- **Benefícios:** validade real do token; paridade com verificação de conta. **Riscos:** nenhum funcional relevante. **Compatibilidade:** sem mudança de API.
- **Esforço:** Muito Baixo (1 linha) — **Quick Win**.

**BKD-02 — Tipos `any` difusos** (`config.service.ts:103`, `share.service.ts:304`)

- `get(key): any` e `get(id): Promise<any>` desligam o type-checker; erros só em runtime. Proposta: `get<T>(key): T` e tipo de contrato no retorno de `ShareService.get()`.
- **Riscos:** ajuste de ~40 call sites. **Compatibilidade:** apenas assinaturas TS.

**BKD-03 — `parseInt` sem guarda de NaN** (`share.service.ts:135`, `local.service.ts:121-143`)

- `NaN` em comparações `>` é `false` — limites de zip-bomb, tamanho total e por arquivo podem ser contornados silenciosamente se um `size` estiver corrompido. Proposta: helper `toSafeNumber` + migrar `File.size` para numérico (Fase 4).

**BKD-04 — Falha engolida na auditoria** (`download-log.service.ts:38-65`)

- `record()` faz `catch` + `warn` e retorna sucesso; evento `download|view|upload|delete` perdido sem retry. Requisito central do produto. Proposta: retry único com backoff + log estruturado/métrica.

**BKD-05 — `Retry-After` fixo em 60 s** (`throttler-exception.filter.ts:13`)

- 4 rotas públicas usam ttl de 300 s; header/mensagem informam 60 s. Proposta: derivar tempo real do storage.

**BKD-06/07/08** — Ordem de exclusão em jobs (órfãos), `verify()` no sign-out, exceção Nest na config — correções de robustez e coerência (Baixos).

### 2.4 Fortalezas da Fase 2 (não são achados)

- Upload defensivo: magic bytes no chunk final (GAP-01), allow-list MIME (MED-06), checagem de disco por chunk, limites por arquivo/total.
- Proteção zip-bomb configurável (GAP-04): `zipMaxFiles`, `zipMaxTotalSize`, `zipMaxRatio`, cap de bytes com abort.
- Throttling global + `@Throttle` por rota; CSRF double-submit; JWT rotation; correlação de logs via AsyncLocalStorage.
- `touchShare()` com throttle (5 min) e cooldown de notificação (15 min) — protege o SQLite de writes excessivos.

### 2.5 Classificação Risco × Impacto × Esforço

| ID | Achado | Risco | Impacto | Esforço | Quick Win |
|---|---|---|---|---|---|
| BKD-01 | Reset de senha sem checagem de expiração | Alto | Segurança | Muito Baixo | ✅ |
| BKD-02 | Tipos `any` difusos | Médio | Manutenibilidade | Médio | ❌ |
| BKD-03 | `parseInt` sem guarda de NaN | Médio | Segurança | Médio | ⚠️ parcial |
| BKD-04 | Falha engolida na trilha de auditoria | Médio | Disponibilidade | Médio | ❌ |
| BKD-05 | `Retry-After` fixo 60 s | Médio | Disponibilidade | Muito Baixo | ✅ |
| BKD-06 | Jobs de expiração sem transação | Baixo | Disponibilidade | Médio | ❌ |
| BKD-07 | `decode()` sem verificação no sign-out | Baixo | Manutenibilidade | Baixo | ✅ |
| BKD-08 | `Error` puro na config | Baixo | Manutenibilidade | Muito Baixo | ✅ |

### 2.6 Recomendações Prioritárias

1. **BKD-01** (Alto, Quick Win) — validar `expiresAt` no reset de senha.
2. **BKD-03** — helper `toSafeNumber` nos pontos de limite; prepara migração de `File.size` (Fase 4).
3. **BKD-05** (Quick Win) — `Retry-After` derivado do ttl real.
4. **BKD-04** — retry + log estruturado na trilha de auditoria.
5. **BKD-02** — tipar `ConfigService.get<T>()` e `ShareService.get()`.
6. **BKD-06/07/08** — robustez e coerência (Baixos).

### 2.7 Notas de Execução

- Correções **propostas, não aplicadas** (escopo da Fase 12 — Refatoração / plano da Fase 13).
- **Referências cruzadas:** `File.size` como `String` → Fase 4; throttling/CSRF/signOut → Fase 5; `parseInt`/queries → Fase 6; `any`/LOC → Fase 7.

---

## 3. Fase 3 — Auditoria de Frontend

**Status:** ✅ Concluída | **Documento detalhado:** `docs/auditoria/FASE-3-FRONTEND.md`

### 3.1 Escopo

Qualidade de código do frontend Next.js (Pages Router + Mantine): gating de rotas/autenticação, estados de módulo e ciclo de vida de upload, tipagem (`any`/casts), parsing de limites vindos de config, i18n, acessibilidade e padrões React/Next.

### 3.2 Sumário de Achados

| ID | Severidade | Resumo |
|---|---|---|
| FRN-01 | 🔴 Alto | Gating de rotas decodifica JWT sem verificar assinatura (`jwtDecode`) |
| FRN-02 | 🔴 Alto | Estado módulo-level + `Promise.all` não aguardado no upload (órfãos) |
| FRN-03 | 🟡 Médio | `parseInt` sem guarda de NaN em limites vindos de config `any` |
| FRN-04 | 🟡 Médio | Tipos `any` generalizados (~55 usos) |
| FRN-05 | 🟡 Médio | Fallback de config silencioso + potencial loop de `location.reload()` |
| FRN-06 | 🟡 Médio | `user-scalable=no` bloqueia zoom (WCAG 1.4.4/1.4.10) |
| FRN-07 | 🟡 Médio | Preview de PDF via `window.location.href` (perde overlay/contexto) |
| FRN-08 | 🟡 Médio | Categorias de config inconsistentes (page capitalizada vs. serviço minúsculo) |
| FRN-09 | 🟢 Baixo | `target="_blank"` sem `rel="noopener noreferrer"` |
| FRN-10 | 🟢 Baixo | Strings hardcoded em inglês (i18n incompleto) |
| FRN-11 | 🟢 Baixo | Keys de listas por índice (desalinhamento de estado) |
| FRN-12 | 🟢 Baixo | Mutação de props por referência |

### 3.3 Análise Detalhada (destaques)

**FRN-01 — JWT decodificado sem verificação de assinatura** (`middleware.ts:56`)

- `jwtDecode()` apenas decodifica base64 + checa `exp`; `role`/`isAdmin` são usados no gating de UI. Cookie forjado localmente expõe rotas admin na UI (backend segue como fonte de verdade).
- **Código Atual:** `jwtDecode<{ exp?: number; role?: string; isAdmin?: boolean }>(token)`.
- **Código Sugerido:** `jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET))` (jose), rejeitando assinatura inválida com `signOutRedirect()`.
- **Benefícios:** defesa em profundidade no gating. **Riscos:** requer `JWT_SECRET` compartilhado. **Compatibilidade:** sem mudança de API. **Esforço:** Médio.

**FRN-02 — Estado módulo-level + upload não finalizado** (`upload/index.tsx:26-28,166`)

- `let createdShare`/`let pendingGeneratedPassword`/`let errorToastShown` persistem entre navegações client-side (singleton de módulo); `Promise.all(fileUploadPromises)` sem `await`/`catch` → finalização depende de `useEffect`, podendo orfanar share incompleto no backend e suprimir toasts.
- **Código Sugerido:** mover para `useState`/`useRef` e `await Promise.all` com `try/catch`, completando no handler (padrão já usado em `EditableUpload.tsx:144`).
- **Esforço:** Médio.

**FRN-03 — `parseInt` sem guarda de NaN** (`upload/index.tsx:70-74,187` e mais 8 pontos)

- `Math.min(maxShareSize, parseInt(user.shareSizeLimit))` → `NaN` quando `shareSizeLimit` é `undefined`; comparações com `NaN` são `false` → limite desativado silenciosamente. Espelho do BKD-03.
- **Código Sugerido:** helper `toSafeNumber(value, fallback)` em 11 pontos. **Esforço:** Baixo — **Quick Win**.

**FRN-05 — Loop potencial de reload por idioma** (`_app.tsx:357, 212-218`)

- `getDefaultConfig()` sem flag de erro + `location.reload()` quando `pageProps.language !== cookieLanguage` → com API indisponível (default `pt-BR`) e cookie ≠ `pt-BR`, reload infinito.
- **Código Sugerido:** flag `configFetchFailed` + sincronizar idioma via estado. **Esforço:** Baixo — **Quick Win**.

**FRN-06/09/10/11/12** — zoom bloqueado (WCAG), `rel="noopener noreferrer"`, strings em inglês, keys por índice, mutação de props: quick wins de baixo esforço.

### 3.4 Fortalezas da Fase 3 (não são achados)

- Upload defensivo: chunk retry por índice, `pLimit(3)`, `setFileProgress`, upload de pasta via `webkitdirectory` com guard de feature.
- IDs/senhas via `crypto.getRandomValues` (CSPRNG); `generateAvailableLink` com checagem de disponibilidade.
- `isValidId` em rotas de share/file; download via fetch same-origin com parse de `Content-Disposition` e erro JSON.
- Probe antes de montar mídia (`useFileProbe`) + contagem de views por play com guard anti-loop (`useRecordPlayView`).
- Sanitização de redirect pós-alteração de senha (`change-password.tsx:55-58` — anti open-redirect).
- `MarkdownRenderer` com DOMPurify estrito; API com CSRF + retry; i18n completo com `pt-BR` default.

### 3.5 Classificação Risco × Impacto × Esforço

| ID | Achado | Risco | Impacto | Esforço | Quick Win |
|---|---|---|---|---|---|
| FRN-01 | JWT sem verificação no middleware | Alto | Segurança | Médio | ⚠️ parcial |
| FRN-02 | Estado módulo-level + `Promise.all` não aguardado | Alto | Disponibilidade | Médio | ❌ |
| FRN-03 | `parseInt` sem guarda de NaN | Médio | Segurança | Baixo | ✅ |
| FRN-04 | Tipos `any` generalizados | Médio | Manutenibilidade | Médio | ❌ |
| FRN-05 | Fallback de config + loop de reload | Médio | Disponibilidade | Baixo | ✅ |
| FRN-06 | `user-scalable=no` (WCAG) | Médio | Acessibilidade | Muito Baixo | ✅ |
| FRN-07 | Preview de PDF via `window.location.href` | Médio | Usabilidade | Médio | ❌ |
| FRN-08 | Categorias de config inconsistentes | Médio | Manutenibilidade | Baixo | ✅ |
| FRN-09 | `target="_blank"` sem `rel` | Baixo | Segurança | Muito Baixo | ✅ |
| FRN-10 | Strings hardcoded em inglês | Baixo | Manutenibilidade | Muito Baixo | ✅ |
| FRN-11 | Keys de listas por índice | Baixo | Manutenibilidade | Baixo | ✅ |
| FRN-12 | Mutação de props por referência | Baixo | Manutenibilidade | Baixo | ✅ |

### 3.6 Recomendações Prioritárias

1. **FRN-01** (Alto) — `jwtVerify` no middleware (defesa em profundidade).
2. **FRN-02** (Alto) — estado de upload no componente + `await Promise.all` com finalização no handler.
3. **FRN-05** (Quick Win) — flag de falha da config + idioma sem reload forçado.
4. **FRN-03** (Quick Win) — `toSafeNumber` nos pontos de limite.
5. **FRN-06/09/10/11/12** — acessibilidade e quick wins.
6. **FRN-08** — unificar categorias de config.
7. **FRN-04** — `config.get<T>()` + contratos de share tipados.

### 3.7 Notas de Execução

- Correções **propostas, não aplicadas** (escopo da Fase 12 — Refatoração / plano da Fase 13).
- **Referências cruzadas:** `parseInt`/`any` → espelho de BKD-02/BKD-03; `File.size` String → Fase 4; CSRF/signOut/throttle → Fase 5; queries/performance → Fase 6; `any`/LOC → Fase 7; dependências (jwt-decode, jose) → Fase 8.

---

## 4. Fase 4 — Auditoria de Banco de Dados

> **Artefato:** `docs/auditoria/FASE-4-DATABASE.md` • **Status:** ✅ Concluída • **Data:** 2026-08-04

### 4.1 Escopo

Modelagem Prisma/SQLite (tipos, constraints, índices), integridade/normalização, consultas (paginação, transações, N+1) e performance dos caminhos de leitura/escrita e dos jobs de manutenção.

### 4.2 Sumário de Achados

| ID | Severidade | Achado | Localização |
|---|---|---|---|
| BDB-01 | 🔴 Alto | `File.size` e `User.shareSizeLimit` armazenados como `String` (raiz do `NaN` BKD-03/FRN-03) | `schema.prisma:106,21`; `local.service.ts:121-130` |
| BDB-02 | 🟡 Médio | Índices ausentes nos caminhos quentes (expiration, creatorId, File.shareId, recipient, tokens, isActivated) | `schema.prisma`; `jobs.service.ts` |
| BDB-03 | 🟡 Médio | Listagens de shares sem paginação e com `include` pesados | `share.service.ts:272-301` |
| BDB-04 | 🟡 Médio | Crons de limpeza com exclusões um-a-um sem transação (consistência disco↔banco) | `jobs.service.ts:35-86,170-188` |
| BDB-05 | 🟡 Médio | Sentinela `EPOCH_ZERO` para "nunca expira" + `ShareSecurity` 1:1 opcional | `date.util.ts:15,18`; `share.service.ts:291,516` |
| BDB-06 | 🟢 Baixo | `ShareRecipient` sem `@@unique(shareId, email)` → duplicatas/e-mails repetidos | `schema.prisma:93-99` |

**Total:** 6 achados (1 Alto, 4 Médios, 1 Baixo).

### 4.3 Análise Detalhada (destaques)

**BDB-01 — `File.size`/`shareSizeLimit` como `String`.** O tamanho é persistido como texto; cada leitura faz `parseInt` e recalcula a soma a cada chunk via `reduce` (`local.service.ts:121-130`). Um valor não numérico gera `NaN` e limites podem ser ignorados silenciosamente; agregações (`SUM`) são inviáveis. **Proposta:** migrar para `Int`/`BigInt` com saneamento de dados.

**BDB-02 — Índices ausentes.** `Share.expiration` é filtrado pelo cron a cada minuto (`jobs.service.ts:35-43`) e usado em `orderBy` (`share.service.ts:274,295`); `File.shareId` é varrido a cada chunk (include em `local.service.ts:78-81`); `RefreshToken/LoginToken/ResetPasswordToken.expiresAt` são filtrados a cada hora; `User.isActivated` no cron. **Proposta:** `@@index([expiration])`, `@@index([creatorId, uploadLocked, expiration])`, `@@index([shareId])` (File e Recipient), `@@index([expiresAt])` (3 tokens), `@@index([isActivated, createdAt])`.

**BDB-03 — Sem paginação.** `getShares()`/`getSharesByUser()` (`share.service.ts:272-301`) carregam todos os registros com todas as relações. **Proposta:** paginação por cursor (`take`/`cursor`) + `select` mínimo.

**BDB-04 — Crons não atômicos.** `deleteExpiredShares`/`deleteUnfinishedShares`/`deleteUnactivatedUsers` deletam um-a-um (fs + banco) em laço sem transação; falha no meio deixa arquivos órfãos. **Proposta:** `$transaction` + `deleteMany` em lotes + `select: { id: true }`.

**BDB-05 — Sentinela `EPOCH_ZERO`.** `expiration = Date(0)` representa "nunca expira" em vez de nullable, espalhando `{ not/equals: EPOCH_ZERO }` em 3 arquivos; `ShareSecurity` é `String? @unique` embora sempre criado. **Proposta:** `expiresAt DateTime?` (null = nunca) e 1:1 obrigatória.

**BDB-06 — Duplicatas de destinatário.** Sem `@@unique([shareId, email])`, um e-mail pode receber N notificações. **Proposta:** unique composto + deduplicação prévia.

### 4.4 Fortalezas da Fase 4 (não são achados)

- `DownloadLog` com 5 índices e denormalização intencional (imutabilidade da trilha de auditoria).
- Config inteira em memória (`CONFIG_VARIABLES`) com reload via `findMany()` apenas em `update`.
- Contadores `views`/`downloads` atômicos (`increment`) com condição de limite.
- PKs UUID, `onDelete: Cascade`, `ResetPasswordToken.userId @unique`, throttle de `touchShare`.
- Migrations versionadas com backfills (ex.: `requestId` nullable).

### 4.5 Classificação Risco × Impacto × Esforço

| ID | Achado | Risco | Impacto | Esforço | Quick Win |
|---|---|---|---|---|---|
| BDB-01 | `File.size`/`shareSizeLimit` como `String` | Alto | Segurança | Alto | ❌ |
| BDB-02 | Índices ausentes | Médio | Performance | Baixo | ✅ |
| BDB-03 | Listagens sem paginação | Médio | Performance | Médio | ⚠️ parcial |
| BDB-04 | Crons um-a-um sem transação | Médio | Disponibilidade | Médio | ❌ |
| BDB-05 | Sentinela `EPOCH_ZERO` + 1:1 opcional | Médio | Manutenibilidade | Médio | ⚠️ parcial |
| BDB-06 | Recipient sem unique composto | Baixo | Disponibilidade | Muito Baixo | ✅ |

### 4.6 Recomendações Prioritárias

1. **BDB-02** (Quick Win) — índices nos caminhos quentes.
2. **BDB-01** (Alto) — `File.size`/`shareSizeLimit` → `Int/BigInt`.
3. **BDB-04** — jobs de limpeza transacionais e em lotes.
4. **BDB-03** — paginação por cursor nas listagens.
5. **BDB-05** — `expiresAt` nullable + `ShareSecurity` 1:1 obrigatória.
6. **BDB-06** — `@@unique([shareId, email])`.

### 4.7 Notas de Execução

- Correções **propostas, não aplicadas** (escopo da Fase 12 — Refatoração / plano da Fase 13).
- **Referências cruzadas:** BDB-01 ↔ BKD-03 (Fase 2) e FRN-03 (Fase 3); BDB-04 ↔ BKD-06 (Fase 2); BDB-02/BDB-03 → Fase 6 (performance); queries/`any` → Fase 7.
- **Próxima etapa:** Fase 13 — Plano de Execução (artefatos finais: REFACTORING_PLAN, ROADMAP, TECH_DEBT, SECURITY_REPORT, etc.).

---

## 13. Fase 13 — Plano de Execução e Sumário Executivo

### 13.1 Resumo Executivo e Nota Geral

A auditoria completa (Fases 0–12) consolidou **75 achados** em 11 domínios. Os problemas mais graves são **causas raiz de design**, não sintomas isolados:

1. **JwtGuard fail-open** (SEC-01) — rota protegida sem token pode ser liberada por erro transitório.
2. **`File.size`/`shareSizeLimit` como `String`** (BDB-01) — `NaN` em `parseInt` ignora cotas.
3. **Zero testes e sem CI** (QAL-01/QTS-01) — toda mudança futura é não-regressão-assistida.
4. **Deploy de produção quebrado** (DOP-01/03/05) — frontend inalcançável, Caddy sem env real.

As fortalezas arquiteturais (modularidade, guards segmentados, física de arquivos segura, auditoria imutável) mantêm o **esqueleto sólido**; os pontos fracos são corrigíveis de forma incremental sem reescrita.

**Nota Geral (consolidada): 35/100** — média aritmética das notas de categoria formalizadas (Testabilidade **18**, Documentação **40**, Manutenibilidade **41** → ≈33) com ajuste qualitativo pelas fortalezas arquiteturais (+2). As categorias Arquitetura/Segurança/Performance/Qualidade não foram pontuadas numericamente nas fases correspondentes; sua avaliação é qualitativa nas seções 1, 2, 3, 4 deste relatório e detalhada nos artefatos `ARCHITECTURE_REVIEW.md` e `SECURITY_REPORT.md`.

### 13.2 Tabela de Prioridades de Problemas

| Prioridade | Achados-chave | Esforço | Depende de |
|---|---|---|---|
| **P0** | SEC-01 (fail-open), BDB-01 (String→BigInt), DOC-01 (refs README), DOC-02 (SECURITY stub) | S/M/L | R07 (testes) p/ BDB-01 |
| **P1** | PERF-01 (paginação), QTS-01/02/04 (testes+CI), INF-01 (postcss), DOP-01/05 (deploy), SEC-03/05 | S/M | — |
| **P2** | ARQ-02 (god class), PERF-02/03/06, BDB-02/04, SEC-02/04/07, QAL-03, DOC-03/04/05 | M | R07, R01 |
| **P3** | FRN-06/09/10/11, PERF-05/07, BDB-05/06, DOP-06/07/08, QTS-05/06/07 | Baixo | — |

### 13.3 Quick Wins (melhorias < 30 min)

Override `postcss` → 8.5.22+ (INF-01); `engines`+`.nvmrc` (INF-02); tags de imagem fixas (DOP-06); `.dockerignore` com `secrets/`/`.env*` (DOP-07); `rel="noopener noreferrer"` (FRN-09); remover `user-scalable=no` (FRN-06); `license`/`repository` (DOC-04); `.env.local.example` completo (DOC-05); índices nos caminhos quentes (BDB-02); health check barato (PERF-07); `@@unique(shareId, email)` (BDB-06).

### 13.4 Refatorações Prioritárias (top 5 impactos)

| # | Refatoração | Impacto | Fase 12 |
|---|---|---|---|
| 1 | **R07 — Testes + CI** | Desbloqueia todo o resto | R07 |
| 2 | **R02 — JwtGuard fail-closed** | Segurança crítica | R02 |
| 3 | **R01 — `File.size` → `BigInt`** | Dados/cota correta | R01 |
| 4 | **R08 — Correções Docker/Caddy** | Deploy de produção funcional | R08 |
| 5 | **R03 — Paginação** | Escala/performance | R03 |

### 13.5 Plano de Evolução (curto/médio/longo)

- **Curto (0–1 mês):** testes+CI (R07), fail-closed (R02), BigInt (R01), deploy (R08), reset token TTL (SEC-03), `SECURITY.md` (DOC-02), paginação (R03).
- **Médio (1–3 meses):** HTTP Range 206 (PERF-06), jobs em lote (R04), config tipada (R06), decisão ClamAV (SEC-02), órfãs de deps (INF-03), README (DOC-01).
- **Longo (3–6 meses):** decomposição do `ShareService` (R05), refresh atômico (SEC-07), secret manager, migração SQLite→PostgreSQL se o volume exigir, observabilidade, API versionada.

### 13.6 Artefatos Finais Entregues (Fase 13)

Localizados em `docs/auditoria/relatorios/`:

1. `AUDIT_REPORT.md` — este relatório principal (Índice de Fases l.30-44; Fases 0–4 detalhadas; Fases 5–13 no índice).
2. `SECURITY_REPORT.md` — relatório de segurança dedicado (SEC-01..08 + correlatos).
3. `PERFORMANCE_REPORT.md` — relatório de performance (PERF-01..07 + BDB-02/03).
4. `TECH_DEBT.md` — documento de dívida técnica (ARQ/BKD/FRN/BDB/QAL/DOC).
5. `REFACTORING_PLAN.md` — plano de refatoração detalhado (épicos R01–R08).
6. `ROADMAP.md` — roteiro de evolução (quick wins + curto/médio/longo).
7. `CHANGELOG_SUGERIDO.md` — sugestão de changelog (v1.1.0 → v1.3.0).
8. `DEPENDENCY_AUDIT.md` — auditoria de dependências (INF-01..04).
9. `TEST_PLAN.md` — plano de testes (estratégia + cenários + CI).
10. `ARCHITECTURE_REVIEW.md` — revisão arquitetural (atual × alvo).

### 13.7 Notas de Execução

- **Nenhuma alteração de código foi aplicada em toda a auditoria** — os 75 achados foram diagnosticados e priorizados; a execução fica para o time, seguindo `REFACTORING_PLAN.md` e o processo controlado da Especificação-final.
- **Próximo passo do time:** implementar R07 (testes+CI) e R02/R01 (segurança/dados), validando cada mudança por PR com CI verde.
- **Acompanhamento:** reauditoria de segurança trimestral; atualizar `CHANGELOG_SUGERIDO.md` a cada merge.

---

## Conclusões (consolidadas)

1. O projeto tem **esqueleto arquitetural sólido** (modular, guards segmentados, física de arquivos segura, trilha de auditoria imutável), mas **3 causas-raiz de design** concentram o risco: guard global fail-open (SEC-01), `File.size`/`shareSizeLimit` como `String` (BDB-01) e **zero testes/CI** (QAL-01/QTS-01).
2. O deploy de produção é **inatendível como configurado** (frontend inalcançável DOP-01, Caddy sem env DOP-05, `DATABASE_URL` fora do volume) — corrigir é pré-requisito para qualquer operação real.
3. **Nota geral: 35/100** — média das notas formalizadas (Testabilidade 18, Documentação 40, Manutenibilidade 41) com ajuste qualitativo; as demais categorias são avaliadas qualitativamente (seções 1–4).
4. Não há justificativa para reescrita: os 75 achados são corrigíveis de forma **incremental e preservando APIs**, na ordem R07→R02→R01→R08→R03→R04→R06→R05.

## Recomendações (consolidadas)

1. **Primeiro lote (v1.1.0, 0–1 mês):** testes+CI (R07), fail-closed (R02), `BigInt` (R01), correções de deploy (R08), reset-token TTL (SEC-03), `SECURITY.md` (DOC-02), paginação (R03).
2. **Segundo lote (v1.2.0):** HTTP Range 206 (PERF-06), jobs em lote (R04), config tipada (R06), decisão ClamAV (SEC-02), órfãs de dependências (INF-03), README (DOC-01).
3. **Terceiro lote (v1.3.0):** decomposição do `ShareService` (R05), refresh atômico (SEC-07), secret manager, migração SQLite→PostgreSQL se o volume exigir, observabilidade.
4. **Governança:** PR com CI verde e changelog a cada mudança; reauditoria de segurança trimestral; manter `ROADMAP.md` e `CHANGELOG_SUGERIDO.md` vivos.
5. Detalhamento operacional em `REFACTORING_PLAN.md` (tarefas/aceite), `TEST_PLAN.md` (cobertura ≥60%) e `ROADMAP.md` (horizontes).
