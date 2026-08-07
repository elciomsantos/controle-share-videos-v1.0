# FASE 8 — Auditoria de Infraestrutura/Dependências

**Status:** ✅ Concluída
**Data:** 2026-08-04
**Escopo:** Supply-chain e dependências dos dois pacotes (`backend/` e `frontend/`) — inventário de versões, `npm audit`, lockfiles, gating de scripts de instalação, pinagem do runtime Node, duplicidade e deps órfãs.

---

## 8.1 Resumo Executivo

A postura de supply-chain do projeto é **boa na intenção, com três vulnerabilidades ativas e dois pontos de dívida estrutural**. Lockfiles commitados, gating de postinstall via `allowScripts` e um bloco robusto de `overrides` mostram cultura de endurecimento — mas esse mesmo endurecimento tem uma falha concreta: o `overrides` do frontend fixa `postcss@8.5.18`, que está **dentro da faixa vulnerável** do advisory ativo, e pina exatamente a versão que o `npm audit fix` tentaria corrigir, bloqueando a correção automática. O backend tem 1 vulnerabilidade **high** (`fast-uri`, cadeia exclusivamente de dev/build via `@nestjs/cli` → `ajv`), sem impacto em runtime de produção. Não há pinagem do Node runtime (sem `engines`/`.nvmrc`), o que expõe binários nativos (Prisma/better-sqlite3, sharp) a drift de ambiente. A dependência morta `clamscan@2.4.0` (nunca invocada — consolida SEC-02/QAL-02) **foi removida após a decisão formal de rejeição do ClamAV (2026-08-07; ver INF-03)** e a duplicação de libs JWT no frontend (`jose` usado em 1 linha + `jwt-decode`) fecha o quadro.

## 8.2 Critérios Avaliados

| Critério | Método | Evidência |
|---|---|---|
| Vulnerabilidades | `npm audit` (com e sem dev) nos dois pacotes | backend: 1 high (dev-only); frontend: 2 moderate (via `next`) |
| Lockfiles / reprodutibilidade | Presença de lockfiles, `overrides`, `allowScripts` | `package-lock.json` nos dois; `overrides` 9 entradas; `allowScripts` 3 entradas |
| Runtime pinado | `engines`, `.nvmrc`, versão do Node ativa | Nenhum; Node v24.18.0 em uso |
| Deps órfãs/duplicadas | Referências cruzadas de uso + resolução da árvore | `clamscan` sem chamadas; `jose` 1 uso; `@types/cors` em `dependencies` |
| Duplicidade de versões | Análise de `package-lock.json` | 38 grupos duplicados (backend), 21 (frontend) — todos em cadeia de build/dev |

## 8.3 Achados Detalhados

### INF-01 — Vulnerabilidades ativas; override de `postcss` obsoleto bloqueia a correção 🔴 Alto

- **Onde:** `backend/` (dev-only) e `frontend/` (via `next`, cadeia runtime).
- **Evidência:**
  - Backend: `npm audit` → **1 high**: `fast-uri@3.1.4` (host confusion via backslash authority introducer, GHSA-7p8r-x3mc-p8w7). `npm ls fast-uri` mostra cadeia **exclusivamente dev**: `@nestjs/cli → @angular-devkit/core → ajv → fast-uri` (e `webpack → schema-utils → ajv`). Sem impacto em runtime de produção. `npm audit fix` disponível.
  - Frontend: `npm audit` → **2 moderate**: `postcss ≤8.5.22` (incomplete fix de GHSA-6g55-p6wh-862q — `sourceMappingURL` sob controle do atacante lê `.map` arbitrários, GHSA-fxqj-rqcc-2cmp), via `next@16.2.12`. **Agravante:** `frontend/package.json:13` fixa `"postcss": "8.5.18"` no `overrides` — 8.5.18 está **dentro da faixa vulnerável**, e o override pina a versão, **impedindo o `npm audit fix`**. O endurecimento intencional virou bloqueio da correção.
- **Impacto:** `fast-uri` é inofensivo em produção (cadeia de build). `postcss` está no caminho de runtime do Next, porém o exploit exige CSS com `sourceMappingURL` controlado pelo atacante — risco prático baixo, mas a correção é trivial e está sendo barrada por config própria.

### INF-02 — Runtime Node não pinado (sem `engines`/`.nvmrc`) 🟠 Médio

- **Onde:** `backend/package.json`, `frontend/package.json`, raiz do repo.
- **Evidência:** nenhum `engines`, nenhum `.nvmrc`/`.node-version`; ambiente atual roda `node v24.18.0`. Dependências com binários nativos (Prisma 7 + `@prisma/adapter-better-sqlite3` → `better-sqlite3@12.11.1`, `sharp@0.35.3`, `argon2@0.45.1`) são sensíveis à versão do runtime e à plataforma.
- **Impacto:** drift de ambiente entre dev/staging/prod e entre máquinas de devs; builds "funcionam aqui e não no servidor". Node 24 atual atende com folga NestJS 11 / Next 16 / Prisma 7, mas a escolha não é documentada.

### INF-03 — Dependências órfãs e sobrepostas 🟠 Médio — ✅ Parcialmente resolvido (2026-08-07)

- **Onde:** `backend/package.json` (`clamscan`, `@types/clamscan`); `frontend/package.json` (`jose`, `jwt-decode`).
- **Evidência:**
  - ~~`clamscan@2.4.0` (runtime) e `@types/clamscan` (dev) instalados, mas **zero chamadas** no código — a única referência real foi removida em `share.service.ts:246`. Além do peso morto, `clamscan` **não está** no `allowScripts`, então seus scripts de instalação são bloqueados pelo npm — uma dependência que não roda e não é chamada. Consolida SEC-02 (Fase 5) e QAL-02 (Fase 7).~~ **✅ Removidas (2026-08-07):** a decisão formal (`docs/Padronizacao-07-clamav.md`, 26/07/2026) rejeita a integração; `clamscan`/`@types/clamscan` foram retirados do `backend/package.json` e do lockfile.
  - Frontend: `jose@6.2.4` é usado em **exatamente 1 linha** — `jose.decodeJwt(accessToken).exp` em `auth.service.ts:46` (checagem de expiração) — coexistindo com `jwt-decode@4.0.0` usado no `middleware.ts` (claims `role`/`isAdmin`). Duas libs JWT para decodificação pura, sem sign/verify. *(ainda pendente — unificar em uma lib)*
- **Impacto:** superfície de patch desnecessária, confusão de auditoria (dead dep que "parece segurança") e manutenção duplicada de contratos JWT.

### INF-04 — Higiene de embalagem: `@types` em produção e duplicidades de build 🟡 Baixo

- **Onde:** `backend/package.json`, `package-lock.json` (ambos).
- **Evidência:** `@types/cors@2.8.19` está no bloco **`dependencies`** (deveria ser `devDependencies`). A árvore tem 38 grupos de versões duplicadas no backend e 21 no frontend — p.ex. `typescript 5.9.3 + 6.0.3`, `webpack 5.106.2 + 5.109.2`, `ajv 6.15.0/8.18.0/8.20.0`, `rxjs 7.8.1 + 7.8.2` (NestJS) — porém **todos** em cadeia de build/lint/dev, sem duplicidade relevante em deps runtime.
- **Impacto:** incha o lockfile e a superfície de patch do tooling; sem efeito funcional em produção.

## 8.4 Fortalezas

- **Lockfiles commitados** nos dois pacotes — instalação reprodutível.
- **Gating de postinstall via `allowScripts`** (`backend/package.json:109`): apenas `argon2@0.45.1`, `better-sqlite3@12.11.1` e `@prisma/engines@7.9.0` têm scripts permitidos — prática de supply-chain do npm moderno que bloqueia hooks maliciosos de deps transitivas.
- **`overrides` de hardening abrangentes** no frontend: `next`, `axios`, `serialize-javascript`, `sharp`, `js-yaml`, `handlebars`, `uuid`, `path-to-regexp`, `postcss` — intenção correta (a falha é só a versão obsoleta do postcss, INF-01).
- **Nenhuma vulnerabilidade em runtime de produção do backend** (a única é de build); as 2 do frontend são moderate via Next.
- **Escolhas runtime coerentes com o perfil de segurança:** `helmet`, `argon2`, `otplib`, `class-validator`, `dompurify`, `yup`, `serialize-javascript` — libs maduras e adequadas ao domínio (compartilhamento seguro de arquivos).
- **Runtime atual adequado:** Node v24.18.0 atende NestJS 11, Next 16 e Prisma 7 com folga.

## 8.5 Classificação

| Critério | Nota (0-100) | Justificativa |
|---|---|---|
| Vulnerabilidades conhecidas | **55** | 1 high dev-only (fast-uri) + 2 moderate runtime (postcss), com override bloqueando a correção |
| Pinagem de runtime | **40** | Sem `engines`/`.nvmrc`; binários nativos sensíveis a drift |
| Reproducibilidade | **85** | Lockfiles + `allowScripts` + `overrides`; faltam pinagem de Node e CI (Fase 7) |
| Higiene de dependências | **65** | Dead dep `clamscan`; `jose`×`jwt-decode`; `@types/cors` em produção |
| **Geral (média)** | **61** | Bom alicerce de supply-chain; pontuado pelas 3 vulns ativas e falta de pinagem |

## 8.6 Recomendações (priorizadas)

1. **Corrigir a cadeia `postcss` no frontend (Alto, bloqueio de audit):** atualizar o `overrides` para `"postcss": "^8.5.24"` (ou versão acima de 8.5.22) e rodar `npm audit fix`; sem isso, a correção automática continua barrada pela própria config.
2. **Corrigir `fast-uri` no backend (Médio):** `npm audit fix` e/ou `overrides: { "fast-uri": "^3.2.0" }` no backend; validar que a versão corrigida propaga para `@nestjs/cli`/`webpack`.
3. **Pinagem do runtime (Médio):** adicionar `"engines": { "node": ">=24 <25" }` (ou alinhar à imagem Docker da Fase 9) + `.nvmrc` na raiz; documentar a versão-alvo.
4. ~~**Remover `clamscan`/`@types/clamscan` (Médio)**~~ ✅ **Concluído (2026-08-07):** a varredura foi mantida desativada — a decisão formal (`docs/Padronizacao-07-clamav.md`) rejeita a integração; deps removidas. Fecha QAL-02/SEC-02/INF-03.
5. **Consolidar libs JWT no frontend (Baixo):** manter apenas `jwt-decode` e substituir `jose.decodeJwt` em `auth.service.ts:46` (eliminar a dependência `jose`).
6. **Mover `@types/cors` para `devDependencies` (Baixo):** e, no próximo `npm install` limpo, reavaliar as duplicidades de build (TS 5.9/6.0, webpack 5.106/5.109) via dedupe.
7. **Adicionar `npm audit` ao CI (Baixo):** junto com a pipeline proposta na Fase 7 (QAL-01), rodar `npm audit --omit=dev` como gate de merge.

## 8.7 Notas de Execução

- Evidências de 2026-08-04: `npm audit` (com e sem dev) executado nos dois pacotes (rede disponível); `npm ls fast-uri` e análise da árvore `package-lock.json` via script para duplicidades; `grep` de uso de `jose`/`jwt-decode`/`clamscan`; inspeção de `package.json` (deps, devDeps, overrides, allowScripts, engines) e `node -v`.
- **Referências cruzadas:** INF-03 ↔ SEC-02 (Fase 5) e QAL-02 (Fase 7) — mesma raiz `clamscan`; INF-01 ↔ overrides já citados na Fase 7 (fortaleza de supply-chain); duplicidade `jwt-decode`/`jose` ↔ AUDIT_REPORT Fase 3/5 (apontada em Fase 3, l.601). Fase 9 (Docker/DevOps) herdará INF-02 (pinagem) e INF-01 (base de imagem).
- **Próxima etapa:** Fase 9 — Auditoria Docker/DevOps (Dockerfile, compose, variáveis de ambiente, build multi-stage, saúde de imagem).
