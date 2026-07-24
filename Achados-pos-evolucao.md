# Achados de Pós-Evolução — pendências para o sistema 100%

Estado: **relatório consolidado**  
Gerado em: 2026-07-23 (após conclusão das 9 fases do `EVOLUCAO.md`)  
Branch: `main` (último commit: `2706ef9` — Docs: registrar hash Fase 9)  
Fontes: `EVOLUCAO.md` (registos de execução das Fases 1-9) + validações Docker das Fases 7-9

---

## Contexto

As 9 fases do `EVOLUCAO.md` foram concluídas com sucesso (build OK, lint OK, audit frontend 0, signUp/signIn/users/me 200). Este arquivo lista os **problemas remanescentes** que impedem o sistema de funcionar 100% sem erros em runtime, classificados por prioridade. **Nenhum dos itens é regressão introduzida pelas evoluções** — todos são bugs preexistentes do app que ficaram expostos nas validações Docker, ou dívidas técnicas deliberadamente adiadas.

---

## 🔴 PRIORIDADE 1 — Bloqueia `/upload`, `/privacy`, `/imprint` (HTTP 500) — ✅ RESOLVIDO

### #1 — Container: middleware Next não alcançava backend (`API_URL` errada)

- **Sintoma**: `/upload` autenticado retornava HTTP 500 com "Application error: a client-side exception has occurred".
  - Logs do container: `Config fetch failed, using defaults: [TypeError: fetch failed]` seguido de `Error: Config variable share.chunkSize not found`.
  - `/privacy` e `/imprint` redirecionavam para `/` (comportamento correto: `legal.enabled=false` desabilita ambas via `proxy.ts:78-90`).
- **Causa raiz**:
  - `frontend/src/proxy.ts:44` e `frontend/src/pages/_app.tsx:336` usam `process.env.API_URL || "http://localhost:8080"`.
  - O `docker-compose.local.yml` define `BACKEND_PORT=8090` (lido por `backend/src/main.ts:118` para `app.listen`) — então o NestJS ouve em **8090** no container, não 8080.
  - A env `API_URL` não estava definida no compose → middleware e `_app.tsx` caíam no fallback `http://localhost:8080` → **connection refused** dentro do container → `fetch` falha → `getDefaultConfig()` não contém `share.chunkSize` → 500 downstream quando `EditableUpload.tsx`/`upload/index.tsx` tentam `parseInt(config.get("share.chunkSize"))`.
- **Diagnóstico confirmado**:
  - DB do container tem **66 configs** (incluindo `share.chunkSize`); o reportado "33 configs" era um artefato de contagem — `/api/configs` retorna apenas configs `secret=false` (33 públicas), não é bug.
  - `/api/health` e `/api/users/me` funcionavam porque são roteados via Caddy (porta 3000 → 8090); o middleware Next SSR é quem fazia `fetch()` direto a ` localhost:8080` e falhava.
  - Verificado via `docker exec ... wget http://localhost:8080` → connection refused; `wget http://localhost:8090/api/health` → "OK".
- **Fix aplicado** (1 arquivo, 1 linha):
  - `docker-compose.local.yml`: adicionado `API_URL=http://localhost:8090` ao `environment:` do serviço.
  - Não mexeu em código — preserva o fallback `http://localhost:8080` para dev local (onde o backend ouve em 8080 por default, ver `main.ts:118`).
- **Validação** (após fix):
  - `/api/health` → 200 ✅
  - `POST /api/auth/signUp` → 201 com `accessToken` ✅
  - `GET /api/users/me` (cookie jar) → 200 ✅
  - `/upload` autenticado → **200** ✅ (antes 500) — título renderizado "Carregar - Controle Share Videos"
  - `/privacy` autenticado → 200 → redireciona `/upload` (correto, `legal.enabled=false`)
  - `/imprint` autenticado → 200 → redireciona `/upload` (correto)
  - `/` autenticado → 200 → redireciona `/upload` (correto)
  - `/auth/signIn` → 200 ✅
  - Logs do container: **nenhum erro** (sem "Config fetch failed", sem "chunkSize not found")
- **Nota**: o arquivo `data/controle-videos.db?connection_limit=1` (0 bytes, stragglers de pré-Fase 7 — quando `constants.ts` ainda incluía `?connection_limit=1` na URL) é **inócuo**: PrismaBetterSqlite3 não interpreta query params, então ele apenas criou um arquivo vazio com nome estranho. Pode ser removido manualmente (`rm "data/controle-videos.db?connection_limit=1"`) ou ignorado.

---

## 🔴 PRIORIDADE 2 — Vulnerabilidades de segurança (backend)

### #2 — 3 vulns HIGH herdadas da Fase 7 em `prisma@7.9.0`

- **Sintoma**: `npm audit` no backend reporta **3 high** em `prisma@7.9.0` → `@prisma/dev` → `find-my-way`.
- **CVE**: `GHSA-c96f-x56v-gq3h` — DDoS HTTP/2 em `find-my-way` (router HTTP usado pelo Prisma dev engine).
- **Confirmado não regressão Fase 8** via `git stash` — já existiam antes do bump TypeScript 5→6.
- **`npm audit fix --force`** propõe downgrade para `prisma@7.8.0` (breaking — recusado, quebraria a Fase 7).
- **Fix proposto** (recomendado, não-breaking):
  1. Adicionar `overrides` no `backend/package.json`:
     ```json
     "overrides": { "find-my-way": "^5.3.3" }
     ```
     (versão patched; `@prisma/dev` aceita `find-my-way >=4`).
  2. `npm install` e `npm audit` → confirmar 0 vulns.
  3. Rebuild backend, smoke-test signUp/signIn.
  - Alternativa: aguardar `@prisma/dev` bumpar `find-my-way` upstream (sem ETA).

---

## 🟡 PRIORIDADE 3 — Dívidas técnicas adiadas (qualidade, não runtime)

### #3 — TypeScript ficou em 6.0.3 (intermediário), não 7.0.2 como previsto

- **Causa**: `typescript-eslint@8.65.0` (última publicada) tem peer range `typescript: ">=4.8.4 <6.1.0"` — **rejeita TS 7**. `typescript-eslint@9` ainda não publicada.
- **Estado**: TS parado em 6.0.3. `backend/tsconfig.json` já tem `moduleResolution: "node10"` + `ignoreDeprecations: "6.0"` (compativeis com futuro bump para TS 7).
- **Fix**: quando `typescript-eslint@9` sair, bumpzar `typescript@^7` em backend + frontend. Commit trivial (tsconfig já preparado).

### #4 — ESLint 9 → 10 não feito (adiado por risco na Fase 8)

- **Causa**: reduzir risco during TS 5→6; ESLint 10 tem breaking changes em flat config.
- **Estado**: já usamos flat config `.mjs` em backend e frontend; ESLint 9.x funcional.
- **Fix**: bumpzar juntos `eslint` + `eslint-config-next` + `@typescript-eslint/*` após resolver #3 — idealmente no mesmo commit do bump TS 7.

### #5 — `moment` ainda presente no frontend (~7 arquivos)

- **Causa**: migração moment→dayjs ficou fora de escopo da Fase 8 (backend já migrou na Fase 4).
- **Estado**: `frontend/src/pages/_app.tsx:14` tem `// @ts-ignore` para `import "moment/min/locales"` introduzido na Fase 8 (necessário porque `moduleResolution: "bundler"` exige declaração de tipos que moment side-effect import não tem).
- **Fix**:
  1. Substituir `moment` por `dayjs` nos arquivos identificados (ver `grep -rln "moment" frontend/src/` — ~7 arquivos).
  2. Remover `moment` do `frontend/package.json`.
  3. Remover o `// @ts-ignore` de `_app.tsx:14`.
  4. Rebuild + lint frontend.

### #6 — Warnings de lint preexistentes (backend)

- **Sintoma**: `npm run lint` backend: **26 warnings `no-explicit-any`** (preexistentes).
- **Sintoma**: `npm run lint` frontend: **1 warning** de directive `eslint-disable` não usada (preexistente desde Fase 8).
- **Fix**: revisão pontual — tipar os `any` do backend um a um; remover a directive não usada do frontend. Não bloqueante para runtime.

### #7 — `tsconfig` com strictness baixa

- **Estado**: `strictNullChecks: false` etc. mantidos na Fase 8 deliberadamente.
- **Fix**: gradualmente ativar flags de strictness (`strictNullChecks`, `strictFunctionTypes`, etc.) e corrigir erros que surgirem. Projeto longo — não bloqueante.

### #8 — Decorators ainda no modo experimental

- **Estado**: NestJS DI usa `experimentalDecorators` + `emitDecoratorMetadata` no `backend/tsconfig.json`. Migração para TC39 decorators standard (estág > 3) ficou fora de escopo da Fase 8.
- **Fix**: acompanhar suporte oficial do NestJS a TC39 decorators; migrar quando estável. Não bloqueante.

---

## 🟢 Resolvidos pelas Fases (não requerem ação — referência)

- ✅ `_app.tsx` `// @ts-ignore` para `moment/min/locales` — workaround temporário (ver #5 para remoção definitiva ao migrar para dayjs).
- ✅ TS errors latentes corrigidos na Fase 8: `backend/src/system/system.service.ts:29,39` (`(e as Error).message`), `backend/tsconfig.json` `types: ["multer","node"]` para `Express.Multer.File`.
- ✅ `backend/src/generated/` residual limpo na Fase 8; `/backend/src/generated/` adicionado ao `.gitignore`.
- ✅ markdown-to-jsx 7→9 (Fase 9): 3 arquivos (`privacy/index.tsx`, `imprint/index.tsx`, `components/share/FilePreview.tsx`) atualizados para import path `markdown-to-jsx/react`. API de options idêntica — confirmação técnica: o `EVOLUCAO.md` previa erroneamente que v9 renomearia `overrides` → `components`; verificado no `dist/index.d.ts` oficial v9.9.0 que `Overrides`/`RequireAtLeastOne<{ component, props }>` foram mantidos sem renomeação.

---

## Ordem de execução recomendada

1. ~~**#1** — corrigir seed (bloqueia 3 páginas · risco 🟡 · impacta runtime imediatamente)~~ ✅ **RESOLVIDO** — eram `API_URL` errada, não seed (commitpendente)
2. **#2** — `overrides` de `find-my-way` (vulns HIGH · risco 🟢 · change isolado em `package.json`)
3. **#5** — migrar moment → dayjs no frontend (remove `@ts-ignore` · risco 🟡 · ~7 arquivos)
4. **#6** — warnings de lint (risco 🟢 · revisão pontual)
5. **#3 + #4** — aguardar `typescript-eslint@9`, depois bump TS 6→7 + ESLint 9→10 juntos
6. **#7** — strictness em ciclos subsequentes
7. **#8** — TC39 decorators quando NestJS oficializar

---

## Validação final (critério de "100% sem erros")

Após resolver #1 e #2, o sistema deve passar:

- [ ] `npm run build` backend = 0 erros
- [ ] `npm run build` frontend = 0 erros
- [ ] `npm run lint` backend = 0 erros (warnings #6 aceitáveis temporariamente)
- [ ] `npm run lint` frontend = 0 erros
- [ ] `npm audit` backend = **0 vulns** (após #2)
- [ ] `npm audit` frontend = 0 vulns (já OK)
- [x] Docker: `docker compose -f docker-compose.local.yml up -d` sobe sem erros ✅
- [x] `GET /api/health` → 200 ✅
- [x] `POST /api/auth/signUp` → 201 (com `access_token` cookie + `accessToken` body) ✅
- [x] `POST /api/auth/signIn` → token + cookie `access_token` no Set-Cookie ✅
- [x] `GET /api/users/me` (cookie jar) → 200 ✅
- [x] `GET /privacy` → 200 (autenticado → redireciona `/upload`; `legal.enabled=false` desabilita página) ✅
- [x] `GET /imprint` → 200 (mesmo comportamento de `/privacy`) ✅
- [x] `GET /upload` autenticado → 200 (valida #1 — dependência de `share.chunkSize`) ✅
- [x] `GET /` → 200 ✅
- [x] `GET /auth/signIn` → 200 ✅
- [x] Logs do container sem "Config variable X not found" nem "Config fetch failed" ✅

---

## Referências (código)

- `backend/prisma/seed/config.seed.ts:106` — `share.chunkSize` definida no seed
- `backend/prisma/seed/config.seed.ts:364-390` — `seedConfigVariables()` (alvo do fix #1)
- `backend/prisma/seed/config.seed.ts:392-437` — `migrateConfigVariables()` (deleta obsoletas, não cria faltantes)
- `backend/package.json` — alvo do override #2 `find-my-way`
- `backend/src/auth/strategy/jwt.strategy.ts:22` — `JwtStrategy.extractJWT` lê só `req.cookies.access_token` (não suporta Bearer header — usar cookie jar `curl -c/-b`)
- `frontend/src/pages/_app.tsx:14` — `// @ts-ignore` para `moment/min/locales` (remove no #5)
- `frontend/package.json` — `markdown-to-jsx@^9.9.0` (Fase 9 OK)
- `frontend/src/pages/privacy/index.tsx`, `frontend/src/pages/imprint/index.tsx`, `frontend/src/components/share/FilePreview.tsx` — import path `markdown-to-jsx/react` (Fase 9 OK)
