# DEPENDENCY_AUDIT.md — Controle Share Videos v1.0

| Campo | Valor |
|---|---|
| Fase de origem | 8 (Infraestrutura/Dependências) + correlações de 7, 10, 11 |
| Data | 2026-08-04 |
| Status | ✅ Consolidação entregue (correções pendentes de execução — Fase 13) |
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
| INF-01 | **Vulnerabilidades ativas**: backend 1 high (`fast-uri@3.1.4`, GHSA-7p8r-x3mc-p8w7, cadeia **dev-only**: `@nestjs/cli → @angular-devkit/core → ajv → fast-uri`); frontend 2 moderate (`postcss ≤8.5.22`, via `next@16.2.12`). **Agravante:** override `postcss: 8.5.18` (linha 13) está **na faixa vulnerável** e **bloqueia `npm audit fix`** | 🔴 | `frontend/package.json:13` |
| INF-02 | Runtime Node **não pinado** (sem `engines`/`.nvmrc`/`.node-version`) → drift dev/staging/prod | 🟠 | root, `backend/`, `frontend/` |
| INF-03 | **Órfãs/sobrepostas**: ~~`clamscan@2.4.0` + `@types/clamscan` (zero chamadas)~~ ✅ removidas após decisão formal do ClamAV (SEC-02); resta frontend `jose@6.2.4` (1 uso: `jose.decodeJwt(...).exp` em `auth.service.ts:46`) coexistindo com `jwt-decode@4.0.0` (middleware) — 2 libs JWT para decodificação pura | 🟠 | `backend/package.json`, `frontend/package.json` |
| INF-04 | Higiene de embalagem: `@types` em produção; duplicidades de build | 🟡 | `backend/`, `frontend/` |
| QTS-07 | `@nestjs/testing` órfão (sem specs) | 🟡 | `backend/package.json:79` |
| QTS-02 | `newman` **não declarado** mas invocado em `test:system` (binário ausente) | 🟠 | `backend/package.json:10` |
| DOC-04 | Sem `license`/`repository` nos 4 `package.json` (LICENSE BSD-2-Clause existe na raiz) | 🟡 | 4× `package.json` |

## 5. Conclusões

- **Nenhuma vulnerabilidade de runtime explorável de forma prática** (fast-uri é dev-only; postcss exige CSS controlado pelo atacante). Porém, a **correção de postcss está bloqueada pela própria config** (`overrides` pinado em versão vulnerável) — barreira de processo, não técnica.
- Superfície de patch desnecessária: ~~`clamscan` morto (removido em 2026-08-07 após decisão formal do ClamAV)~~, duas libs JWT sobrepostas (`jose`×`jwt-decode`), `@types` em runtime.
- Node não pinado ameaça a reprodutibilidade dos binários nativos (Prisma/better-sqlite3/sharp/argon2).

## 6. Recomendações (prioridade de execução)

1. **P1 — INF-01**: remover override `postcss` → `8.5.22+`; rodar `npm audit fix` nos dois pacotes; reauditar.
2. **P2 — INF-03**: ~~remover `clamscan`/`@types/clamscan` após decisão ClamAV (SEC-02)~~ ✅ **concluído** — ClamAV rejeitado por decisão formal (`docs/Padronizacao-07-clamav.md`); deps removidas. Resta unificar o JWT no frontend em uma lib (`jose`×`jwt-decode`).
3. **P2 — INF-02**: adicionar `engines` (`node >=24`) e `.nvmrc` na raiz.
4. **P2 — QTS-02**: declarar `newman` como devDependency (junto a R07).
5. **P3 — INF-04/QTS-07**: mover `@types` para dev, remover `@nestjs/testing` órfão.
6. **P3 — DOC-04**: preencher `license`/`repository` (aponta para `LICENSE` e repo upstream/fork).

**Ferramenta sugerida para manutenção contínua:** `npm audit` + `renovate`/`dependabot` em PR; pinar runtime via `engines` + imagem Node em `Dockerfile`s.
