# FASE 7 — Auditoria de Qualidade de Código

**Status:** ✅ Concluída
**Data:** 2026-08-04
**Escopo:** Backend (`backend/src`, 90 arquivos / 6.421 LOC) e Frontend (`frontend/src`, 109 arquivos / 11.895 LOC) — dead code, disciplina de tipagem (`any`), manutenibilidade (LOC/duplicação/dívida), testes automatizados, lint e CI.

---

## 7.1 Resumo Executivo

A base de código é **limpa e disciplinada**: TypeScript `strict` habilitado, lint do frontend 100% limpo e backend com apenas 1 erro + 1 warning. As fortalezas de qualidade compensam parcialmente o maior déficit do projeto: **ausência total de testes automatizados de unidade/integração** em ambos os lados, sem CI para frear regressões. Há um bloco de código morto real (`ClamScanService`, nunca invocado — consolida o SEC-02 da Fase 5), dívida tipada concentrada em `config.get(): any`, um anti-pattern de `Promise` assíncrona no serviço de download e dois TODOs pendentes com impacto de segurança/sessão. Nenhum arquivo órfão foi encontrado no frontend; as duas "UNUSED?" detectadas (`_app.tsx`, `_document.tsx`) são pontos de entrada do Next.js (falso positivo).

## 7.2 Critérios Avaliados

| Critério | Método | Evidência |
|---|---|---|
| Testes automatizados | Busca de `*.test.*`/`*.spec.*`, configs jest/vitest, scripts npm | Nenhum arquivo de teste; `test:system` (Newman) como único teste |
| Dead code | Referências cruzadas (ClamScan, exports, componentes) | `ClamScanService` registrado e nunca chamado |
| Tipagem | `grep` de `any`/`as any`/eslint-disable, tsconfig | 10 `: any` + 1 `as any` (backend); 51 `: any` + 6 `as any` (frontend) |
| Lint | Execução de `eslint` nos dois projetos | Backend: 1 erro + 1 warning; Frontend: 0 |
| Manutenibilidade | LOC por arquivo, duplicação, TODOs | `share.service.ts` 772 L, modal 751 L, `pLimit` duplicado |
| CI/qualidade de processo | Busca de `.github`, `husky`, scripts | Nenhum CI, nenhum hook de pre-commit |

## 7.3 Achados Detalhados

### QAL-01 — Ausência total de testes automatizados e de CI 🔴 Alto

- **Onde:** Todo o repo (`backend/`, `frontend/`).
- **Evidência:** `find` por `*.test.*`/`*.spec.*` e configs jest/vitest → **zero resultados**. `backend/package.json` declara `jest`, `@nestjs/testing`, `@types/supertest` (l.79-93) mas não há nenhum teste usando-os; o único script de teste é `test:system`: `prisma migrate reset -f && nest start & wait-on http://localhost:8080/api/configs && npx newman run ./test/newman-system-tests.json` — um e2e **destrutivo** (reset do banco) que depende de serviço no ar e de uma collection Postman (`backend/test/newman-system-tests.json`). O frontend **não tem script de teste nem framework** (package.json l.5-10). Não há `.github/workflows`, GitLab CI nem hooks (sem `.husky`).
- **Impacto:** Nenhuma rede de segurança para os fluxos críticos (upload, share, auth). As correções da Fase 5 (SEC-01 JwtGuard fail-open, SEC-04 e-mail, etc.) e as futuras (PERF) não podem ser validadas automaticamente; regressões silenciosas são prováveis a cada merge.
- **Exceção observada:** a collection Newman cobre o contrato e2e básico, mas não é parte da execução normal de desenvolvimento.

### QAL-02 — `ClamScanService` é código morto 🔴 Médio

- **Onde:** `backend/src/clamscan/clamscan.service.ts`, `clamscan.module.ts`, `app.module.ts`, `constants.ts`.
- **Evidência:** o módulo está registrado em `app.module.ts` e referenciado em `constants.ts`, mas a única chamada real foi **removida** — `share.service.ts:246-249` contém apenas `// ClamAV scan removed per formal decision docs/Padronizacao-07-clamav.md` (doc inexistente, ver nota de conciliação no SEC-02/Fase 5). O serviço nunca é injetado nem invocado em nenhum fluxo.
- **Impacto:** ~3 arquivos de superfície de segurança que não executam nada, sugerindo proteção inexistente; confunde manutenção e auditoria.

### QAL-03 — Disciplina de tipagem: `any` espalhado, `config.get(): any` como ponto fraco central 🟠 Médio

- **Onde:** `config.service.ts:103`, `share.service.ts:501`, `request-context.ts:61-96`, `shareSecurity.guard.ts:100` (backend); ~20 arquivos no frontend (formulários, serviços, dayjs).
- **Evidência:** backend 10 `: any` + 1 `as any`; frontend 51 `: any` + 6 `as any` (4 deles em `date.util.ts` para extensões do dayjs — justificáveis). A maioria dos `any` do backend tem `eslint-disable` comentado com justificativa (refs. issue #6) — transparente, porém `config.get()` (l.103) retorna `any` e propaga tipagem fraca para todas as configurações lidas em runtime (ex.: `zipCompressionLevel`, `zipMaxFiles`), empurrando erros de configuração do tipo do compilador para o runtime. Regra `@typescript-eslint/no-explicit-any` configurada como **warn**, não error.
- **Impacto:** Perda de segurança de tipo exatamente nos pontos de maior acoplamento (config) e maior rotatividade (modal de 751 linhas); `any` silencioso não bloqueia o build.

### QAL-04 — Anti-pattern `new Promise(async …)` no download de arquivo único 🟡 Baixo

- **Onde:** `local.service.ts:357` (`return new Promise(async (resolve, reject) => …)`), no fluxo de download de um único arquivo.
- **Evidência:** flagada pelo lint (`no-async-promise-executor` — único **erro** do `npm run lint` no backend). Executor async faz exceções síncronas virarem rejeições não capturadas em vez de serem propagadas; em caso de falha precoce de `createZipStream()` o reject é tratado (l.364), mas o padrão mascara erros e dificulta cancelamento correto.
- **Impacto:** Baixo em runtime (fluxo testado manualmente), mas é dívida de robustez em um caminho de I/O crítico.

### QAL-05 — TODOs com impacto de segurança/sessão pendentes 🟡 Baixo

- **Onde:** `auth.service.ts:131` (`// TODO: Make all old loginTokens invalid when a new one is created`) e `config.service.ts:273` (`// TODO add validation for timespan type`).
- **Evidência:** dois TODOs legítimos restantes (de 2 no total no backend — índice saudável). O de `auth.service.ts:131` é sobre invalidação de **loginTokens** (sessões de login) — distinto do SEC-07 (rotacionamento/reuso de **refresh tokens**), que foi pago em 2026-08-07; o TODO de loginTokens permanece aberto.
- **Impacto:** Reforça o achado de sessão da Fase 5; validação de `timespan` (ex.: TTL de reset token, SEC-03/Fase 5) depende do mesmo tipo.

### QAL-06 — Duplicação leve e arquivos monolíticos 🟡 Baixo

- **Onde:** `EditableUpload.tsx:19` e `upload/index.tsx:24` (`const promiseLimit = pLimit(3)`); `share.service.ts` (772 L), `showCreateUploadModal.tsx` (751 L), `showShareInformationsModal.tsx` (401 L).
- **Evidência:** dois limites de concorrência independentes (upload paralelo não é globalmente limitado; cada tela cria a própria fila). Backend: `share.service.ts` concentra listagem, upload, zip, e-mail, views, tokens e zip-bomb (772 L). Frontend: modal de criação de upload com 751 L (lógica de dropzone, campos, validação, montagem de share).
- **Impacto:** Duplicação de `pLimit` é cosmética, mas arquivos acima de ~400 L tendem a concentrar responsabilidades e dificultam teste unitário (reforça QAL-01).

## 7.4 Fortalezas

- **TypeScript estrito de verdade:** `strict: true`, `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, `strictBindCallApply` no `backend/tsconfig.json`.
- **Lint frontend 100% limpo:** `npx eslint src/` retorna **0 erros, 0 warnings**.
- **Lint backend quase limpo:** apenas 1 erro (QAL-04) + 1 warning (`req` não usado em `share.controller.ts:76`).
- **Config Flat ESLint moderno** com *type-aware linting* (`parserOptions.project`) nos dois projetos — regras dependentes de tipo ativas.
- **`eslint-disable` transparentes:** todos com justificativa inline e referência à issue de rastreio (#6) — cultura de auditoria da decisão.
- **Gestão de supply-chain no frontend:** `overrides` em `frontend/package.json` fixam versões seguras de `next`, `axios`, `serialize-javascript`, `sharp`, `js-yaml`, `handlebars`, `uuid`, `path-to-regexp`, `postcss`.
- **i18n centralizada:** traduções pt-BR isoladas em `translations/pt-BR.ts` (589 L) — sem strings espalhadas.
- **Sem console.log de debug** em código-fonte de produção (grep zerado).

## 7.5 Classificação

| Critério | Nota (0-100) | Justificativa |
|---|---|---|
| Testes automatizados | **5** | Nenhum teste unitário/integração; único e2e é Newman destrutivo e externo ao dev |
| Tipagem | **70** | `strict` + lint limpo, mas `any` concentrado em config/modal e regra só como warn |
| Manutenibilidade | **75** | Estrutura modular clara, i18n isolada; 2 arquivos monolíticos e 1 duplicação |
| Lint/build hygiene | **90** | Frontend 0 problemas; backend 1 erro + 1 warning |
| Dead code | **80** | 1 módulo morto real (ClamScan); sem arquivos órfãos no frontend |
| Processo/CI | **15** | Sem CI, sem hooks, sem scripts de teste |
| **Geral (média)** | **56** | Penalizado sobretudo por testes e CI ausentes |

## 7.6 Recomendações (priorizadas)

1. **Adicionar testes automatizados (Alto):** backend com `jest` + `supertest` cobrindo `share.service.ts` (complete, zip-bomb, views) e `auth.service.ts` (refresh/tokens); frontend com `vitest` + Testing Library para os formulários de auth e o modal de upload. Desacoplar o `ClamScanService`/e-mail antes de testar (injetar mocks).
2. **Criar pipeline de CI (Alto):** GitHub Actions (ou equivalente) com `lint → build → test` nos dois pacotes; rodar a collection Newman em ambiente descartável (sem `migrate reset` em banco real).
3. **Remover ou reativar o `ClamScanService` (Médio):** resolver a conciliação do SEC-02/Fase 5 — se mantida a remoção, apagar o módulo; se reativada, registrar a decisão no doc referenciado. Nunca deixar "código morto que parece segurança".
4. **Endurecer tipagem (Médio):** elevar `no-explicit-any` para `error`; substituir `config.get(): any` por mapa tipado de chaves (issue #6), eliminando a propagação de `any` no runtime.
5. **Corrigir `local.service.ts:357` (Baixo):** trocar `new Promise(async …)` por fluxo baseado em `async` com `try/finally` no `archive.finalize()`.
6. **Resolver TODOs de sessão/validação (Baixo):** `auth.service.ts:131` (invalidar loginTokens antigos) — distinto do SEC-07 (pago em 2026-08-07); continua pendente; `config.service.ts:273` (validação `timespan`) — fechar junto com SEC-03/Fase 5.
7. **Fatorar os monolíticos (Baixo):** extrair sub-componentes do `showCreateUploadModal.tsx` (751 L) e dividir responsabilidades do `share.service.ts`; centralizar `pLimit` em módulo compartilhado para limitar upload globalmente.

## 7.7 Notas de Execução

- Evidências coletadas em 2026-08-04 via `grep`/`find` (testes, `any`, TODO, ClamScan), execução de `npm run lint` nos dois projetos, inspeção de `tsconfig.json`, `package.json` e `eslint.config.mjs`, e heurística de componentes órfãos (as únicas "UNUSED?" — `pages/_app.tsx` e `_document.tsx` — são entradas Next.js, falso positivo).
- **Referências cruzadas:** QAL-02 ↔ SEC-02/Fase 5 (ClamAV); QAL-05 ↔ SEC-03 e SEC-07/Fase 5 (tokens/sessão); QAL-01 ↔ PERF (nenhuma métrica medida por testes) e Fase 10 (Testes/QA, que detalhará o plano); `any` ↔ BKD-02/BKD-03 (Fase 2) e BDB-02/BDB-03 (Fase 4).
- **Próxima etapa:** Fase 8 — Auditoria de Infraestrutura/Dependências (versões, vulnerabilidades, supply-chain, runtime).
