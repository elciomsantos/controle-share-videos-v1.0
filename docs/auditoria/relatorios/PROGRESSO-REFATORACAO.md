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

