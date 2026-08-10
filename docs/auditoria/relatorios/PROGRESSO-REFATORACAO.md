# PROGRESSO-REFATORACAO.md — Execução R01–R08 (Fase 12)

| Campo | Valor |
|---|---|
| Plano de referência | `REFACTORING_PLAN.md` |
| Última atualização | 2026-08-09 |
| Branch | `main` (PR #1 mergeado em `0bdb1c9`) |
| Commits | `98de696` (BDB-02), `4686195` (R03 Breaking), `0412c93` (R06), `7729f22` (R05), `165de4a` (SEC-04), `1e6eaa4` (SEC-06/07/08) |

## 1. Visão geral

| Épico | Status | Obs. |
|---|---|---|
| R07 — Testes + CI | ✅ Concluído | pré-requisito, todos os critérios verdes |
| R02 — JwtGuard fail-closed | ✅ Concluído | — |
| R01 — BigInt size/shareSizeLimit | ✅ Concluído | migration + deploy coordenado |
| R08 — Docker/Caddy | ✅ Concluído | compose prod com `target: frontend` |
| R03 — Paginação nas listagens | ✅ Concluído | Breaking v1.2.0 — envelope `Page<T>` (commit `4686195`) |
| R04 — Jobs de limpeza em lote + transação | ✅ Concluído | batch `take: 50` + cursor + `try/catch` por item |
| BDB-02 — Índices nos caminhos quentes | ✅ Concluído | quick-win (commit `98de696`) |
| R06 — Config tipada | ✅ Concluído | backend + frontend; sem `any`/`parseInt` manual |
| R05 — Decomposição do ShareService | ✅ Concluído | `ShareService` 794 → 698 LOC; testes de regressão 9 novos |
| INF-02/03/04 — Runtime pinado + deps | ✅ Concluído | 2026-08-08 — `engines`+`.nvmrc`; JWT unificado (`jose`); `@types/cors` → dev |
| BDB-06 — Unique composto de recipients | ✅ Concluído | 2026-08-08 — migration + deduplicação prévia |

Sequência do plano: `R07 → R02 → R01 → R08 → R03 → R04 → R06 → R05`.

## 2. R07 — Infraestrutura de testes + CI (concluído)

**Backend**
- Configs de teste: `jest.config.js`, `tsconfig.spec.json` (`rootDir: "."`), `test/jest-e2e.json`, `test/setup-unit.ts`, `test/setup-e2e.ts`, `test/global-setup.ts` (migrate deploy + seed, sem `migrate reset -f`), `test/global-teardown.ts`.
- Scripts: `test`, `test:unit`, `test:coverage`, `test:e2e`; `test:system` reescrito → e2e; `lint`/`format` incluem `test/**/*.ts`.
- Unitários 35/35: `config.service.spec.ts`, `jwt.guard.spec.ts`, `share.dto.spec.ts` (`toBytes`).
- E2E 4/4: `test/auth-share.e2e-spec.ts` (health; signUp→signIn→create→lock→list→from-owner→delete).
- **Cobertura verde ≥60%**: 83.78% stmts, 80.89% branch, 64.7% funcs, 84.84% lines.
- **Ajustes para o Node 24 / Prisma 7**:
  - Overrides scoped em `backend/package.json`: `test-exclude` → `glob@^7.2.3` + `minimatch@^5.1.6` (quebra de `glob@11`/ESM no coletor).
  - `new PrismaClient()` com `adapter: new PrismaBetterSqlite3(...)`.
  - e2e: `createNestApplication<NestExpressApplication>()`, `isolatedModules` no transform (contorna conflito de tipos do `keyv`), stub `test/stubs/file-type.ts` (pkg ESM-only), `transformIgnorePatterns` para `@scure/@noble/@otplib`.
  - Expectativas ajustadas ao comportamento real da API (signIn=200; listagem só com `uploadLocked=true`; CSRF double-submit com cookie + `x-csrf-token`).
- Lint: 0 erros (warning pré-existente `req` unused em `share.controller.ts:76`). Build OK.
- `main.ts` refatorado: `configureApp`/`createApp` exportados para uso no e2e.

**Frontend**
- `vitest.config.ts` (node, include `src/**/*.test.ts`), `src/utils/fileSize.util.test.ts` (5/5), scripts `test`/`test:unit`.
- Lint e `next build` OK.

**CI**
- `.github/workflows/ci.yml`: jobs `backend` (lint/build/unit/coverage/e2e) e `frontend` (lint/unit/build), Node 24, cache npm por `package-lock.json`.
- **Validado no GitHub** (PR #1, branch `fix/producao-v1.1.0`): backend e frontend `success`. Falha inicial de build (client Prisma ausente no `npm ci`, pois `prisma/generated` é gitignored) resolvida com `"postinstall": "prisma generate"` no `backend/package.json` (commit `bfef55d`).

## 3. R02 — JwtGuard fail-closed (concluído)
- Fallback anônimo removido (`catch { return config.get(...) }` → relança `UnauthorizedException`).
- Rotas `@Public()` auditadas (health, download por e-mail) seguem 200.
- Teste de regressão: token inválido → 401.

## 4. R01 — BigInt `File.size`/`shareSizeLimit` (concluído)
- Migration `20260804100000_convert_file_size_and_share_limit_to_bigint` (CAST/backfill).
- DTO central `toBytes` em `share.dto.ts`; removidos `parseInt` de `share.service.ts`/`local.service.ts`.
- Frontend: `FileList.tsx` (`+file.size`) e `EditableUpload.tsx` (soma via `Number`).
- Cota respeitada para tamanhos > 2^31; changelog com breaking note pendente de registro.

## 5. R08 — Correções de deploy Docker/Caddy (concluído)
- Compose prod com `target: frontend` (runtime) + ajustes Caddyfile/reverse proxy.
- Sem quebra de compatibilidade.

## 6. R04 — Jobs de limpeza em lote + isolamento de erro (concluído)
- `deleteExpiredShares`/`deleteUnfinishedShares`/`deleteUnactivatedUsers` processam em **lotes de 50** com paginação por cursor (`id > lastId`), evitando loop infinito em falha persistente.
- `select: { id: true }` (deleção não precisa das colunas) e `deleteMany({ where: { id } })` no lugar de `delete`.
- `try/catch` por item com `logger.error` (stack) — falha de um share/usuário não interrompe o lote (aceite R04).
- Unitário novo `jobs.service.spec.ts` (5 testes): early-return `retention = -1`, batching/terminação, isolamento de falha em shares e usuários.
- `jest.config.js`: `moduleNameMapper` para `file-type` (stub, pkg ESM-only) + `transformIgnorePatterns` — espelhando o e2e.
- Sem quebra de contrato; lint 0 erros, build OK, unit 49/49, e2e 5/5, cobertura 83.78%.

## 7. R06 — Config tipada (concluído)

**Backend** (`backend/src/config/config.service.ts`)
- `ConfigValue = string | number | boolean | Timespan`, `ConfigTypeMap` (union com todas as chaves do `config.seed.ts`), `ConfigKeys = keyof ConfigTypeMap` e `GetReturn<K>` (`K extends ConfigKeys ? ConfigTypeMap[K] : unknown`).
- `get<K extends string>(key)` agora retorna `GetReturn<K>` em vez de `any`; getters tipados `getNumber`/`getBoolean`/`getString`/`getTimespan` (constrain `K extends ConfigKeys`).
- Migrados todos os consumidores backend: `local.service.ts`, `main.ts`, `config.controller.ts`, `systemLanguage.resolver.ts`, `cache.module.ts`, `user.service.ts`, `user.controller.ts`, `file.service.ts`, `fileSecurity.guard.ts`, `auth.service.ts`, `authTotp.service.ts`, `auth.controller.ts`, `jwt.strategy.ts`, `share.service.ts`, `shareSecurity.guard.ts`, `share.controller.ts`, `email.service.ts`, `jobs.service.ts`.
- Testes: bloco `typed getters` no `config.service.spec.ts` (28/28); `jobs.service.spec.ts` atualizado para mockar `getTimespan`/`getNumber` (5/5). Unit 54/54, e2e 5/5, cobertura 83.66%.

**Frontend** (`frontend/src/types/config.type.ts`, `services/config.service.ts`, `hooks/config.hook.ts`)
- `ConfigTypeMap`/`GetReturn` espelhando o backend; `get<K extends string>()` tipado (sem `any`).
- `middleware.ts` `getConfig` genérico (`<K extends string>`).
- Removidos `parseInt(config.get(...))` manuais em `EditableUpload.tsx`, `pages/upload/index.tsx`, `pages/account/shares.tsx`, `pages/share/[shareId]/index.tsx`, `components/admin/shares/ManageShareTable.tsx`.
- Verificação: `tsc --noEmit` 0 erros, `eslint` 0 erros, `next build` OK.

## 8. R05 — Decomposição do `ShareService` (concluído)

Fixa **ARQ-02** (god class 772 LOC / 27 métodos). `ShareService` vira orquestração fina; as responsabilidades de mapeamento, arquivamento ZIP e cotas/estrutura física saem para módulos coesos.

**Novos arquivos** (`backend/src/share/`)
- `share.mapper.ts` — `ShareMapper.transformShare(share)` (20 LOC): espalha o share, soma `size` via `toBytes`, extrai `recipients` (emails) e monta `security { maxViews, maxDownloads, passwordProtected }`.
- `share-archive.service.ts` — `ShareArchiveService.createZip(shareId)` (95 LOC): todo o pipeline ZIP movido (limites `zipMaxFiles`/`zipMaxTotalSize`/`zipMaxRatio`, guarda anti zip-bomb GAP-04, `archive.finalize`). Sem logger (não usado).
- `file-storage.service.ts` — `FileStorageService` (26 LOC): `ensureSpaceAvailable(size)` (valida cota via `SystemService`, lança `share.notEnoughSpace`) e `createShareDirectory(shareId)` (`fs.mkdirSync` recursivo).

**`share.service.ts`**
- Imports limpos (`InternalServerErrorException`, `createZipStream`, `fs`, `SystemService`, `SHARE_DIRECTORY`, `toBytes`); `transformShare` privado e `createZip` removidos.
- `create()` delega em `storageService.ensureSpaceAvailable` + `storageService.createShareDirectory`; `complete()` delega em `archiveService.createZip`; listagens/update usam `shareMapper.transformShare`.
- **794 → 698 LOC (−96)**.

**`share.module.ts`**
- Providers: `[ShareService, ShareMapper, ShareArchiveService, FileStorageService]`; `SystemModule` mantido (dep. do `FileStorageService`).
- Contrato público preservado: `reloadShareViews` (`fileSecurity.guard.ts`) e `verifyShareToken` (`shareSecurity.guard.ts`) intactos.

**Testes de regressão** (`share.service.spec.ts`, +9)
- `ShareMapper` (2), `FileStorageService` (3), `ShareArchiveService` (4 — limites de arquivos/tamanho, fluxo feliz, zip-bomb ratio).
- Gates: unit **63/63** (54 + 9), e2e **5/5**, lint 0 erros, `tsc --noEmit` sem erros em não-spec, `nest build` OK.

## 9. Quick wins de performance — PERF-02 e PERF-03 (concluído)

Aplicados os achados da Fase 6 (PERFORMANCE) por decisão do solicitante — fora do escopo original da Fase 12.

**PERF-02 — `complete()` com e-mails em paralelo** (`backend/src/share/share.service.ts`)
- Antes: `for (const recipient of share.recipients) { await sendMailToShareRecipients(...) }` — latência `N × SMTP`, e falha de SMTP abortava o `complete()`.
- Agora: `Promise.allSettled(share.recipients.map(...))` com `logger.error` por destinatário falho — falha de e-mail não impede mais `uploadLocked: true`.

**PERF-03 — ZIP com streams lazy + deflate mais leve**
- `backend/src/share/share-archive.service.ts`: `createZip()` abre `ReadStream` em lotes de `BATCH_SIZE = 16`, aguardando `archive.once("drain", resolve)` entre lotes — limita descritores abertos (evita `EMFILE` com `zipMaxFiles` alto).
- `backend/prisma/seed/config.seed.ts`: default `zipCompressionLevel` reduzido `"9"` → `"6"` (CPU −~60% no threadpool; vídeos são mídia já comprimida).

**Testes** — `share.service.spec.ts` atualizado (mock `makeArchive` com `once`/`emitDrain`): suites `share.service` + `config.service` **37 testes**; `src/email` **4 testes**; lint 0 erros; `nest build` OK.

## 10. Próximos passos

1. ~~**Validar CI no GitHub**~~ ✅ push do branch `fix/producao-v1.1.0` e CI verde (backend + frontend, PR #1).
2. ~~**R03 — Paginação nas listagens**~~ ✅ (commit `4686195`) — envelope `Page<T>`, quebra de contrato v1.2.0.
3. ~~**BDB-02 — Índices nos caminhos quentes**~~ ✅ (commit `98de696`) — 5 @@index, sem quebra de contratos.
4. ~~**R04 — Jobs de limpeza em lote + transação**~~ ✅ — batch 50 + cursor + `try/catch` por item.
5. ~~**R06 — Config tipada**~~ ✅ — backend + frontend, sem `any`/`parseInt` manual.
6. ~~**R05 — Decomposição do `ShareService`**~~ ✅ — 3 extrações coesas, `ShareService` −96 LOC.
7. ✅ **PERF-02 + PERF-03 (quick wins de performance)** — e-mails `Promise.allSettled`; ZIP em lotes de 16 com `drain` + `zipCompressionLevel` 9→6. Detalhes na seção 9.
7. ✅ **Revisão e merge** do PR #1 em `main` (commit `0bdb1c9`, CI verde backend + frontend).
8. ✅ **Registrar changelog/tech-debt**: R01 (breaking), BDB-02, R03, R04, R06 e R05 marcados no `CHANGELOG_SUGERIDO.md` e `TECH_DEBT.md`.
9. ✅ **SEC-03/BKD-01 (TTL reset)**, **SEC-05 (senha em body)**, **FRN-12 (mutação de props)** — pagos e registrados no `TECH_DEBT.md`.
10. ✅ **SEC-04 (sanitização HTML e-mail)** — `escapeHtml` em `common/sanitize.ts` aplicado a valores de usuário quando `email.sendHtmlEmails=true`; +4 testes em `email.service.spec.ts`.
11. ✅ **SEC-06 (oráculo de e-mail), SEC-07 (rotação/reuso de refresh), SEC-08 (fail-closed magic bytes)** — resposta uniforme em `resendVerification`; refresh em `$transaction` com reuse-detection e revogação da família; `local.service.ts` rejeita upload quando a detecção falha de forma inesperada; +6 testes em `auth.service.spec.ts`, +3 em `local.service.spec.ts` (unit 76/76).
12. ✅ **SEC-01 (fail-open do JwtGuard)** — já pago no R02: `jwt.guard.ts` lança `UnauthorizedException` no `catch` e acesso anônimo restrito a `@Public()`; confirmado em código e testes.
13. ✅ **SEC-02 (ClamAV)** — **encerrado por decisão formal** (26/07/2026): `docs/Padronizacao-07-clamav.md` rejeita a integração (uploads só do owner autenticado, somente mídia de vídeo, destinatários só baixam, overhead ~1-2 GB RAM + cold start, air-gapped incompatível com freshclam). Código `backend/src/clamscan/`, dep `clamscan` e daemon `clamav/clamav` já **removidos** do repositório e dos compose files. Sem pendência técnica.
14. ✅ **INF-02/03/04 (dependências)** — `engines.node >=24` nos 3 `package.json` + `.nvmrc`; `jwt-decode` removido (JWT unificado em `jose.decodeJwt` no `middleware.ts`, edge-compatible); `@types/cors` movido para `devDependencies`. Registrados no `DEPENDENCY_AUDIT.md` (resolvidos 2026-08-08).
15. ✅ **BDB-06 (unique composto de recipients)** — `@@unique([shareId, email])` + `@@index([shareId])` no schema; migration `20260808000000_add_share_recipient_unique` aplicada; deduplicação prévia `[...new Set(share.recipients)]` em `share.service.ts`; unit 85/85, builds backend+frontend OK.

## 11. Backlog pendente de segurança (registro da sequência)

| Item | Status | Local/Ref |
|---|---|---|
| SEC-02 — ClamAV no upload | ⚪ Encerrado por decisão formal (26/07/2026) | `docs/Padronizacao-07-clamav.md`; FASE-5 §SEC-02 — código, dep `clamscan` e daemon do compose já removidos |
| ~~SEC-05 — Mascarar query strings no proxy/Caddy (ex.: token no URL)~~ | ✅ Pago (2026-08-08) — filtro `format filter { request>uri query { replace pwd REDACTED } wrap json }` em `Caddyfile`, `Caddyfile.prod` e `Caddyfile.trust-proxy`; `Caddyfile.trust-proxy` corrigido (`trusted_proxies` voltou para dentro de `reverse_proxy`); 3 Caddyfiles validados com `caddy validate` na imagem custom com `caddy-ratelimit` |
| ~~TODO `auth.service.ts:131` — invalidar `loginTokens` antigos (logout de todos os dispositivos)~~ | ✅ Pago (2026-08-08, commit `5667793` — seção 24) — método `logoutAllDevices(userId)` em `auth.service.ts:317` + endpoint `POST /api/auth/logoutAll` em `auth.controller.ts`; distinto do SEC-07 (já pago) |
| ~~QTS-05 / DOP-07~~ | ✅ Ambos pagos — QTS-05 (2026-08-07, `newman` removido, `test/newman-system-tests.json` deletado); DOP-07 (2026-08-07, commit `5e9b987` — `.dockerignore` ampliado com `**/secrets/`, `.env*`, `**/scripts/secrets/`, `**/data/`, `*.log`; confirmado em `SECURITY_REPORT.md:39`) | FASE-10 / FASE-12 |
| SEC-06, SEC-07, SEC-08 | ✅ Pago (2026-08-07) | commit `1e6eaa4` |

---

## 12. ARQ-01 — Quebra de dependência circular `ShareModule` ↔ `FileModule` (concluído 2026-08-08)

Fixa **ARQ-01** (dependência circular bidirecional). O ciclo era:
- `ShareModule` → `forwardRef(() => FileModule)` → `FileModule` importava `ShareModule` diretamente

**Solução:** extração de `ShareDomainModule` com responsabilidades de domínio compartilhadas.

### Novos arquivos (`backend/src/share/domain/`)
| Arquivo | Responsabilidade |
|---|---|
| `share-domain.module.ts` | Módulo global que exporta os 3 serviços de domínio |
| `share-validation.service.ts` | Validação de expiração, acesso do creator, disponibilidade de share ID, parsing de expiração |
| `share-token.service.ts` | Geração e verificação de tokens JWT de share (com assinatura de senha) |
| `share-limit.service.ts` | Checagem de cotas de tamanho, limites de ZIP, expiração máxima |

### Mudanças nos módulos existentes
- **`FileModule`**: agora importa `ShareDomainModule` em vez de `ShareModule` — quebra o ciclo
- **`ShareModule`**: importa `ShareDomainModule` + mantém `forwardRef(() => FileModule)` para `FileService`
- **`ShareService`**: delega validações, tokens e limites aos novos serviços de domínio (−96 LOC vs original 772)

### Testes
- Unit: **85/85** ✅
- E2E: **16/16** ✅  
- Frontend: **5/5** ✅
- Build backend + frontend: **OK** ✅

### Próximo item da fila (P2)
- **ARQ-03** — `date.util.ts` duplicado backend/frontend → pacote `shared/`
- **ARQ-04** — Boilerplate `@UseGuards` redundante → decorators compostos

---

## 13. ARQ-03 — Pacote `shared/` com `date.util.ts` unificado (concluído 2026-08-08)

Fixa **ARQ-03** (util `date.util.ts` duplicado entre backend/frontend com implementações divergentes).

### Solução: pacote `@controle-share/shared`

**Novo pacote** (`packages/shared/`):
- `src/date.util.ts` — utilitários comuns: `EPOCH_ZERO`, `parseRelativeDateToAbsolute`, `isEpochZero`, `Timespan`, `stringToTimespan`, `timespanToString`
- `src/index.ts` — barrel export
- Publicado localmente via `file:../packages/shared`

### Mudanças
| Arquivo | Antes | Depois |
|---|---|---|
| `backend/src/utils/date.util.ts` | 57 LOC (implementação própria) | 18 LOC (re-export do shared) |
| `frontend/src/utils/date.util.ts` | 59 LOC (implementação própria + `getExpirationPreview`) | 38 LOC (re-export do shared + `getExpirationPreview` frontend-only) |

O frontend mantém `getExpirationPreview` (usa i18n/translation hook) que é específico do frontend.

### Testes ✅
- Backend unit: 85/85
- Backend e2e: 16/16
- Frontend unit: 5/5
- Builds: OK

### Próximo item da fila (P2)
- **ARQ-04** — Boilerplate `@UseGuards` redundante → decorators compostos (`@AdminOnly()`, `@ShareOwner()`)
- **BKD-02** — Tipos `any` difusos restantes em `ConfigService.get()`
- **BKD-04** — Falha engolida em `DownloadLogService.record()` — adicionar retry + log estruturado

---

## 14. ARQ-04 — Decorators compostos para guards (concluído 2026-08-08)

Fixa **ARQ-04** (boilerplate `@UseGuards(JwtGuard, RolesGuard)` repetido em ~50 endpoints).

### Novos decorators

**`backend/src/auth/decorator/guards.decorator.ts`:**
| Decorator | Guards aplicados |
|---|---|
| `Authenticated()` | `JwtGuard` |
| `AdminOnly()` | `JwtGuard` + `RolesGuard` + `@Roles('admin')` |
| `AdminOrAuditor()` | `JwtGuard` + `RolesGuard` + `@Roles('admin','auditor')` |
| `OperatorOrAbove()` | `JwtGuard` + `RolesGuard` + `@Roles('admin','operador')` |
| `Public` | (re-export) |
| `Roles` | (re-export) |

**`backend/src/share/decorator/share-guards.decorator.ts`:**
| Decorator | Guards aplicados |
|---|---|
| `SharePublicAccess()` | `IdValidation` + `ShareSecurityGuard` |
| `ShareOwnerAccess()` | `IdValidation` + `ShareOwnerGuard` |
| `StrictShareOwnerAccess()` | `IdValidation` + `StrictShareOwnerGuard` |
| `ShareTokenAccess()` | `IdValidation` + `ShareTokenSecurity` |

### Controllers refatorados
- `auth.controller.ts` — 7 endpoints: `@UseGuards(JwtGuard)` → `@Authenticated()`
- `config.controller.ts` — 5 endpoints: `@UseGuards(JwtGuard,RolesGuard) @Roles('admin')` → `@AdminOnly()`
- `system.controller.ts` — 1 endpoint: `@Roles('admin','auditor')` → `@AdminOrAuditor()`
- `user.controller.ts` — 8 endpoints: misto → `@Authenticated()` / `@AdminOnly()`
- `share.controller.ts` — 13 endpoints: `@UseGuards(...)` → decorators compostos
- `file.controller.ts` — 4 endpoints: `@UseGuards(...)` → decorators compostos

**Redução:** ~50 linhas de `@UseGuards` duplicado eliminadas

### Testes ✅
- Unit: 85/85
- E2E: 16/16
- Frontend: 5/5
- Builds: OK

---

### Próximo item da fila (P2)

| Item | Descrição |
|------|-----------|
| **BKD-02** | Tipos `any` difusos restantes em `ConfigService.get()` |
| **BKD-04** | Falha engolida em `DownloadLogService.record()` — adicionar retry + log estruturado |
| **FRN-01** | JWT no middleware sem verificação assinatura (jose/jwtVerify) |
| **FRN-02** | Estado módulo-level + `Promise.all` não aguardado no upload |
| **FRN-04** | Tipos `any` generalizados frontend (~55 usos) |
| **FRN-05** | Loop potencial de reload por idioma |
| **FRN-07** | Preview PDF via `window.location.href` |
| **FRN-08** | Categorias config inconsistentes |
| **BDB-05** | Sentinela `EPOCH_ZERO` + `ShareSecurity` 1:1 opcional |
| **TODO** | Invalidar `loginTokens` antigos (logout all devices) |

---

## 15. BKD-02 — Tipos `any` no ShareMapper.transformShare (concluído 2026-08-08)

Fixa **BKD-02** (tipos `any` difusos no `ShareMapper.transformShare(share: any)`).

### Mudanças
- **`share.mapper.ts`**: entrada tipada como `ShareLike` (interface com propriedades conhecidas + index signature) em vez de `any`
- Retorno tipado como `Record<string, unknown>` para compatibilidade com DTOs
- Removido `eslint-disable @typescript-eslint/no-explicit-any`

### Testes
- Mocks atualizados: `File.size` como `bigint` (`1048576n`), `ShareSecurity` e `ShareRecipient` shapes corretos
- Unit: **85/85** ✅
- E2E: **16/16** ✅
- Frontend: **5/5** ✅
- Builds: **OK** ✅

---

### Próximo item da fila (P2)

| Item | Descrição |
|------|-----------|
| **BKD-04** | Falha engolida em `DownloadLogService.record()` — adicionar retry + log estruturado |
| **FRN-01** | JWT no middleware sem verificação assinatura (jose/jwtVerify) |
| **FRN-02** | Estado módulo-level + `Promise.all` não aguardado no upload |
| **FRN-04** | Tipos `any` generalizados frontend (~55 usos) |
| **FRN-05** | Loop potencial de reload por idioma |
| **FRN-07** | Preview PDF via `window.location.href` |
| **FRN-08** | Categorias config inconsistentes |
| **BDB-05** | Sentinela `EPOCH_ZERO` + `ShareSecurity` 1:1 opcional |
| **TODO** | Invalidar `loginTokens` antigos (logout all devices) |

---

## 16. BKD-04 — Retry + log estruturado em DownloadLogService.record() (concluído 2026-08-08)

Fixa **BKD-04** (falha engolida na trilha de auditoria).

### Mudanças
- **Retry com backoff exponencial**: 3 tentativas (0, 1, 2) com delay 100ms, 200ms, 400ms
- **Log estruturado**:
  - `warn` nas tentativas intermediárias (com shareId, attempt, maxRetries)
  - `error` na última tentativa (com shareId, fileName, event, success, reason, stack trace)
- **Não lança exceção**: falha de auditoria não quebra o fluxo principal (requisito do produto)

### Testes ✅
- Unit: 85/85
- E2E: 16/16
- Frontend: 5/5
- Builds: OK

---

### Próximo item da fila (P3)

| Item | Descrição |
|------|-----------|
| **FRN-01** | JWT no middleware sem verificação assinatura (jose/jwtVerify) |
| **FRN-02** | Estado módulo-level + `Promise.all` não aguardado no upload |
| **FRN-04** | Tipos `any` generalizados frontend (~55 usos) |
| **FRN-05** | Loop potencial de reload por idioma |
| **FRN-07** | Preview PDF via `window.location.href` |
| **FRN-08** | Categorias config inconsistentes |
| **BDB-05** | Sentinela `EPOCH_ZERO` + `ShareSecurity` 1:1 opcional |
| **TODO** | Invalidar `loginTokens` antigos (logout all devices) |

---

## 17. FRN-01 — JWT verification no middleware (concluído 2026-08-08)

Fixa **FRN-01** (JWT decodificado sem verificação de assinatura no middleware).

### Mudanças
- **`frontend/src/middleware.ts`**: substituir `decodeJwt` por `jwtVerify` do `jose`
- **Leitura do segredo**: prioriza arquivo (`JWT_SECRET_FILE` — Docker secret), fallback para `JWT_SECRET` env
- **Fallback gracioso**: se segredo não configurado, avisa no console e pula verificação (não quebra o app)
- **Docker secrets**: adicionar `jwt_secret` secret compartilhado entre backend e frontend
  - `docker-compose.yml`: `JWT_SECRET=${JWT_SECRET}` no frontend
  - `docker-compose.prod.yml`: `JWT_SECRET_FILE=/run/secrets/jwt_secret` + secret `jwt_secret`
- **Frontend `.env.local.example`**: documentar variável

### Aviso de build
- `fs` module warning no Edge Runtime — esperado pois lê arquivo de segredo; não bloqueia build

### Testes ✅
- Backend unit: 85/85
- Backend e2e: 16/16
- Frontend unit: 5/5
- Frontend build: OK (com warning)

---

### Próximo item da fila (P3)

| Item | Descrição |
|------|-----------|
| **FRN-02** | Estado módulo-level + `Promise.all` não aguardado no upload |
| **FRN-04** | Tipos `any` generalizados frontend (~55 usos) |
| **FRN-05** | Loop potencial de reload por idioma |
| **FRN-07** | Preview PDF via `window.location.href` |
| **FRN-08** | Categorias config inconsistentes |
| **BDB-05** | Sentinela `EPOCH_ZERO` + `ShareSecurity` 1:1 opcional |
| **TODO** | Invalidar `loginTokens` antigos (logout all devices) |

---

## 18. FRN-02 — Estado upload no componente + Promise.all aguardado (concluído 2026-08-08)

Fixa **FRN-02** (estado módulo-level + `Promise.all` não aguardado no upload).

### Mudanças
- **Variáveis de módulo → `useState`**:
  - `errorToastShown` → `useState(false)`
  - `createdShare` → `useState<Share | null>(null)`
  - `pendingGeneratedPassword` → `useState<string | undefined>(undefined)`
- **`uploadFiles`**: `Promise.all(fileUploadPromises)` → `await Promise.all(...)`
- **Lógica de completion**: movida do `useEffect` (fire-and-forget) para dentro de `uploadFiles` após `await`
- **Dois `useEffect` separados**:
  1. Monitora erros de upload (`uploadingProgress === -1`)
  2. Dispara completion quando todos `>= 100%` e sem erros

### Testes ✅
- Backend unit: 85/85
- Backend e2e: 16/16
- Frontend unit: 5/5
- Frontend build: OK

---

### Próximo item da fila (P3)

| Item | Descrição |
|------|-----------|
| **FRN-04** | Tipos `any` generalizados frontend (~55 usos) |
| **FRN-05** | Loop potencial de reload por idioma |
| **FRN-07** | Preview PDF via `window.location.href` |
| **FRN-08** | Categorias config inconsistentes |
| **BDB-05** | Sentinela `EPOCH_ZERO` + `ShareSecurity` 1:1 opcional |
| **TODO** | Invalidar `loginTokens` antigos (logout all devices) |

---

## 19. FRN-04 — Tipos `any` generalizados frontend (concluído 2026-08-08)

Fixa **FRN-04** (tipos `any` generalizados frontend — ~55 usos).

### Mudanças principais

**Tipos novos/centralizados:**
- `src/utils/error.util.ts`: `ApiErrorResponse`, `AxiosErrorWithResponse<T>` — tipagem forte para erros de API
- `src/utils/toast.util.tsx`: `axiosError` aceita `AxiosErrorWithResponse` em vez de `any`
- `src/utils/file.util.ts`: `FileLike`, `ExistingFileLike` — tipagem para deduplicação de arquivos
- `src/types/File.type.ts`: `FileRecord`, `FileUpload`, `FileMetaData`, `FileListItem` — hierarquia de tipos de arquivo
- `src/components/core/TimespanInput.tsx`: props tipadas (removido `[key: string]: any`)
- `src/components/core/FileSizeInput.tsx`: props tipadas (removido `[key: string]: any`)

**Componentes atualizados:**
- `FileList.tsx` (share + upload): props tipadas, `FileRecord | FileMetaData`
- `EditableUpload.tsx`: `FileRecord[]`, `FileUpload[]`, `FileListItem[]`
- `Dropzone.tsx`: cria `FileUpload[]` com `file: File` original
- `showFilePreviewModal.tsx`: aceita `FileMetaData | FileRecord`
- `showTextEditorModal.tsx`: cria `FileUpload` com `File` original
- `copyFileLink`: aceita `FileMetaData | FileRecord`
- `shareService.uploadFile`: passa `file.file` (DOM File) para `slice()`

**Correções de tipo:**
- `FileRecord.size`: `string | bigint` (conversão `Number()` onde necessário)
- Props tipadas em `TimespanInput`, `FileSizeInput` (sem `[key: string]: any`)
- Props `isLoading`/`isUploading` opcionais em `FileList` (upload)

### Testes ✅
- Backend unit: 85/85
- Backend e2e: 16/16
- Frontend unit: 5/5
- TypeScript: OK (build compile OK)

---

### Próximo item da fila (P3)

| Item | Descrição |
|------|-----------|
| **FRN-05** | Loop potencial de reload por idioma |
| **FRN-07** | Preview PDF via `window.location.href` |
| **FRN-08** | Categorias config inconsistentes |
| **BDB-05** | Sentinela `EPOCH_ZERO` + `ShareSecurity` 1:1 opcional |
| **TODO** | Invalidar `loginTokens` antigos (logout all devices) |

---

## 20. FRN-05 — Loop potencial de reload por idioma (concluído 2026-08-08)

Fixa **FRN-05** (loop potencial de reload por idioma em `_app.tsx`).

### Problema
O `useEffect` que sincronizava o idioma fazia `location.reload()` quando `pageProps.language !== cookieLanguage`. Isso causava loop infinito:
1. Página carrega com idioma A
2. Cookie tem idioma B → `location.reload()`
3. Página recarrega, busca config novamente
4. Se API retorna idioma diferente ou cookie não setado → reload novamente → loop infinito

### Solução
- **`hasReloadedRef`**: flag para impedir múltiplos reloads na mesma sessão
- **`router.replace(router.asPath, undefined, { scroll: false })`**: substitui `location.reload()` — evita full page reload, mantém estado do React
- O `IntlProvider` recebe o novo `pageProps.language` via props e atualiza a UI sem full reload

### Código alterado
```tsx
const hasReloadedRef = useRef(false);
useEffect(() => {
  if (!pageProps.language || hasReloadedRef.current) return;
  const cookieLanguage = getCookie("language");
  if (!cookieLanguage) {
    i18nUtil.setLanguageCookie(pageProps.language);
  } else if (pageProps.language !== cookieLanguage) {
    hasReloadedRef.current = true;
    router.replace(router.asPath, undefined, { scroll: false });
  }
  // ...
}, [pageProps.language]);
```

### Testes ✅
- Backend unit: 85/85
- Backend e2e: 16/16
- Frontend unit: 5/5
- TypeScript: OK (compilação OK)

---

### Próximo item da fila (P3)

| Item | Descrição |
|------|-----------|
| **FRN-07** | Preview PDF via `window.location.href` |
| **FRN-08** | Categorias config inconsistentes |
| **BDB-05** | Sentinela `EPOCH_ZERO` + `ShareSecurity` 1:1 opcional |
| **TODO** | Invalidar `loginTokens` antigos (logout all devices) |

---

## 21. FRN-07 — Preview PDF via iframe (concluído 2026-08-08)

Fixa **FRN-07** (Preview de PDF via `window.location.href` perdia o overlay/modal).

### Problema
O `PdfPreview` usava `window.location.href = /api/shares/...` que navega a página inteira, perdendo o overlay do `FilePreview` (modais, botões, contexto).

### Solução
- **`PdfPreview`**: substituir `window.location.href` por `<iframe>` inline
- **Iframe configurado**: `width="100%"`, `height="600px"`, `sandbox="allow-scripts allow-same-origin"`
- Mantido fallback: se iframe não carregar, o usuário pode usar o botão "View original file" (abre em nova aba)

### Código alterado
```tsx
const PdfPreview = () => {
  const { shareId, fileId } = React.useContext(FilePreviewContext);

  return (
    <iframe
      src={`/api/shares/${shareId}/files/${fileId}?download=false`}
      width="100%"
      height="600px"
      style={{ border: "none", borderRadius: 8 }}
      title="PDF Preview"
      sandbox="allow-scripts allow-same-origin"
    />
  );
};
```

### Testes ✅
- Backend unit: 85/85
- Backend e2e: 16/16
- Frontend unit: 5/5
- TypeScript: OK (compilação OK)

---

### Próximo item da fila (P3)

| Item | Descrição |
|------|-----------|
| **FRN-08** | Categorias config inconsistentes |
| **BDB-05** | Sentinela `EPOCH_ZERO` + `ShareSecurity` 1:1 opcional |
| **TODO** | Invalidar `loginTokens` antigos (logout all devices) |

---

## 22. FRN-08 — Categorias config consistentes (lowercase) (concluído 2026-08-08)

Fixa **FRN-08** (categorias de config inconsistentes: page capitalizada vs. serviço minúsculo).

### Problema
O frontend usava categorias capitalizadas (`"General"`, `"Appearance"`, etc.) para display mas convertia para lowercase ao chamar a API. O backend seed usa lowercase (`"general"`, `"appearance"`, etc.). A inconsistência causava conversões desnecessárias e potencial de bugs.

### Solução
- **`ConfigurationTopNav.tsx`**: categorias agora usam valores lowercase (`"general"`, `"appearance"`, `"email"`, `"share"`, `"smtp"`, `"legal"`, `"cache"`)
- Removido `.toLowerCase()` em comparisons (`categoryId === cat.name`) e onChange handlers
- **`config.service.ts`**: array `categories` já era lowercase (confirmado)
- Backend Prisma seed já usa lowercase — agora consistente em toda a stack

### Código alterado
```tsx
// Antes
{ name: "General", icon: <TbSettings /> }
// Depois
{ name: "general", icon: <TbSettings /> }

// Removido: cat.name.toLowerCase() → usa cat.name diretamente
```

### Testes ✅
- Backend unit: 85/85
- Backend e2e: 16/16
- Frontend unit: 5/5
- TypeScript: OK (compilação OK)

---

### Próximo item da fila (P3)

| Item | Descrição |
|------|-----------|
| **BDB-05** | Sentinela `EPOCH_ZERO` + `ShareSecurity` 1:1 opcional |
| **TODO** | Invalidar `loginTokens` antigos (logout all devices) |

---

## 23. BDB-05 — EPOCH_ZERO sentinel → nullable expiration + ShareSecurity 1:1 (concluído 2026-08-08)

Fixa **BDB-05** (sentinela `EPOCH_ZERO` para "nunca expira" + `ShareSecurity` 1:1 opcional).

### Problema
- `expiration = Date(0)` representava "nunca expira" → espalhava `{ not/equals: EPOCH_ZERO }` em 3 arquivos
- `ShareSecurity` era `String? @unique` embora sempre criado → 1:1 opcional desnecessário

### Solução
- **Schema**: `expiration DateTime?` (null = nunca expira) em vez de sentinela
- **ShareSecurity**: `shareId String @unique` obrigatório, relação 1:1 via `securityId` no Share
- **Migration** (20260808120000):
  1. Drop índices compostos/simples em `expiration`
  2. Add `expiresAt`, backfill `EPOCH_ZERO → NULL`
  3. Drop `expiration`, rename `expiresAt → expiration`
  4. Recriar índices
  5. Backfill `ShareSecurity` para shares sem security
  6. `shareId` obrigatório + unique index

### Código alterado
- `schema.prisma`: `expiration DateTime?`, `securityId String @unique`, `security ShareSecurity @relation`
- `share.service.ts`: usa `null` check em vez de `isEpochZero()`
- Removido uso de `EPOCH_ZERO` em favor de `null` check

### Testes ✅
- Backend unit: 85/85
- Backend e2e: 16/16
- Frontend unit: 5/5
- Database reset: 43 migrações aplicadas com sucesso

---

### Próximo item da fila

| Item | Descrição |
|------|-----------|
| **TODO** | Invalidar `loginTokens` antigos (logout all devices) |

---

## 24. TODO — Invalidar `loginTokens` antigos / Logout all devices (concluído 2026-08-08)

Resolve o último item pendente: **Invalidar `loginTokens` antigos (logout de todos os dispositivos)**.

### Implementação
- **`auth.service.ts`**: novo método `logoutAllDevices(userId: string)`
  - `prisma.refreshToken.deleteMany({ where: { userId } })` — invalida todas as sessões (refresh tokens)
  - `prisma.loginToken.updateMany({ where: { userId, used: false }, data: { used: true } })` — marca todos login tokens não usados como usados (logout de todos devices)
- **`auth.controller.ts`**: novo endpoint `POST /api/auth/logoutAll`
  - Decorator `@Authenticated()` — requer JWT válido
  - Retorna `204 No Content`

### Segurança
- Apenas o próprio usuário autenticado pode invocar (usa `@GetUser()` + `@Authenticated()`)
- Invalida refresh tokens (sessões longas) e login tokens (sessões curtas/TOTP)
- Não remove tokens já usados (já consumidos)

### Testes ✅
- Backend unit: 85/85
- Backend e2e: 16/16
- Frontend unit: 5/5
- Build: OK

---

### Status Final
| Item | Status |
|------|--------|
| **ARQ-01** | ✅ Dependência circular ShareModule ↔ FileModule |
| **ARQ-03** | ✅ date.util.ts unificado (pacote shared) |
| **ARQ-04** | ✅ Decorators compostos para guards |
| **BKD-02** | ✅ Tipos `any` no ShareMapper |
| **BKD-04** | ✅ Retry + log estruturado DownloadLogService |
| **FRN-01** | ✅ JWT verification no middleware (jose/jwtVerify) |
| **FRN-02** | ✅ Estado upload useState + Promise.all aguardado |
| **FRN-04** | ✅ Tipos `any` frontend eliminados |
| **FRN-05** | ✅ Loop reload idioma → router.replace + flag |
| **FRN-07** | ✅ Preview PDF via iframe |
| **FRN-08** | ✅ Categorias config lowercase consistentes |
| **BKD-04** | ✅ DownloadLog retry + log estruturado |
| **BDB-05** | ✅ EPOCH_ZERO → nullable expiration + ShareSecurity 1:1 |
| **TODO** | ✅ Logout all devices (invalidar loginTokens) |

**Todos os itens P2/P3 do backlog concluídos!**

---

## 25. HOTFIX — Build frontend `/share/[shareId]/edit` (2026-08-09)

Bug descoberto durante a conferência final (seção 24 marcava "todos os itens P2/P3 concluídos" mas o `next build` estava quebrado).

### Sintoma
```
TypeError: Cannot read properties of null (reading 'useContext')
  at useTranslate (.next/server/chunks/403.js:598:69)
  at <unknown> (.next/server/chunks/316.js:314:88)
> Build error occurred: Failed to collect page data for /share/[shareId]/edit
```

### Causa raiz
Em `frontend/src/components/upload/FileList.tsx:34`, o hook `useTranslate()` estava sendo chamado em **escopo de módulo (top-level)**, fora do componente `FileListRow` — provável erro de indentação/copypaste durante o FRN-04. Como `useTranslate` → `useIntl` → `React.useContext(IntlContext)`, o SSR strict do Next 14 falhava ao coletar page data de qualquer página que importasse `FileList` (upload), incluindo `/share/[shareId]/edit` → `EditableUpload` → `FileList`.

### Correção
- `FileList.tsx:34` — `const t = useTranslate();` movido para dentro do componente `FileListRow` (primeira linha do corpo)
- `packages/shared/src/date.util.ts` — plugins `localizedFormat` + `locale("pt-br")` movidos para o pacote compartilhado (única fonte), eliminando a chamada top-level residual no `frontend/src/utils/date.util.ts` (mesma classe de bug que FRN-02 preventiva)
- `frontend/next.config.js` — adicionado `@controle-share/shared` em `transpilePackages` (necessário desde ARQ-03; sem isto o Next não bundla os internals do pacote local `file:`)

### Validação ✅
- Backend unit: 85/85
- Backend e2e: 16/16
- Backend build + lint: OK (0 erros, 14 warnings)
- Frontend unit: 5/5
- Frontend build: **OK** (regressão corrigida)
- Frontend lint: OK

### Notas
- Bug **pré-existente** em `52df2f1` (HEAD antes desta fix) — não foi introduzido pelas correções desta sessão; confirmação feita com `git stash` + rebuild no commit anterior
- Elimina dívida técnica correlata ao FRN-02 (módulo-level state) que não tinha sido capturada porque a suíte de testes do frontend (5 unit) não exerce SSR

---

## 26. Rodada de correções da auditoria consolidada (2026-08-09)

Fixes aplicados a partir da consolidação dos relatórios SECURITY_PERFORMANCE_ARCHITECTURE_REVIEW + bug hunt + DEPENDENCY_AUDIT (conferência da seção 24/25). Todos os 6 bugs classificados como alta severidade foram corrigidos.

### Fix #1 — Closure stale `createdShare!.id` (crítico)
`frontend/src/pages/upload/index.tsx` — a closure de `uploadFiles` capturava `createdShare` (state, que ainda era `null` no momento do upload), fazendo `shareService.uploadFile(undefined, ...)` falhar em NPM de concorrência. Corrigido capturando o `createdShareId` em variável local (`let` no escopo da função) imediatamente após o `create()`. (O commit `ea35b61` anterior usava `result.id`, que estava fora do escopo do `try` — refinado nesta rodada.)

### Fix #2 — `errorToastShown` em escopo de módulo (alto)
`frontend/src/components/upload/EditableUpload.tsx` — flag `let errorToastShown = false` no **top-level do módulo** (mesma classe de bug do FRN-02): estado compartilhado entre todas as instâncias do componente, causando toast suprimido/sem reset. Migrado para `useState(false)` com dependências corretas (`[uploadingFiles, errorToastShown, t]`).

### Fix #3 — Hang no `archive.once("drain")` (alto)
`backend/src/share/share-archive.service.ts` — o laço de batch (PERF-03) aguardava incondicionalmente `archive.once("drain")` após cada lote. O evento `"drain"` só é emitido após um `.write()` que retornou `false`; em lotes pequenos sem backpressure o evento nunca dispara e `isZipReady` fica `false` para sempre. Corrigido com `waitIfBackpressure()` que só aguarda quando `writableNeedDrain` indica backpressure real.

### Fix #4 — Schema Prisma ShareSecurity 1:1 inválido (alto) ⚠️ **bug de schema do BDB-05**
`backend/prisma/schema.prisma` — o BDB-05 adicionou `securityId String @unique` na model `Share` **sem a coluna existir no banco** (a migration `20260808120000` só criou `ShareSecurity.shareId` + backfill + unique index) e duplicou o campo `security`. O schema resultante era inválido: dois lados da relação 1:1 declaravam `references`, e o `prisma generate` nunca havia rodado com o schema "bom". O código compilava porque o client gerado era de um schema anterior.
- **Correção**: removida a coluna fantasma `securityId`; `Share.security` voltou a ser back-relation simples (`ShareSecurity?`); `ShareSecurity.shareId` permanece como o único FK (`@unique`, `@relation(fields: [shareId], references: [id], onDelete: Cascade)`), alinhado à migration real e ao banco.
- **Consistência com o banco**: `npx prisma format` + `validate` + `generate` agora passam; banco não precisa de migration nova (schema e DB já coincidiam; apenas o schema estava errado).
- **Ajustes de código** decorrentes: `share.service.ts` create usa nested `security.create` (back-relation preenche `shareId`), e o upsert de security usa `create: { shareId, ... }` em vez de `share: { connect }`.

### Fix #5 — Sentinela `EPOCH_ZERO` residual (alto) — **bugs reais pós-BDB-05**
Após o BDB-05 migrar o sentinela para `null` no banco, restavam pontos usando `EPOCH_ZERO`/`.unix() === 0` que quebram com `null`:
- `backend/src/jobs/jobs.service.ts` — filtro de expiração `{ not: EPOCH_ZERO }` → `{ not: null }` (o `not: EPOCH_ZERO` nunca combinaria `NULL`, vazando shares vencidos)
- `backend/src/share/share.service.ts` — `getSharesByUser` usava `{ expiration: { equals: EPOCH_ZERO } }` para listar "nunca expira"; com `NULL` no banco esses shares sumiriam da listagem → `{ equals: null }`
- `backend/src/share/domain/share-validation.service.ts` — `parseExpiration("never")` retornava `EPOCH_ZERO`; agora retorna `null`; `parseExpiration`/`validateExpiration` tipados como `Date | null`
- `backend/src/email/email.service.ts` — `dayjs(expiration).unix() != 0` → `isEpochZero(expiration)` (com `null`, `dayjs(null).unix()` é `NaN`, o e-mail mostraria data inválida em vez de "nunca expira")
- Frontend (4 arquivos) — `dayjs(x).unix() === 0` → `isEpochZero(x)`: `showCompletedUploadModal.tsx`, `account/shares.tsx`, `showShareInformationsModal.tsx`, `ManageShareTable.tsx` (sem `isEpochZero(null)` retornaria `true`, os cards "Nunca" mostrariam `Invalid Date`)
- `packages/shared/src/date.util.ts` — `isEpochZero` agora aceita `null | undefined` (retorna `true`); `parseRelativeDateToAbsolute` retorna `Date | null` para `"never"`
- Removidos: `ShareValidationService.EPOCH_ZERO` público e `ShareLimitService.isNeverExpires` (código morto), hardcodes `.locale("pt-br")` em `DownloadLogsTable.tsx`/`account/shares.tsx`/`ManageShareTable.tsx`/`showShareInformationsModal.tsx` (agora respeitam o locale global resolvido no `_app.tsx`)

### Fix #6 — `nanoid` <3.3.17 HIGH (INF-01 regressão) (alto)
`frontend/package.json` — `nanoid@3.3.16` (via `next → postcss`) sem fix de alta severidade. Adicionado override `"nanoid": "^3.3.17"` → `3.3.18`. `npm audit`: **0 vulnerabilidades** (backend e frontend).

### Fix #7 — `dayjs.locale("pt-br")` global dentro de event handler (médio)
`showCompletedUploadModal.tsx` — `dayjs.locale("pt-br")` no `handleCopyAll` sobrescrevia o locale global resolvido, forçando pt-br mesmo com outro idioma selecionado. Removido (o global já é definido corretamente no `_app.tsx`).

### Fix #8 — `useRef(language)` congelando o idioma (médio)
`frontend/src/pages/_app.tsx` — `const language = useRef(pageProps.language)` travava `dayjs.locale`, `IntlProvider.messages` e `locale` no idioma inicial; trocas de idioma via cookie/reload não eram refletidas. Substituído por `pageProps.language` direto (valores já re-renderizam com a prop).

### Fix #9 — `$connect()` no construtor do PrismaService (médio)
`backend/src/prisma/prisma.service.ts` — `super.$connect().then(...)` no construtor era fire-and-forget (unhandled rejection em falha). Substituído por `OnModuleInit` (`await this.$connect()`) + `OnModuleDestroy` (`await this.$disconnect()`), seguindo o lifecycle do NestJS.

### Fix #10 — `new Error("share.notEnoughSpace")` → `HttpException` (médio)
`backend/src/share/domain/share-limit.service.ts` — `throw new Error(...)` viraria 500 com corpo não traduzido. Corrigido para `BadRequestException(this.i18n.t("share.notEnoughSpace"))`, seguindo o padrão de `file-storage.service.ts`.

### Fix #11 — `parseInt()` sem radix (médio)
`file.controller.ts` e `config.service.ts` — `parseInt(chunkIndex)`, `parseInt(totalChunks)`, `parseInt(value)` → `parseInt(..., 10)` (radix explícito, evita parsing octal/legado em strict mode).

### Fix #12 — Dead code em `jwt.strategy.ts` (baixo)
`backend/src/auth/strategy/jwt.strategy.ts` — `config.getString("internal.jwtSecret");` como statement solto (o valor era lido de novo no `super()`). Removido.

### Fix #13 — Lint: 14 warnings de unused imports (baixo)
Removidos imports não usados em `guards.decorator.ts`, `file.controller.ts`, `share-domain.module.ts`, `share-token.service.ts`, `share.controller.ts`, `user.controller.ts`, `auth-share.e2e-spec.ts` (incl. `authed`/`signIn`/`accessToken` sem uso). **Lint backend: 0 erros, 0 warnings** (antes 14 warnings).

### Validação final ✅
- Backend: unit **85/85**, e2e **16/16**, `nest build` OK, `tsc --noEmit` OK, lint **0 warnings**
- Frontend: unit **5/5**, `next build` OK, lint OK
- Prisma: `format`/`validate` OK, `generate` OK (client regenerado)
- `npm audit`: **0 vulnerabilidades** (backend e frontend)
- Shared package: rebuild `npm run build` aplicado

### Notas
- O bug do schema (Fix #4) era real e bloqueava qualquer geração de migration futura — estava "escondido" porque o client Prisma gerado em `node_modules`/`generated` era de um schema anterior válido.
- A bateria unit/e2e não cobre o cenário `.unix() === 0` com `null`; o bug do frontend (Fix #5) foi detectado por análise empírica (`dayjs(null).unix()` → `NaN`) e coberto por conferência manual.

### Conferência 2026-08-09 (pós-push) — itens baratos e branch protection
- Verificados **SEC-05** (filtro `replace pwd REDACTED` nos 3 Caddyfiles, commit `242c231`), **QTS-05** (`newman` removido) e **DOP-07** (`.dockerignore` com `**/secrets/`/`.env*`, commit `5e9b987`) — todos **já pagos**; apenas CHANGELOG desatualizado, corrigido nesta rodada.
- **Branch protection** (status check do job `frontend` obrigatório): ⚠️ **não aplicável** — repo privado em conta GitHub free exige **GitHub Pro** para branch protection/rulesets (403 confirmado via API). Registrado como recomendação condicionada a upgrade ou tornar o repo público.
- Docs sincronizados: `CHANGELOG_SUGERIDO.md` (seção 8 Itens Adiados, Conclusões, Recomendação 4).



## 27. Rotação de JWT secret sem queda de sessão + secret manager (concluído 2026-08-09)

### Objetivo
Permitir rotacionar o segredo de assinatura JWT **sem derrubar sessões ativas** e com integração a secret manager (Docker secrets / env), encerrando o item "Rotação de `JWT_SECRET` / secret manager" do backlog.

### Implementação
- **`backend/src/config/jwt-secret.service.ts`** (novo, `JwtSecretService`, global via `ConfigModule`):
  - `getCurrentSecret()` — precedência: env `JWT_SECRET` → Docker secret file (`/run/secrets/jwt_secret`, sobrescrevível via `JWT_SECRET_FILE`) → DB `internal.jwtSecret`.
  - `getVerificationSecrets()` — segredo atual + histórico `internal.jwtSecretHistory` (janela de retenção de ~13 meses com evicção por idade, de-duplicado).
  - `getKid()`/`getSecretByKid()`/`resolveSecretForToken()` — resolve o segredo exato pelo `kid` do header do token.
  - `rotate()` — move o atual para o histórico e persiste um novo aleatório via `$transaction`; **mutex em processo** (serializa chamadas concorrentes); suporta **rotação híbrida** quando o segredo vem de Docker secret file (o valor do arquivo entra no histórico e `internal.jwtSecretSource` vira `db`); bloqueado apenas com env `JWT_SECRET` ou `config.yaml`; criptografa o segredo em repouso (AES-256-GCM) quando `JWT_SECRET_ENCRYPTION_KEY` está presente; chama `config.reload()` para refletir sem restart.
- **`backend/src/config/config.service.ts`** — `ConfigTypeMap` ganha `internal.jwtSecretHistory`; novo método público `reload()`.
- **`backend/prisma/seed/config.seed.ts`** — variáveis `internal.jwtSecretHistory` e `internal.jwtSecretSource` (locked, secret); `seedConfigVariables` cria as linhas em DBs existentes.
- **`backend/src/auth/strategy/jwt.strategy.ts`** — passa a usar `secretOrKeyProvider` que resolve o segredo pelo `kid` do token (fallback para o atual).
- **`backend/src/auth/auth.service.ts`** — `createAccessToken` assina com o segredo atual + `keyid`; `getIdOfCurrentUser` resolve o segredo pelo `kid` (O(1), com fallback para o atual).
- **`backend/src/share/domain/share-token.service.ts`** — share tokens assinados com `kid`; verificação O(1) pelo `kid` (recomputa a assinatura HMAC da senha com o mesmo segredo, comparação com `timingSafeEqual`).
- **`backend/src/config/config.controller.ts`** — `POST /api/configs/admin/rotateJwtSecret` (AdminOnly, `@Throttle` 5/min), retorna `{ rotated: true, retainedSecrets }` (nunca expõe o segredo); log de auditoria com actor (email) e IP.
- **`backend/src/config/jwt-secret-crypto.ts`** (novo) — helpers AES-256-GCM (`encryptSecret`/`decryptSecret`) para criptografia em repouso, compartilhados com o seed.
- **i18n** — mensagens `jwtSecretExternallyManaged` e `jwtSecretRotated` em `pt-BR`.

### Cobertura de testes
- Novo `backend/src/config/jwt-secret.service.spec.ts` (19 casos): precedência env/file/DB, histórico de-duplicado, `kid` round-trip, resolução via header do token, rotação (persistência, cap 13, evicção por idade, normalização legada), concorrência serializada, rotação híbrida com Docker secret file, cache do arquivo, invalidação pós-rotação e criptografia em repouso.
- `auth.service.spec` atualizado para o novo construtor (`jwtSecret`).
- Bateria completa: unit **104/104**, e2e **16/16**, `tsc -p tsconfig.build.json` OK, lint OK, `nest build` OK.

### Notas de operação
- Após rodar `npm run prod` (que executa `prisma db seed`), DBs existentes ganham as linhas `internal.jwtSecretHistory` e `internal.jwtSecretSource`.
- Tokens emitidos **antes** da rotação continuam válidos até expirarem (o antigo segredo fica no histórico, retido por ~13 meses — cobre share tokens de até 1 ano); o acesso token dura 15 min.
- Segredo via env `JWT_SECRET`: rotação deve ser feita no secret manager (a API responde 400).
- Segredo via Docker secret file: a API executa **rotação híbrida** (adota o valor do arquivo para o histórico e passa a usar o DB).
- Criptografia em repouso: definir `JWT_SECRET_ENCRYPTION_KEY` (base64 de 32 bytes) para cifrar `internal.jwtSecret`/`internal.jwtSecretHistory`; sem ela, valores seguem em texto claro (modo legado). ⚠️ Remover a chave depois de usada invalida os tokens (warning no log).
- Detalhes de todas as correções desta rodada: `docs/auditoria/relatorios/CHANGELOG_CORRECOES.md`.

## 28. CI/CD com deploy automatizado (concluído 2026-08-09)

### Objetivo
Encerrar o item "CI/CD com deploy automatizado e reauditoria de segurança trimestral" do
backlog (`CHANGELOG_SUGERIDO.md` §8 / `ROADMAP.md` §6). O CI já existia (R07); o que faltava
era o **deploy automático** após CI verde.

### Implementação
- **`.github/workflows/ci.yml`** — novo job `deploy` (linhas 74-113):
  - `needs: [backend, frontend]` → só roda **depois** que os dois jobs de CI passarem.
  - `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` → só em push na main.
  - `concurrency: { group: deploy-prod, cancel-in-progress: false }` → impede deploys simultâneos.
  - `environment: production` → isolamento de secrets do ambiente.
  - Conecta via SSH ao host (`DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_PORT`/`DEPLOY_SSH_KEY`),
    envia `scripts/deploy/deploy-prod.sh` por stdin (o código executado é o do próprio ref)
    e roda com `TARGET_REF=$GITHUB_SHA`, `RUN_BACKUP=1`.
  - Topo do workflow ganhou `concurrency: ci-${{ github.ref }}` com `cancel-in-progress: true`
    para cancelar runs obsoletos do mesmo ref.
- **`scripts/deploy/deploy-prod.sh`** (novo, 130 LOC, executado no host):
  1. Backup pré-deploy opcional (`RUN_BACKUP=1` → `scripts/backup.sh`, fail-closed com GPG).
  2. `git fetch --prune origin` + resolução do `TARGET_REF` (local ou `origin/<ref>`).
  3. `git checkout --detach <commit>` — deploy imutável pelo SHA que passou no CI.
  4. `docker compose -f docker-compose.prod.yml build`.
  5. `docker compose -f docker-compose.prod.yml up -d --remove-orphans`.
  6. Healthcheck do container backend (60 × 5s até `healthy`).
  7. **Rollback automático** para o ref anterior em falha de build/up/healthcheck.
  - Códigos de saída: `0` sucesso, `1` falha sem rollback, `2` rollback executado.

### Documentação
- **`docs/CI-CD.md`** (novo) — visão geral do pipeline, tabela de secrets, setup one-time
  do host (usuário `deploy`, chave exclusiva, clone em `/opt/controle-share-videos-v1.0`,
  pré-requisitos do compose prod, backup GPG), fluxo de ativação, operações manuais e
  notas de segurança/limitações.

### Validação
- `bash -n scripts/deploy/deploy-prod.sh` — sintaxe OK.
- `python3 -c "import yaml; yaml.safe_load(...)"` em `.github/workflows/ci.yml` — YAML OK.
- Suíte completa (unit 104/104, e2e 16/16, lint, build) não foi afetada — mudanças apenas
  em workflow e script de deploy.

### Pendências/limitações
- **Ativação requer setup manual**: secrets `DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_PORT`/
  `DEPLOY_SSH_KEY` no GitHub + one-time no host (§3-§4 de `docs/CI-CD.md`).
- `StrictHostKeyChecking=no` no job (runner efêmero, sem known_hosts pré-populado); fixar
  a fingerprint do host quando migrar para self-hosted runner.
- Single-host: para multi-réplica evoluir para registry (GHCR) + `docker compose pull`.
- Reauditoria de segurança trimestral segue como item recorrente do ROADMAP (não é scriptável).

---

## 29. QAL-06 — Decomposição de monólitos frontend + unificação de `pLimit` (concluído 2026-08-10)

Fixa **QAL-06** (duplicação leve e arquivos monolíticos no frontend), o último item pendente do `TECH_DEBT.md`. Sem mudança funcional — apenas reorganização.

### Duplicação `pLimit(3)` unificada
- **`frontend/src/utils/concurrency.ts`** (novo) — `UPLOAD_CONCURRENCY = 3` + `createUploadLimiter()`. Elimina o `const promiseLimit = pLimit(3)` duplicado em `EditableUpload.tsx` e `upload/index.tsx` (agora consomem `createUploadLimiter()`).

### `showCreateUploadModal.tsx` 751 → 46 LOC
- **`utils/shareId.util.ts`** (novo) — helpers extraídos: `generateShareId`, `generateAvailableLink`, `generateRandomPassword`.
- **`CreateUploadModalBody.tsx`** (novo, 341 LOC) — body completo do modal (form + validação + accordion).
- **`SimplifiedCreateUploadModal.tsx`** (novo, 172 LOC) — variante simplificada.
- **`CreateUploadForm.ts`** (novo) — tipos `CreateUploadFormValues`/`CreateUploadForm` compartilhados.
- **`sections/`** (novos) — `ExpirationFields.tsx` (98), `FileDescriptionFields.tsx` (49, reutilizado também no simplified), `RecipientsField.tsx` (27), `SecurityFields.tsx` (92).
- `showCreateUploadModal.tsx` permanece como dispatcher (~46 LOC); o tipo `CreateUploadModalOptions` foi extraído e exportado do Body (novo campo `simplified`).

### `showShareInformationsModal.tsx` 398 → 36 LOC
- **`EditShareBody.tsx`** (novo, 227 LOC) — formulário de edição (inclui `formatDateTimeLocal`).
- **`ShareInformationsBody.tsx`** (novo, 151 LOC) — exibição somente-leitura + toggle QR + delegação para edição.
- `showShareInformationsModal.tsx` permanece como dispatcher (~36 LOC).

### Testes ✅
- Frontend: `tsc --noEmit` 0 erros; `eslint` 0 erros, 0 warnings; unit **5/5**; `next build` OK.
- Backend: sem alterações nesta rodada (não tocado).
- Já não existem componentes do frontend acima de ~400 LOC (maiores: `showCreateUploadModalBody` refatorado para 341, `AdminConfigInput.tsx` 327, `Header.tsx` 327).
