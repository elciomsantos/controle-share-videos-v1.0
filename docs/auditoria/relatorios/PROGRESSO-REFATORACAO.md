# PROGRESSO-REFATORACAO.md — Execução R01–R08 (Fase 12)

| Campo | Valor |
|---|---|
| Plano de referência | `REFACTORING_PLAN.md` |
| Última atualização | 2026-08-07 |
| Branch | `fix/producao-v1.1.0` |
| Commits | `98de696` (BDB-02), `4686195` (R03 Breaking) |

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
| R05 — Decomposição do ShareService | ⬜ Pendente | depende da rede de testes (R07 ok) |

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

## 8. Próximos passos

1. ~~**Validar CI no GitHub**~~ ✅ push do branch `fix/producao-v1.1.0` e CI verde (backend + frontend, PR #1).
2. ~~**R03 — Paginação nas listagens**~~ ✅ (commit `4686195`) — envelope `Page<T>`, quebra de contrato v1.2.0.
3. ~~**BDB-02 — Índices nos caminhos quentes**~~ ✅ (commit `98de696`) — 5 @@index, sem quebra de contratos.
4. ~~**R04 — Jobs de limpeza em lote + transação**~~ ✅ — batch 50 + cursor + `try/catch` por item.
5. ~~**R06 — Config tipada**~~ ✅ — backend + frontend, sem `any`/`parseInt` manual.
6. **Revisão e merge** do PR #1 em `main` (após validação do usuário).
7. **Registrar changelog/tech-debt**: marcar R01 (breaking), BDB-02, R03, R04 e R06 no `CHANGELOG_SUGERIDO.md` e `TECH_DEBT.md`.
8. **R05 — Decomposição do `ShareService`** (por último; agora com rede de testes ativa).
