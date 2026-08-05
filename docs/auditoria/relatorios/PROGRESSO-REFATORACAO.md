# PROGRESSO-REFATORACAO.md — Execução R01–R08 (Fase 12)

| Campo | Valor |
|---|---|
| Plano de referência | `REFACTORING_PLAN.md` |
| Última atualização | 2026-08-04 |
| Branch | `fix/producao-v1.1.0` |

## 1. Visão geral

| Épico | Status | Obs. |
|---|---|---|
| R07 — Testes + CI | ✅ Concluído | pré-requisito, todos os critérios verdes |
| R02 — JwtGuard fail-closed | ✅ Concluído | — |
| R01 — BigInt size/shareSizeLimit | ✅ Concluído | migration + deploy coordenado |
| R08 — Docker/Caddy | ✅ Concluído | compose prod com `target: frontend` |
| R03 — Paginação nas listagens | ⬜ Pendente | próximo |
| R04 — Jobs de limpeza em lote + transação | ⬜ Pendente | — |
| R06 — Config tipada | ⬜ Pendente | — |
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

## 6. Próximos passos

1. ~~**Validar CI no GitHub**~~ ✅ push do branch `fix/producao-v1.1.0` e CI verde (backend + frontend, PR #1).
2. **Revisão e merge** do PR #1 em `main` (após validação do usuário).
3. **Registrar changelog/tech-debt**: marcar R01 (breaking) e R02/R07/R08 no `CHANGELOG_SUGERIDO.md` e `TECH_DEBT.md`.
4. **R03 — Paginação nas listagens**: mudança de shape de resposta é breaking → versionar ou manter compat, registrar no changelog.
5. **R04 — Jobs de limpeza em lote + transação**.
6. **R06 — Config tipada**.
7. **R05 — Decomposição do `ShareService`** (por último; agora com rede de testes ativa).
