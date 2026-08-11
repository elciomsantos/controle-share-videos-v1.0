# ARCHITECTURE REVIEW — Controle Share Videos v1.0

> **Fase 2**: Revisão arquitetural
> **Data**: 2026-08-10
> **Auditor**: Opencode (agente automatizado)
> **Referência**: `backend/src/`, `frontend/src/`, `packages/shared/`

---

## 1. Visão Arquitetural

```
┌──────────────────────────────────────────────────────────────┐
│                    Caddy (Reverse Proxy)                     │
│           TLS, HSTS, filtro pwd=, rate limit edge            │
└──────────────┬───────────────────────────────┬───────────────┘
               │                                │
   ┌───────────▼───────────┐         ┌──────────▼──────────────┐
   │   Backend (NestJS 11) │         │  Frontend (Next.js 16)   │
   │                       │         │                          │
   │  • Guards globais     │◄─JWT───►│  • middleware.ts (jose)  │
   │    (Throttler, Jwt,   │         │  • pages router           │
   │     Roles, PwdChange)  │         │  • Mantine 9             │
   │  • Auth: argon2,       │         │  • concurrency.ts         │
   │    rotação JWT híbrida │         │  • shareId.util.ts       │
   │  • Share: descomposto  │         └──────────────────────────┘
   │    (R05)               │
   │  • Jobs: batching (R04)│
   │  • Config: tipado (R06) │
   └───────────┬───────────┘
               │
   ┌───────────▼───────────┐
   │   SQLite (Prisma 6)    │
   │   10 models, WAL mode  │
   └───────────────────────┘
```

---

## 2. Camadas do Backend (NestJS)

### 2.1 Guards Globais
- **ThrottlerGuard** — rate limiting global
- **JwtGuard** (fail-closed) — negação por padrão se token inválido/ausente
- **RolesGuard** — RBAC com papéis ADMIN, AUDITOR, OPERATOR, USER
- **PasswordMustChangeGuard** — força troca de senha no primeiro acesso

### 2.2 Decorators de Autorização
- `@Public()` — rota pública (bypassa JWT)
- `@Authenticated()` — qualquer usuário autenticado
- `@AdminOnly()` — somente ADMIN
- `@AdminOrAuditor()` — ADMIN ou AUDITOR
- `@OperatorOrAbove()` — OPERATOR, AUDITOR ou ADMIN

### 2.3 Módulos Principais
| Módulo | Responsabilidade | Refatoração |
|---|---|---|
| `auth/` | Login, refresh, logout, verificação JWT | R01 ✅ (Login/Token/Refresh/Verification) |
| `config/` | ConfigService tipado, JwtSecretService (rotação) | R06 ✅ |
| `share/` | CRUD de shares, arquivamento, storage | R05 ✅ |
| `jobs/` | Limpeza de shares expirados, batching | R04 ✅ |
| `upload/` | Upload de arquivos | R02 ✅ |

---

## 3. Rotação JWT Híbrida

**Arquivo**: `backend/src/config/jwt-secret.service.ts`

A rotação JWT usa estratégia **híbrida (kid + timeline)**:
1. Cada chave possui um `kid` (key id) único
2. Token inclui `kid` no header para identificação
3. Backend mantém `Map<kid, secret>` em cache para verificação rápida
4. Rotação por timeline (expiração configurada)
5. Mutex protege o estado durante rotação
6. Segredos armazenados com AES-256-GCM

**Veredito**: Implementação sólida e defensável. A rotação híbrida permite descontinuar chaves antigas sem invalidar tokens em circulação.

---

## 4. Decomposição do ShareService (R05)

**Antes**: `ShareService` monolítico com lógica de CRUD + mapping + arquivamento + storage.

**Depois** (R05 ✅):
- `ShareService` — orquestração e CRUD
- `ShareMapper` — transformação DTO ↔ Entity
- `ShareArchiveService` — arquivamento e expiração
- `FileStorageService` — abstração de filesystem/storage

**Veredito**: Separação de responsabilidades bem definida. Reduz acoplamento e facilita testes.

---

## 5. Frontend

### 5.1 Middleware JWT
**Arquivo**: `frontend/src/middleware.ts`
- Usa `jose` para verificação JWT no edge
- Rotas públicas mapeadas explicitamente (`/login`, `/`, `/api/...`)
- Demais rotas exigem token válido

### 5.2 Concorrência de Upload
**Arquivo**: `frontend/src/utils/concurrency.ts`
- `UPLOAD_CONCURRENCY = 3` (máx. 3 uploads paralelos por usuário)
- `createUploadLimiter()` — factory de rate limiter

### 5.3 Geração de IDs
**Arquivo**: `frontend/src/utils/shareId.util.ts`
- `generateShareId()` — ID do share
- `generateAvailableLink()` — link único
- `generateRandomPassword()` — senha aleatória para share

### 5.4 `_app.tsx`
- `pageProps.language` consumido diretamente, **sem `useRef(language)`** (QAL-06 ✅)

---

## 6. Monorepo

- `packages/shared` — tipos e constantes compartilhadas entre backend e frontend via pnpm workspaces
- Evita duplicação de tipos TypeScript e garante consistência de contratos

---

## 7. Fluxo de Dados

```
1. Usuário → Frontend (Next.js)
2. Frontend → Caddy (TLS, HSTS, filtro pwd=)
3. Caddy → Backend (NestJS)
4. Backend → Guards (Throttler → Jwt → Roles → PwdChange)
5. Backend → Service (Share/Auth/Jobs/Upload)
6. Service → Prisma → SQLite
7. Resposta → Frontend (JSON)
8. Jobs assíncronos → Limpeza de shares expirados (batching R04)
```

---

## 8. Achados Arquiteturais

| ID | Achado | Severidade | Status |
|---|---|---|---|
| A-01 | AuthService decomposto (R01) | Média | ✅ OK |
| A-02 | UploadRepository não extraído (R02) | Média | ✅ OK |
| A-03 | ConfigService tipado (R06) | — | ✅ OK |
| A-04 | ShareService decomposto (R05) | — | ✅ OK |
| A-05 | Jobs com batching (R04) | — | ✅ OK |
| A-06 | SQLite sem replica/failover | Alta | Aceito com monitoramento |

### A-01: AuthService decomposto (R01 ✅)
- **Solução**: `AuthService` virou orquestrador fino; extraídos `LoginService` (credenciais + sessão inicial), `TokenService` (emissão de access/refresh/login + cookies), `RefreshService` (rotação SEC-07, signOut, logoutAllDevices) e `VerificationService` (ativação de conta + reset de senha) em `backend/src/auth/service/`.
- **Benefício**: Cada serviço testável isoladamente com mock de Prisma; `TokenService` não depende de banco para assinar access token. 4 specs isolados novos (+31 testes, 109→140).
- **Prioridade**: Média (resolvida)

### A-02: UploadRepository extraído (R02 ✅)
- **Solução**: Interface `IUploadRepository` + `FilesystemUploadRepository` criadas em `backend/src/storage/`. `LocalFileService`, `ShareArchiveService`, `JobsService` e `FileStorageService` injetam a interface via `StorageModule` (token `Symbol`), sem acesso direto a `fs`/`SHARE_DIRECTORY`.
- **Benefício**: Trocar para S3/MinIO = criar `S3UploadRepository` + swap do provider; nenhuma regra de negócio muda.

### A-06: SQLite em produção
- **Problema**: Banco single-file sem replica/failover
- **Evidência**: `docker-compose.prod.yml` usa SQLite volume
- **Risco**: Single point of failure, limite de concorrência (single-writer)
- **Causa**: Decisão de design para simplicidade inicial
- **Prioridade**: Alta (mas aceita com monitoramento)
- **Recomendação**: Documentar limitação, planejar migração para PostgreSQL (ROADMAP)

---

## 9. Conformidade com Princípios

| Princípio | Status | Observação |
|---|---|---|
| Single Responsibility | ✅ | Após R05; R01 e R02 resolvidos |
| Dependency Injection | ✅ | NestJS padrão |
| Fail-closed | ✅ | JwtGuard |
| Least Privilege | ✅ | RBAC fino, non-root container |
| Separation of Concerns | ✅ | Guards, Services, Repos |
| DRY (shared types) | ✅ | packages/shared |
| Defense in Depth | ✅ | Edge + App + DB guards |

---

## 10. Veredito Arquitetural

**Nota**: 7.5/10

Arquitetura sólida e defensável com separação clara de responsabilidades (R05, R01 e R02 resolvidos), guards globais bem encadeados, rotação JWT híbrida madura e monorepo consistente. SQLite é limitação aceitável para escala atual desde que monitorada.

---

*Fim do ARCHITECTURE_REVIEW.md*
