# DEPENDENCY_AUDIT.md — Controle Share Videos v1.0

| Campo | Valor |
|---|---|
| Fase de origem | 8 (Infraestrutura/Dependências) + correlações de 7, 10, 11 |
| Data | 2026-08-04 |
| Status | 🔄 Maioria executada — INF-01/QTS-02/DOC-04/QTS-07 resolvidos; infra-02/03/04 pendentes |
| Ambiente | Node v24.18.0 local; `node:24-alpine` em produção |

## 1. Introdução

Auditoria do grafo de dependências dos pacotes do monorepo: `backend/`, `frontend/`, root. Consolida `INF-01` a `INF-04` (Fase 8) com órfãos identificados em Fase 7 (`QAL-02`), Fase 10 (`QTS-07`) e Fase 11 (`DOC-04`).

## 2. Metodologia

- `npm audit` em `backend/` e `frontend/` (vulnerabilidades ativas).
- `npm ls <pkg>` para rastrear cadeias (runtime vs dev) e detectar dependências órfãs (instaladas, zero chamadas).
- Inspeção de `overrides`, `allowScripts` (npm pkg manager), `devDependencies` e `engines`.
- Verificação de metadados `license`/`repository` nos 4 `package.json`.

## 3. Stack verificada (Fase 0)

| Camada | Stack | Versão |
|---|---|---|
| Runtime | Node.js | 24 (alpine) |
| Backend | NestJS | ^11.1.28 |
| ORM | Prisma | ^7.9.0 (adapter better-sqlite3) |
| Banco | SQLite | better-sqlite3@12.11.1 |
| Frontend | Next.js | ^16.2.12 |
| UI | Mantine | ^9.4.2 (core/dropzone/form/hooks/modals/notifications) |

Binários nativos sensíveis à versão do runtime: `better-sqlite3@12.11.1`, `sharp@0.35.3`, `argon2@0.45.1`.

## 4. Evidências e Achados

| ID | Achado | Sev. | Localização |
|----|--------|------|-------------|
| ~~INF-01~~ | ~~**Vulnerabilidades ativas**: override `postcss: 8.5.18` bloqueava `npm audit fix`~~ | ~~🔴~~ | ✅ Resolvido 2026-08-07 — frontend: override removido + `npm audit fix` (0 vulns); backend: `newman` removido (devDep, vetor de 14 vulns transitivas) → 0 vulns |
| INF-02 | Runtime Node **não pinado** (sem `engines`/`.nvmrc`/`.node-version`) → drift dev/staging/prod | 🟠 | root, `backend/`, `frontend/` |
| INF-03 | **Órfãs/sobrepostas**: ~~`clamscan@2.4.0` + `@types/clamscan` (zero chamadas)~~ ✅ removidas após decisão formal do ClamAV (SEC-02); resta frontend `jose@6.2.4` (1 uso: `jose.decodeJwt(...).exp` em `auth.service.ts:46`) coexistindo com `jwt-decode@4.0.0` (middleware) — 2 libs JWT para decodificação pura | 🟠 | `backend/package.json`, `frontend/package.json` |
| INF-04 | Higiene de embalagem: `@types` em produção; duplicidades de build | 🟡 | `backend/`, `frontend/` |
| ~~QTS-07~~ | ~~`@nestjs/testing` órfão (sem specs)~~ | ~~🟡~~ | ✅ Resolvido 2026-08-07 — usado pelo e2e spec (quick wins 12.6) |
| ~~QTS-02~~ | ~~`newman` **não declarado** mas invocado em `test:system`~~ | ~~🟠~~ | ✅ Resolvido 2026-08-07 — `newman` removido (devDep); `test:system` → `test:e2e` efêmero |
| ~~DOC-04~~ | ~~Sem `license`/`repository` nos 4 `package.json`~~ | ~~🟡~~ | ✅ Resolvido 2026-08-07 (quick wins 12.6) — `license: MIT` + `repository` em 4 `package.json` |

## 5. Conclusões

- **Zero vulnerabilidades ativas** (INF-01 resolvido 2026-08-07: `postcss` override removido + `npm audit fix` frontend; `newman` removido backend → 14 vulns transitivas eliminadas).
- Superfície de patch desnecessária: ~~`clamscan` morto (removido em 2026-08-07 após decisão formal do ClamAV)~~, duas libs JWT sobrepostas (`jose`×`jwt-decode`), `@types` em runtime.
- Node não pinado ameaça a reprodutibilidade dos binários nativos (Prisma/better-sqlite3/sharp/argon2).

## 6. Recomendações (prioridade de execução)

1. ~~**P1 — INF-01**: remover override `postcss`→`8.5.22+`; rodar `npm audit fix`**~~ ✅ Resolvido 2026-08-07.
2. **P2 — INF-03**: ~~remover `clamscan`/`@types/clamscan` após decisão ClamAV (SEC-02)~~ ✅ **concluído** — ClamAV rejeitado por decisão formal (`docs/Padronizacao-07-clamav.md`); deps removidas. Resta unificar o JWT no frontend em uma lib (`jose`×`jwt-decode`).
3. **P2 — INF-02**: adicionar `engines` (`node >=24`) e `.nvmrc` na raiz. ⏳ Pendente.
4. ~~**P2 — QTS-02**: declarar `newman` como devDependency~~ ✅ Resolvido 2026-08-07 — `newman` removido (devDep); `test:system` → `test:e2e`.
5. **P3 — INF-04**: mover `@types` para dev. ⏳ Pendente. ~~QTS-07 (`@nestjs/testing` órfão)~~ ✅ Resolvido 2026-08-07.
6. ~~**P3 — DOC-04**: preencher `license`/`repository`~~ ✅ Resolvido 2026-08-07 (quick wins 12.6).

**Ferramenta sugerida para manutenção contínua:** `npm audit` + `renovate`/`dependabot` em PR; pinar runtime via `engines` + imagem Node em `Dockerfile`s.
