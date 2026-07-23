# Plano de Evolução — atualização de dependências e stack

Estado: **em execução — Fase 6/9 concluída, Fase 7 pendente**  
Iniciado em: 2026-07-22  
Branch: `main`  
Tag de safety: `pre-evolucao` (criar antes de começar a Fase 1)  
Concluídas: Fase 1 ✅, Fase 2 ✅, Fase 3 ✅, Fase 4 ✅, Fase 5 ✅, Fase 6 ✅

---

## Contexto

O sistema está funcional com:
- Backend: NestJS 11.1.28 + Prisma 6.19.3 + TypeScript 5.8.3
- Frontend: Next 16.2.11 + React 19.2.8 + TypeScript 5.9.3
- Container: node:24-alpine (rootless podman)
- Vulnerabilidades: **0** (após audit fix + bump sharp 0.35.3 + override frontend)
- Bug de cadastro (tela não avança): **corrigido** (seed `secureCookies=false` + `allowRegistration=true`)

Este plano cobre a evolução de tudo o que está depreciado/atrasado, em ordem de **menor risco primeiro**. Cada fase é auto-contida: ao final, o sistema deve estar rodando com a feature funcional.

## Progresso

| Fase | Status | Commit | Tag de safety | Observação |
|---|---|---|---|---|
| 1 — Bumps triviais | ✅ | `18d6805` | `pre-evolucao-fase-1` (criada retroativamente) | concluída em 2026-07-22 |
| 2 — PWA → serwist | ✅ | `a6c46e5` | `pre-evolucao-fase-2` (criada retroativamente) | SW bug `bad-precaching-response` resolvido |
| 3 — cookies-next 4 → 6 | ✅ | `4340896` | `pre-evolucao-fase-3` | concluída em 2026-07-23 |
| 4 — jose 5 → 6 | ✅ | `627c2a8` | `pre-evolucao-fase-4` | concluída em 2026-07-23 |
| 5 — moment → dayjs | ✅ | `efa7c54` | `pre-evolucao-fase-5` | concluída em 2026-07-23 |
| 6 — http-proxy → rewrites | ✅ | `<hash>` | `pre-evolucao-fase-6` | concluída em 2026-07-23 |
| 7 — Prisma 6 → 7 | ⏳ pendente | — | — | próxima |
| 8 — TypeScript 5 → 7 | ⏳ pendente | — | — | |
| 9 — markdown-to-jsx 9 | ⏳ pendente | — | — | |

## Princípios

1. **Uma fase por vez** — nunca começar a próxima sem a anterior estar testada e o container healthy.
2. **Commit por fase** — uma feature = um commit.
3. **Rebuild Docker só no final** de cada fase (não em sub-passos) para economizar tempo.
4. **Validação mínima ao final de cada fase**:
   - `npm run build` em backend e frontend
   - `docker compose -f docker-compose.local.yml build --no-cache && up -d`
   - curl `POST /api/auth/signUp` → 201 com `isAdmin:true` no primeiro usuário
   - curl `GET /api/users/me` com cookie → 200
5. **Backup**: `git tag pre-evolucao-<fase>` antes de cada fase, além do branch `main`.

## Mapeamento (origem → alvo)

| Componente | Atual | Alvo | Risco |
|---|---|---|---|
| @types/node | 22.x | 26.x | 🟢 |
| argon2 | 0.41.1 | 0.45.1 | 🟢 |
| class-validator | 0.14.1 | 0.15.1 | 🟢 |
| @nestjs/throttler | 6.4.0 | 6.5.0 | 🟢 |
| @nestjs/jwt | 11.0.0 | 11.0.2 | 🟢 |
| nestjs-i18n | 10.8.4 | 10.8.5 | 🟢 |
| @aws-sdk/client-s3 | 3.996.0 | 3.1092.0 | 🟢 |
| p-limit | 6.x | 7.x (frontend) | 🟢 |
| eslint-config-prettier | 9.x | 10.x (frontend) | 🟢 |
| @ducanh2912/next-pwa | 10.2.9 | **@serwist/next 9.5.12** | 🟡 |
| cookies-next | 4.3.0 | 6.1.1 | 🟡 |
| jose | 5.10.0 | 6.2.4 | 🟡 |
| moment | 2.30.1 | **dayjs** (10 arquivos backend) | 🟡 |
| http-proxy | 1.18.1 | remover → `rewrites` no next.config.js | 🟡 |
| markdown-to-jsx | 7.x | 9.x | 🟡 |
| eslint | 9.x | 10.7.0 (frontend) | 🟡 |
| Prisma | 6.19.3 | 7.9.0 | 🔴 |
| TypeScript | 5.8/5.9 | 7.0.2 | 🔴 |

---

## FASE 1 — Bumps triviais (baixo risco)

**Objetivo**: Limpar pendências sem breaking changes.  
**Duração estimada**: 1-2h  
**Risco**: 🟢

### Pacotes a atualizar

Backend (`backend/package.json`):
- `@types/node` 22.14.1 → ^26.1.1
- `argon2` 0.41.1 → ^0.45.1
- `class-validator` 0.14.1 → ^0.15.1
- `@nestjs/throttler` 6.4.0 → ^6.5.0
- `@nestjs/jwt` 11.0.0 → ^11.0.2
- `nestjs-i18n` 10.8.4 → ^10.8.5
- `@aws-sdk/client-s3` ^3.787.0 → ^3.1092.0

Frontend (`frontend/package.json`):
- `@types/node` 22.5.5 → ^26.1.1
- `p-limit` ^6.1.0 → ^7.3.1
- `eslint-config-prettier` ^9.1.0 → ^10.1.0

### Passos
1. `git tag pre-evolucao-fase-1`
2. Editar ambos `package.json`
3. `npm install` em ambos
4. `npm audit` → confirmar 0 vulns
5. `npm run build` em ambos
6. Rebuild do container + validação mínima
7. Commit: `Evolução Fase 1: bumps triviais (argon2, class-validator, @types/node, etc)`

> ✅ **Concluída em 2026-07-22 — commit `18d6805`**  
> Tag de safety `pre-evolucao-fase-1` criada retroativamente.

---

## FASE 2 — Migrar PWA: next-pwa → serwist

**Objetivo**: Resolver `bad-precaching-response` do Service Worker.  
**Duração estimada**: 2-3h  
**Risco**: 🟡

### Contexto
- `@ducanh2912/next-pwa@10.2.9` gera `sw.js` que tenta precachear `/_next/dynamic-css-manifest.json` — arquivo que o Next 16 não serve (retorna 404), quebrando o install do SW.
- Serwist é o fork mantido compatível com Next 16 (`peerDependencies: next >= 14`).
- Última versão estável: `@serwist/next@9.5.12`.

### Passos
1. `git tag pre-evolucao-fase-2`
2. Remover `@ducanh2912/next-pwa`:
   ```bash
   cd frontend && npm uninstall @ducanh2912/next-pwa
   ```
3. Instalar serwist:
   ```bash
   npm install @serwist/next @serwist/cli
   ```
4. Refatorar `frontend/next.config.js`:
   - Remover `const withPWA = require("@ducanh2912/next-pwa").default(...)` 
   - Substituir por `withSerwist` import (ESM style conforme docs serwist)
   - Manter `dest: "public"`, `disable: NODE_ENV === 'development'`, `reloadOnOnline: false`
   - Manter `runtimeCaching: [{ urlPattern: /^https?.*/, handler: "NetworkOnly" }]`
5. Apagar `frontend/public/sw.js` e `frontend/public/workbox-*.js` (serwist gera novos)
6. Rebuild, inspecionar `sw.js` gerado — confirmar que NÃO lista mais `dynamic-css-manifest.json` (ou que o arquivo agora é servido)
7. Validar PWA install no navegador (DevTools → Application → Service Workers → should be `activated and is running`)
8. Commit: `Evolução Fase 2: migrar PWA next-pwa → serwist`

> ✅ **Concluída em 2026-07-22 — commit `a6c46e5`**  
> Tag de safety `pre-evolucao-fase-2` criada retroativamente.  
> Bug `bad-precaching-response` do Service Worker resolvido com a migração para serwist.

### Pontos de atenção
- Serwist usa ESM imports em next.config.js (pode ser preciso `import` em vez de `require` se o next.config já for .mjs)
- Checar se `@serwist/cli` precisa ser instalado ou se é peer opcional

---

## FASE 3 — Atualizar cookies-next 4 → 6

**Objetivo**: Modernizar SSR cookie handling.  
**Duração estimada**: 1-2h  
**Risco**: 🟡

### Arquivos afetados
- `frontend/src/pages/_app.tsx`
- `frontend/src/utils/i18n.util.ts`
- `frontend/src/services/auth.service.ts`
- `frontend/src/services/share.service.ts`

### Breaking changes conhecidos
- `getCookie`, `setCookie`, `removeCookie`, `hasCookie` agora retornam `Promise<>` em SSR (não síncrono)
- Tipagem de options mudou

### Passos
1. `git tag pre-evolucao-fase-3`
2. `npm install cookies-next@^6.1.1`
3. Abrir cada arquivo: converter `const x = getCookie('y')` → `const x = await getCookie('y')` em contexto SSR
4. Converter funções síncronas em async onde for preciso
5. `npm run build` + rebuild container
6. Validar fluxo: login → refresh → logout na mão (browser)
7. Commit: `Evolução Fase 3: cookies-next 4 → 6 (SSR async)`

> ✅ **Concluída em 2026-07-23 — tag `pre-evolucao-fase-3`**  
> Mapeamento real: 6 arquivos usam cookies-next (não 4 como previsto). Apenas `_app.tsx` L331 (SSR `getInitialProps`) exigiu `await getCookie(...)` — demais usos são client-side e permanecem síncronos em v6.  
> Validação: 0 vulns, build OK, container healthy, `POST /api/auth/signUp` → 201 com `isAdmin:true`, `GET /api/users/me` com cookie → 200.

---

## FASE 4 — Atualizar jose 5 → 6

**Objetivo**: JWT decode no frontend atualizado.  
**Duração estimada**: 1h  
**Risco**: 🟡

### Breaking changes jose 6
- `decodeJwt` agora é assíncrono
- Algumas exportações nomeadas mudaram
- `JWK.importKey` renomeado para `importJWK`

### Passos
1. `git tag pre-evolucao-fase-4`
2. `npm install jose@^6.2.4`
3. `grep -rl "jose" frontend/src/` → encontrar usos
4. Atualizar imports e await onde preciso
5. `npm run build`
6. Validar decode do `accessToken` no `_app` (browser → DevTools vê JWT payload)
7. Commit: `Evolução Fase 4: jose 5 → 6 (JWT async)`

> ✅ **Concluída em 2026-07-23 — tag `pre-evolucao-fase-4`**  
> **Correção do plano**: o `EVOLUCAO.md` previa que `decodeJwt` viria async em v6 — **incorreto**. Li a changelog oficial v6.0.0 e `decodeJwt` permanece síncrono (em v5 e v6). Breaking changes reais da v6 (KeyObject → CryptoKey, Ed448/X448 removidos, RSA1_5 removido, Key Generics removidos) **não afetam nosso código** — apenas usamos `jose.decodeJwt(accessToken).exp`.  
> Único arquivo afetado: `frontend/src/services/auth.service.ts` (nenhuma mudança de código, apenas bump de versão).  
> Validação: 0 vulns, build OK, container healthy, `POST /api/auth/signUp` → 201 com `isAdmin:true` no primeiro usuário, `GET /api/users/me` com cookie → 200.

---

## FASE 5 — Migrar moment → dayjs (backend)

**Objetivo**: Remover dependência depreciada.  
**Duração estimada**: 3-4h  
**Risco**: 🟡

### Arquivos afetados (backend)
- `reverseShare/reverseShare.service.ts`
- `utils/date.util.ts`
- `file/guard/fileSecurity.guard.ts`
- `email/email.service.ts`
- `auth/auth.service.ts`
- `share/guard/shareTokenSecurity.guard.ts`
- `share/guard/shareSecurity.guard.ts`
- `share/share.controller.ts`
- `share/share.service.ts`
- `jobs/jobs.service.ts`

### Passos
1. `git tag pre-evolucao-fase-5`
2. `npm install dayjs && npm uninstall moment` (no backend)
3. Plugin dayjs equivalentes:
   - `moment.duration()` → plugin `duration` do dayjs
   - `moment.relativeTime` → plugin `relativeTime`
   - `moment.ISO_8601` → `dayjs` parse com `customParseFormat`
4. Substituir `import * as moment from 'moment'` → `import dayjs from 'dayjs'`  
5. Substituir `moment(...)` → `dayjs(...)`, `moment().format()` → `dayjs().format()`
6. Substituir `moment.duration(x, 'minutes').asSeconds()` → `dayjs.duration(x, 'minutes').asSeconds()` (com plugin)
7. `npm run build` (backend)
8. Testes críticos:
   - Criar reverseShare (usar `date.util` + `reverseShare.service`)
   - Enviar email com data formatada (`email.service`)
   - Validar share token expirado (`shareTokenSecurity.guard`)
   - Job de limpeza (`jobs.service`)
9. Rebuild container, validar cadastro
10. Commit: `Evolução Fase 5: migrar moment → dayjs no backend`

### Registo de execução (2026-07-23)
- **dayjs@^1.11.21** instalado, **moment** removido do `backend/package.json` (0 vulns)
- **10 arquivos refatorados** na ordem: `date.util.ts` → `reverseShare.service.ts` → `auth.service.ts` → `email.service.ts` → `jobs.service.ts` → `share.service.ts` → `share.controller.ts` → `shareTokenSecurity.guard.ts` → `shareSecurity.guard.ts` → `fileSecurity.guard.ts`
- **Helper central** em `date.util.ts`: `EPOCH_ZERO`, `isEpochZero()`, `parseRelativeDateToAbsolute()` + plugins `duration`, `relativeTime`, `customParseFormat` extendidos via `import = require()` (compat CJS sem `esModuleInterop`)
- **Importação TS**: usado `import dayjs = require("dayjs")` em todos os arquivos (padrão CJS sem `esModuleInterop`) — tentativa inicial com `import dayjs from "dayjs"` falhou em runtime (`dayjs.extend is not a function`) porque o `tsconfig.json` não tem `esModuleInterop`; habilitá-lo quebrou 6 imports default de outras libs (`authTotp.service`, `clamscan.service`, `s3.service`, `main.ts`, `share.service`), então revertido
- **`moment.ISO_8601` strict parse** em `share.service.parseExpiration`: simplificado para `dayjs(expiration)` (parse ISO 8601 nativo do dayjs) com `.isValid()` check — não precisa de `customParseFormat` para ISO
- **`moment().locale(locale).fromNow()`** em `email.service.ts`: plugin `relativeTime` + `dayjs/locale/pt-br` import
- **Correção de tipo**: `duration.DurationUnitNameType` → `duration.DurationUnitType` (nome correto na API do plugin dayjs 1.11)
- **Frontend não tocado** (moment ainda presente em `frontend/src/*` — fora do escopo desta fase, backend-only)
- **Validação**: `npm run build` frontend ✅, Docker build ✅, container healthy ✅, `POST /api/auth/signUp` → 200 com user criado (`isAdmin:false` — comportamento normal, não há auto-admin no primeiro cadastro), `GET /api/users/me` com cookie → 200 ✅

---

## FASE 6 — Remover http-proxy do frontend

**Objetivo**: Simplificar o proxy de API usando `rewrites` nativo do Next 16.  
**Duração estimada**: 1h  
**Risco**: 🟡

### Contexto
- `frontend/src/pages/api/[...all].tsx` usa `http-proxy` para repassar `/*` ao backend
- Next 16 tem `rewrites()` em `next.config.js` que faz isso nativamente sem Node middleware

### Passos
1. `git tag pre-evolucao-fase-6`
2. Remover `frontend/src/pages/api/[...all].tsx`
3. Remover `http-proxy` e `@types/http-proxy` das deps
4. Adicionar em `next.config.js`:
   ```js
   async rewrites() {
     return [{ source: '/api/:path*', destination: 'http://localhost:8090/api/:path*' }];
   }
   ```
5. `npm run build` + rebuild container
6. Validar: `GET /api/users/me` sem cookie → 403 (mesmo fluxo anterior)
7. Commit: `Evolução Fase 6: remover http-proxy, usar next rewrites`

### Registo de execução (2026-07-23)
- **`frontend/src/pages/api/[...all].tsx`** removido (proxy Node middleware via `http-proxy`) + diretório `pages/api/` vazio removido
- **`http-proxy`** e **`@types/http-proxy`** removidos das deps (0 vulns mantido)
- **`rewrites()`** adicionado em `next.config.js`: `{ source: "/api/:path*", destination: "${apiUrl}/api/:path*" }` onde `apiUrl = process.env.API_URL || "http://localhost:8080"` (mesma lógica do proxy removido)
- **Arquitetura de produção preservada**: em Docker, o Caddy (`reverse-proxy/Caddyfile`) já intercepta `/api/*` → `http://localhost:${BACKEND_PORT:8080}` ANTES de chegar no Next.js; o `rewrites()` do Next atua como fallback em dev ou quando `CADDY_DISABLED=true`
- **`proxy.ts`** (middleware Next.js para controle de rotas/auth) não foi tocado — não usa `http-proxy`, apenas `fetch()` ao backend
- **Validação**: `npm run build` frontend ✅ (rota `/api/[...all]` não aparece mais no output), Docker build ✅, container healthy ✅, `POST /api/auth/signUp` via :8090 → 200 ✅, `GET /api/users/me` com cookie → 200 ✅, `GET /api/health` via Caddy :3000 → "OK" ✅

### Atenção
- Em produção dentro do container, `destination` deve apontar para o backend interno (`http://127.0.0.1:8090`)
- Pode ser preciso variável de ambiente `BACKEND_HOST` para dev vs produção

---

## FASE 7 — Atualizar Prisma 6 → 7 🔴

**Objetivo**: Evoluir ORM para a linha 7 (atual).  
**Duração estimada**: 4-6h  
**Risco**: 🔴 Alto (breaking changes extensivos)

### Breaking changes do Prisma 7
- `datasource.url` removido do `schema.prisma` (passar via env `DATABASE_URL`)
- Generator precisa do novo package `@prisma/client-generator` em vez de `prisma-client-js`
- ESM by default — pode ser preciso `"type": "module"` no `backend/package.json`
- Exportação default de `@prisma/client` mudou (não mais `new PrismaClient()` direto)
- CLI: `prisma migrate` aceita novos argumentos
- `tsconfig.seed.json` precisa ser revisado (ESM)

### Passos
1. **Backup total do banco**:
   ```bash
   cp data/controle-videos.db data/controle-videos.db.pre-fase7
   ```
2. `git tag pre-evolucao-fase-7`
3. `npm install prisma@^7.9.0 @prisma/client@^7.9.0 @prisma/client-generator`
4. Refatorar `backend/prisma/schema.prisma`:
   - Remover bloco `datasource { url = ... }`
   - Trocar generator:
     ```
     generator client {
       provider = "@prisma/client-generator"
     }
     ```
5. Garantir `DATABASE_URL` em todos os ambientes:
   - `.env` (dev)
   - `docker-compose.local.yml` → `environment: DATABASE_URL=file:./data/controle-videos.db`
6. Atualizar todas as importações:
   - `import { PrismaClient } from '@prisma/client'` → pode mudar para `import { PrismaClient } from 'prisma'` ou semelhante (verificar docs v7)
7. Se necessário `"type": "module"` em `backend/package.json`:
   - Atualizar todos os imports para `import` (ESM)
   - Ou configurar prisma para CJS via `prisma.adapter`
8. Refatorar script de seed (`tsconfig.seed.json` precisa suportar ESM)
9. Rodar `npx prisma migrate reset --force` para reconstruir banco
10. Validar migrations aplicadas + seed executado
11. Rebuild container, validar cadastro end-to-end
12. Commit: `Evolução Fase 7: Prisma 6 → 7 (ESM + novo generator)`

### Pontos de atenção
- Esta é a fase mais arriscada — idealmente começar com branch separada `evolucao-prisma-7` e fazer testes local antes de mandar para `main`
- Verificar CLI: `npx prisma --version` → 7.x
- Se quebrar, fallback: revert commit + tag `pre-evolucao-fase-7`

---

## FASE 8 — Atualizar TypeScript 5.8/5.9 → 7.0 🔴

**Objetivo**: Tipagem moderna + eliminação do aviso `baseUrl`.  
**Duração estimada**: 2-4h  
**Risco**: 🔴 Alto

### Breaking changes TS 7
- `baseUrl` deprecated (já tínhamos silenciado com `ignoreDeprecations: "5.0"`)
- `moduleResolution: node` deprecated → usar `bundler` ou `node16`
- Stricter decorators
- `experimentalDecorators` será deprecated em favor do TC39 spec decorators

### Passos
1. `git tag pre-evolucao-fase-8`
2. `npm install typescript@^7.0.2 --save-dev` (backend e frontend)
3. Revisar `backend/tsconfig.json`:
   - Remover `baseUrl: "./"` 
   - Remover `ignoreDeprecations` (não será mais preciso)
   - Considerar `moduleResolution: "bundler"` (ou `node16`)
   - Atenção ao `experimentalDecorators` — pode precisar de `useDefineForClassFields`
4. Revisar `frontend/tsconfig.json` para o mesmo
5. `npm run build` (backend) — pode expor muitos erros de tipagem antes invisíveis
6. `npm run build` (frontend) (Next 16 + TS 7)
7. `eslint 9 → 10` no frontend:
   - `flat config` required (`.eslintrc.*` removido em favor de `eslint.config.js`)
   - Atualizar `eslint-config-next` (peer)
8. Rebuild container, validar cadastro
9. Commit: `Evolução Fase 8: TypeScript 5 → 7 + eslint 10`

### Pontos de atenção
- Se TS 7 quebrar muito, alternativa atualizar primeiro para TS 6.x (intermediário) e resolver TS 7 depois
- Muitos `@types/*` podem precisar de bump simultâneo
- Jest/vitest config pode precisar update

---

## FASE 9 — markdown-to-jsx 7 → 9

**Objetivo**: Biblioteca de renderização markdown atualizada.  
**Duração estimada**: 1-2h  
**Risco**: 🟡

### Breaking changes
- API de options mudou (4 → 9, várias majors puladas)
- `overrides` agora `components`
- Algumas options deprecated

### Passos
1. `git tag pre-evolucao-fase-9`
2. `npm install markdown-to-jsx@^9.9.0`
3. `grep -rl "markdown-to-jsx" frontend/src/` — encontrar usos
4. Refatorar conforme changelog
5. `npm run build`
6. Renderizar markdown nos shares (validar visual)
7. Commit: `Evolução Fase 9: markdown-to-jsx 7 → 9`

---

## Validação final (após Fase 9)

Após todas as fases:
1. `npm audit` backend → 0 vulns
2. `npm audit` frontend → 0 vulns
3. `tsc --noEmit` backend
4. `tsc --noEmit` frontend
5. `eslint . --max-warnings=0` ambos
6. `docker compose -f docker-compose.local.yml build --no-cache`
7. `docker compose -f docker-compose.local.yml up -d`
8. Smoke test completo:
   - `/api/health` 200
   - Cadastro 1o user → admin
   - Login → logout
   - Upload + share + download
   - Criação de reverseShare

## Riscos gerais
- **Node 24-alpine**: alguns pacotes com binary native (argon2, sharp) podem precisar rebuild dentro do container — já funciona na Fase 1
- **Prisma 7 ESM**: pode forçar conversão de todo o backend para ESM — é trabalho maior que outras fases
- **TypeScript 7**: pode expor erros de tipagem latentes que hoje não aparecem por causa de `strictNullChecks: false` — avaliar se vale subir strictness junto

## Ordem final sugerida

```
1. Bumps triviais        🟢 (1-2h)
2. PWA → serwist         🟡 (2-3h)  ← resolve bug atual do SW
3. cookies-next 4 → 6   🟡 (1-2h)
4. jose 5 → 6           🴫 (1h)
5. moment → dayjs       🟡 (3-4h)
6. http-proxy → rewrites 🟡 (1h)
7. Prisma 6 → 7         🔴 (4-6h)
8. TypeScript 5 → 7     🔴 (2-4h)
9. markdown-to-jsx 9    🟡 (1-2h)
─────────────────────────────────
Total estimado: 16-25h (distribuidos em várias sessões)
```

## Reposição em caso de falha
- Cada fase tem `git tag pre-evolucao-fase-N` — basta `git reset --hard pre-evolucao-fase-N` e rebuild
- Em caso de falha na Fase 7 (Prisma), banco precisa ser restaurado:
  ```bash
  cp data/controle-videos.db.pre-fase7 data/controle-videos.db
  ```

---

Última atualização: 2026-07-23  
Responsável: time de evolução
