# CHANGELOG_SUGERIDO.md — Sugestão de Changelog do Controle Share Videos v1.0

| Campo | Valor |
|---|---|
| Fase de origem | 13 (Plano de Execução) |
| Data | 2026-08-09 (atualizado em conferência final) |
| Status | ✅ Plano quitado — v1.1.0, v1.2.0 e v1.3.0 aplicados + hotfix v1.2.1 (build frontend) + correções v1.2.2 (auditoria consolidada) + v1.2.3 (observabilidade) + QAL-06 (2026-08-10); aguarda rutura de versão/tagging |
| Base | AUDIT dos achados Fases 1–11; upstream Pingvin Share X v1.21.1 (BSD-2-Clause) |

## 1. Introdução

Changelog **proposto** organizado em versões sugeridas conforme o roadmap de execução. As entradas usam Conventional Commits. Apenas itens que mudam comportamento de usuário/API são listados como "Changed/Breaking".

## 2. Metodologia

- Versões derivadas do `ROADMAP.md` (curto→v1.1.0, médio→v1.2.0, longo→v1.3.0).
- Cada entrada referencia o achado original (SEC-*, BDB-*, DOP-*, INF-*, PERF-*, DOC-*, QAL-*) com evidência de arquivo/linha na fase de origem.
- Formato Conventional Commits; itens Breaking separados e com instrução de migração.
- Base: achados das Fases 1–12 consolidados em `FASE-12-REFATORACAO.md`; upstream Pingvin Share X v1.21.1 (BSD-2-Clause).

## 2.1 Status de Execução (2026-08-09, conferences final)

**Aplicado** (CI verde — backend e frontend):
- ✅ **R07** — testes unit 85/85, e2e 16/16, cobertura 83.78% e CI (`ci.yml`); fix QAL-01/QTS-01.
- ✅ **R02** — JwtGuard **fail-closed** (401 sem token); fix SEC-01.
- ✅ **R08** — compose prod com estágio runtime `frontend` + Caddy; fix DOP-01/03/04/05/07.
- ✅ **R01** — `File.size`/`shareSizeLimit` → `BigInt`; fix BDB-01 (breaking, deploy coordenado).
- ✅ **DOC-02** — `SECURITY.md` preenchido.
- ✅ **BDB-02** — 5 índices nos caminhos quentes (commit `98de696`).
- ✅ **R03** — Paginação nas listagens (commit `4686195`) — envelope `Page<T>`, **Breaking v1.2.0**.
- ✅ **R04** — Jobs de limpeza em lote; fix PERF-04/BDB-04/BKD-06.
- ✅ **R06** — Config tipada backend+frontend; fix QAL-03/BKD-08/FRN-04.
- ✅ **R05** — Decomposição do `ShareService` (794 → 698 LOC); fix ARQ-02.
- ✅ **ARQ-01** — Quebra dependência circular `ShareModule` ↔ `FileModule` via `ShareDomainModule` (2026-08-08).
- ✅ **ARQ-03** — Pacote `@controle-share/shared` com `date.util.ts` unificado (2026-08-08).
- ✅ **ARQ-04** — Decorators compostos `@Authenticated()`/`@AdminOnly()`/`@ShareOwnerAccess()` (2026-08-08).
- ✅ **BKD-02** — `ShareMapper.transformShare` tipado com `ShareLike` (2026-08-08).
- ✅ **BKD-04** — Retry + log estruturado em `DownloadLogService.record()` (2026-08-08).
- ✅ **FRN-01** — JWT verificado com `jose/jwtVerify` no middleware + Docker secret (2026-08-08).
- ✅ **FRN-02** — Estado upload movido para `useState` + `Promise.all` aguardado (2026-08-08).
- ✅ **FRN-04** — Tipos `any` eliminados no frontend (~55 usos) (2026-08-08).
- ✅ **FRN-05** — Loop de reload por idioma corrigido (`hasReloadedRef` + `router.replace`) (2026-08-08).
- ✅ **FRN-07** — Preview PDF via `<iframe>` em vez de `window.location.href` (2026-08-08).
- ✅ **FRN-08** — Categorias de config consistentes (lowercase) (2026-08-08).
- ✅ **BDB-05** — `EPOCH_ZERO` → `expiration DateTime?` nullable + `ShareSecurity` 1:1 (2026-08-08).
- ✅ **BDB-06** — `ShareRecipient` com unique composto `(shareId, email)` (2026-08-08).
- ✅ **INF-02/03/04** — Runtime Node 24 pinado + JWT unificado + `@types/cors` em dev (2026-08-08).
- ✅ **SEC-06/07/08** — Oráculo de e-mail + reuso de refresh + magic bytes fail-closed (2026-08-07).
- ✅ **DOP-07** — `.dockerignore` ampliado (commit `5e9b987`, 2026-08-07).
- ✅ **QTS-05** — `newman` removido (2026-08-07).
- ✅ **TODO logoutAllDevices** — `POST /api/auth/logoutAll` invalida refresh+loginTokens (commit `5667793`, 2026-08-08).
- ✅ **Hotfix v1.2.1** — Build frontend `/share/[shareId]/edit` corrigido (commit `71fee21`, 2026-08-09).
- ✅ **Rotação de JWT secret sem queda de sessão** — `JwtSecretService` + `POST /api/configs/admin/rotateJwtSecret`; tokens anteriores continuam válidos via `kid` + histórico `internal.jwtSecretHistory`; suporte a Docker secret file (`/run/secrets/jwt_secret`) e env `JWT_SECRET` (2026-08-09).
- ✅ **CI/CD com deploy automatizado** — job `deploy` no `ci.yml` (SSH ao host após CI verde, `needs` + `concurrency` + `environment: production`) + `scripts/deploy/deploy-prod.sh` (backup pré-deploy, fetch/checkout por SHA, build, up, healthcheck e rollback automático); guia em `docs/CI-CD.md` (2026-08-09). Requer secrets `DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_PORT`/`DEPLOY_SSH_KEY` e setup one-time no host.
- ✅ **QAL-06** — decomposição de monólitos do frontend + unificação do `pLimit(3)` duplicado (2026-08-10). Detalhes na seção 8.

**Pendente (próximos épicos):**
- ~~QAL-06 (cosmético)~~ ✅ **Pago 2026-08-10**.
- Migração SQLite → PostgreSQL; observabilidade (métricas/traces/alertas além do compose monitoring atual); armazenamento S3; reauditoria de segurança trimestral.

## 3. Versão Sugerida — v1.1.0 (primeira entrega de correções)

> Marco: quick wins + R07/R02/R08 (sem breaking).

### Fixed
- **Segurança**: JwtGuard agora é **fail-closed** — rota protegida sem token retorna 401 em vez de degradar para anônimo (`jwt.guard.ts`). Fix SEC-01.
- **Segurança**: token de redefinição de senha agora expira (TTL) — fix SEC-03/BKD-01.
- **Segurança**: senha de share não é mais aceita na query string — fix SEC-05.
- **Build/Deploy**: serviço `frontend` do compose usa o estágio de runtime (era `frontend-builder`, inalcançável) — fix DOP-01.
- **Build/Deploy**: `DATABASE_URL` do compose base agora aponta para dentro do volume; segredos mortos (`jwt_secret`, `smtp_password`) removidos — fix DOP-03/04.
- **Build/Deploy**: `DOMAIN`/`ACME_EMAIL` injetados no serviço `reverse-proxy` (Caddy) — fix DOP-05.
- **Segurança de embalagem**: `.dockerignore` exclui `secrets/` e `.env*` — fix DOP-07.
- **Dependências**: override de `postcss` removido (era 8.5.18, vulnerável); `npm audit fix` aplicado — fix INF-01.
- **Meta**: `license`/`repository` preenchidos nos `package.json` — fix DOC-04.

### Changed
- Cabeçalhos de e-mail: valores controlados por usuário (creator, desc, recipientEmail, fileName) escapados com `escapeHtml` quando `email.sendHtmlEmails=true` — fix SEC-04.
- Índices de banco adicionados nos caminhos quentes (`expiration`, `creatorId`, `File.shareId`, `expiresAt`, `isActivated`) — fix BDB-02.

## 4. Versão Sugerida — v1.2.0 (dados + performance)

### Breaking (requer deploy coordenado backend+frontend)
- `File.size` e `User.shareSizeLimit` agora são inteiros 64-bit (`BigInt` no Prisma) em vez de `String` — corrige cota ignorada por `NaN` — fix BDB-01.
- Listagens de shares agora retornam envelope paginado `{ items, total, page, perPage, totalPages }` — fix PERF-01/BDB-03.

### Fixed
- ~~Download de vídeo com suporte a **HTTP Range (206)** — seek/streaming do player — fix PERF-06~~ ✅ **aplicado** (commit `bc57267`, 2026-08-08).
- ~~Jobs de limpeza processam em lotes com isolamento de erro por share — fix PERF-04/BDB-04~~ ✅ **aplicado (R04)**.
- E-mails de destinatários enviados em paralelo controlado — fix PERF-02.
- ZIP com concorrência de streams e nível de deflate ajustados — fix PERF-03.
- `deleteTemporaryFiles()` sem `fs` síncrono — fix PERF-05.
- Health check sem ler a tabela `Config` inteira — fix PERF-07/DOP-08.
- ~~`ShareRecipient` com unique composto `(shareId, email)` — evita notificações duplicadas — fix BDB-06~~ ✅ **aplicado** 2026-08-08 (migration `20260808000000_add_share_recipient_unique` + deduplicação prévia).

## 5. Versão Sugerida — v1.2.1 (hotfix pós-conferência)

### Fixed
- **Build frontend**: `next build` falhava em `/share/[shareId]/edit` com `TypeError: Cannot read properties of null (reading 'useContext')` — `useTranslate()` era chamado em **escopo de módulo** em `FileList.tsx:34`, fora do componente `FileListRow`; no SSR strict do Next 14, `React.useContext(IntlContext)` falha sem provider. Hook movido para dentro do componente (commit `71fee21`, 2026-08-09). Bug pré-existente — capturado na conferência final, não pela suíte de testes (gap de cobertura SSR identificado para futura melhoria).
- **Pacote `@controle-share/shared`**: adicionado a `transpilePackages` em `next.config.js` (necessário desde ARQ-03 para o Next bundlar internals do pacote local `file:`).
- **`date.util.ts` unificado**: plugins `localizedFormat` e `locale("pt-br")` movidos do `frontend/src/utils/date.util.ts` para `packages/shared/src/date.util.ts` (elimina chamada top-level residual no frontend — mesma classe de bug preventiva do FRN-02).

## 6. Versão Sugerida — v1.2.2 (correções da auditoria consolidada)

Rodada de fixes derivada da consolidação dos relatórios de auditoria (SECURITY/PERFORMANCE/ARCHITECTURE/DEPENDENCY) + bug hunt. 2026-08-09.

### Fixed
- **Closure stale `createdShare!.id`** no upload (`upload/index.tsx`): variável local `createdShareId` capturada logo após o `create()` evita `uploadFile(undefined, ...)` sob concorrência.
- **`errorToastShown` em escopo de módulo** (`EditableUpload.tsx`) → `useState`, eliminando estado compartilhado entre instâncias.
- **Hang no `archive.once("drain")`** (`share-archive.service.ts`): `waitIfBackpressure()` só aguarda quando `writableNeedDrain` indica backpressure real.
- **Schema Prisma ShareSecurity 1:1 inválido** (BDB-05): removida coluna fantasma `securityId` (não existia no banco) e duplicação do campo; `ShareSecurity.shareId` é o único FK. `prisma format/validate/generate` voltam a passar.
- **Sentinela `EPOCH_ZERO` residual pós-BDB-05**: `jobs.service.ts` (`not: null`), `getSharesByUser` (`equals: null`), `parseExpiration` → `null`, `email.service.ts` e 4 componentes do frontend passam a usar `isEpochZero` (que trata `null`); remove hardcodes `.locale("pt-br")`.
- **`nanoid` <3.3.17 HIGH** (INF-01 regressão): override `^3.3.17` → `3.3.18`; `npm audit` **0 vulnerabilidades**.
- **`dayjs.locale("pt-br")` global** em `handleCopyAll` removido (violava o locale resolvido).
- **`useRef(language)` congelando o idioma** (`_app.tsx`) → `pageProps.language` direto.
- **`$connect()` no construtor** do `PrismaService` → `OnModuleInit`/`OnModuleDestroy`.
- **`new Error("share.notEnoughSpace")`** → `BadRequestException(i18n.t(...))` (`share-limit.service.ts`).
- **`parseInt` sem radix** em `file.controller.ts`/`config.service.ts` → `parseInt(..., 10)`.
- **Dead code** em `jwt.strategy.ts` removido.
- **Lint**: 14 warnings de unused imports removidos — **0 warnings** no backend.

### Removed
- `ShareValidationService.EPOCH_ZERO` (público) e `ShareLimitService.isNeverExpires` (código morto, sem callers).

### Validação
- Backend: unit 85/85, e2e 16/16, build OK, lint 0 warnings.
- Frontend: unit 5/5, `next build` OK, lint OK.
- Prisma `format`/`validate`/`generate` OK; `npm audit` 0 vulnerabilidades.

## 7. Versão Sugerida — v1.3.0 (manutenibilidade)

### Changed
- `ConfigService.get()` tipado (sem `any`); getters `getNumber`/`getBoolean`/`getString`/`getTimespan`; frontend com `ConfigTypeMap`/`GetReturn` e `parseInt` manual removido — fix QAL-03/BKD-08/FRN-04 (R06).
- `ShareService` decomposto em `ShareMapper`/`ShareArchiveService`/`FileStorageService` (794 → 698 LOC; mapeamento, ZIP e cotas/estrutura física em módulos coesos) — fix ARQ-02 (R05).
- `EPOCH_ZERO` substituído por `expiresAt DateTime?` nullable — fix BDB-05.
- ~~Duas libs JWT no frontend unificadas em uma — fix INF-03~~ ✅ **aplicado** 2026-08-08 (`jwt-decode` removido; `middleware.ts` usa `jose.decodeJwt`).
- Runtime Node pinado via `engines` + `.nvmrc` — fix INF-02 (aplicado 2026-08-08).
- `@types` fora de `dependencies` movidos para `devDependencies` — fix INF-04 (aplicado 2026-08-08).
- `SECURITY.md` preenchido (versões suportadas + canal de report) — fix DOC-02.
- README: ~20 referências quebradas corrigidas; decisão ClamAV alinhada em docs e código — fix DOC-01/03.
- Progresso de upload e descrição de arquivos atualizados de forma imutável (spread em `upload/index.tsx`, `EditableUpload.tsx`, `showCreateUploadModal.tsx`) — fix FRN-12.
- `resendVerification` com resposta uniforme (sem oráculo de e-mail) — fix SEC-06.
- Refresh token rotacionado em transação atômica com reuse-detection (revogação da família em replay) — fix SEC-07.
- Detecção de magic bytes **fail-closed**: falhas inesperadas rejeitam o upload e removem o arquivo — fix SEC-08.

### Removed
- Dependências órfãs removidas (`clamscan`/`@types/clamscan` após decisão; `@nestjs/testing` após testes reais) — fix INF-03/QTS-07.

## 7.1 Versão Sugerida — v1.2.3 (observabilidade corrigida)

Rodada de correção do stack de monitoramento. 2026-08-09.

### Added
- **Métricas no backend via prom-client** (`backend/src/metrics/`): `GET /api/metrics` em texto Prometheus. Inclui `http_requests_total`/`http_request_duration_seconds` por rota e status (interceptor global), contadores de negócio (`shares_created_total`, `app_events_total`, `jwt_rotations_total`), gauge `sqlite_integrity_check_failed` (executado no boot) e métricas default do Node.js (`nodejs_eventloop_lag_seconds`, heap, etc.).
- `better-sqlite3` como dependência direta (binding nativo verificado) para o check de integridade.
- **Rede do app com nome fixo** (`controle-share-videos-app`) e Prometheus anexado a ela para alcançar `backend:8080`.

### Changed
- **`prometheus.yml`**: scrape do backend passou de `/api/health` (resposta `OK`, não é formato Prometheus válido → target sempre falhava) para `/api/metrics`.
- **`alerts.yml`/dashboard**: alertas e painéis de 5xx/latência baseados em `caddy_http_*` migraram para as métricas do backend (`http_requests_total{status=~"5.."}`, `http_request_duration_seconds_bucket`).

### Removed
- **Job/alerta `CaddyDown`** (e scrape `caddy:2019`): as métricas do Caddy vivem na admin API, desligada por hardening (`admin off` em `Caddyfile.prod`) — expô-la para scrape seria abrir a API de mutação de config na rede.

### Validação
- Backend: unit 109/109 (5 novos em `metrics.service.spec.ts`), build OK, lint 0 warnings.
- `docker compose config` OK (prod e monitoring); `promtool check config`/`check rules` OK (9 regras).

## 8. Itens Adiados (próximos ciclos)
- ~~Mascaramento de query strings no proxy quando `includePasswordInShareLink=true` (SEC-05); mover credenciais Newman para env (QTS-05); excluir `secrets/`/`.env*` do docker context (DOP-07).~~ ✅ **Todos pagos** — SEC-05 (filtro `replace pwd REDACTED` nos 3 Caddyfiles, commit `242c231`); QTS-05 (`newman` removido, 2026-08-07); DOP-07 (`.dockerignore` ampliado, commit `5e9b987`).
- ~~Rotação de `JWT_SECRET` / secret manager~~ ✅ **Pago 2026-08-09** — `JwtSecretService` + `POST /api/configs/admin/rotateJwtSecret` (seção 27 do PROGRESSO).
- ~~CI/CD com deploy automatizado~~ ✅ **Pago 2026-08-09** — job `deploy` no `ci.yml` + `scripts/deploy/deploy-prod.sh` (seção 28 do PROGRESSO); reauditoria de segurança trimestral segue como item recorrente.
- ~~Observabilidade~~ ✅ **Parcial 2026-08-09 (v1.2.3)** — backend exporta métricas próprias via prom-client em `GET /api/metrics` (`backend/src/metrics/`), o scrape Prometheus deixou de apontar para `/api/health` e o job/alerta `CaddyDown` foi removido (métricas do Caddy exigiriam habilitar a admin API, `admin off` por hardening). Restam traces (OpenTelemetry) e alertmanager como item futuro.
- Migração SQLite → PostgreSQL; armazenamento S3.
- ~~**QAL-06** (monólitos frontend / duplicação leve)~~ ✅ **Pago 2026-08-10** — sem breaking, sem mudança funcional: `showCreateUploadModal.tsx` 751→46 + `showShareInformationsModal.tsx` 398→36 (bodies/seções extraídos); `pLimit(3)` duplicado unificado em `frontend/src/utils/concurrency.ts`; helpers `generateShareId`/`generateAvailableLink`/`generateRandomPassword` em `utils/shareId.util.ts`. Validação: `tsc` 0 erros, lint 0 erros/warnings, unit 5/5, `next build` OK.
- ~~Tornar status check do `frontend` job obrigatório (branch protection)~~ — ⚠️ **Não aplicável**: repo privado na conta GitHub free exige **GitHub Pro** para branch protection/rulesets (403 confirmado em 2026-08-09). Mantido como gate manual enquanto o repo for privado; habilitar se tornar público ou fizer upgrade.

## 9. Notas
- As mudanças *Breaking* (BigInt, paginação) devem sair com **instrução de migração de dados** e atualização do cliente.
- Manter este changelog atualizado a cada merge (gate de PR) conforme ROADMAP.md.

## 10. Evidências

- Fonte de cada entrada: IDs de achados com localização de arquivo/linha em `FASE-2-BACKEND.md` (SEC-01/03/04/05, BKD-01), `FASE-4-DATABASE.md` (BDB-01/02/04/05/06), `FASE-6-PERFORMANCE.md` (PERF-01..07), `FASE-8-INFRAESTRUTURA.md` (INF-01/03), `FASE-9-DOCKER-DEVOPS.md` (DOP-01/03/04/05/07/08), `FASE-11-DOCUMENTACAO.md` (DOC-01/02/04), `FASE-7-QUALIDADE.md` (QAL-03), `FASE-12-REFATORACAO.md` (R01–R08).
- Comportamento atual vs. proposto validado nos relatórios dedicados (`SECURITY_REPORT.md`, `PERFORMANCE_REPORT.md`, `DEPENDENCY_AUDIT.md`).

## 11. Conclusões

- ✅ v1.1.0 (baixo risco, sem breaking), v1.2.0 (dados + performance, 2 breaking), v1.3.0 (manutenibilidade), v1.2.1 (hotfix pós-conferência), v1.2.2 (correções da auditoria consolidada) e v1.2.3 (observabilidade) **todos aplicados** em `main` com builds e testes OK.
- v1.2.0 concentra os dois únicos breaking (BigInt, paginação) — exige deploy coordenado e instrução de migração vertical; v1.3.0 é puramente de manutenção, sem mudança de contrato.
- Após a conferência final de 2026-08-09: backlog tecnológico quitado, restando apenas **QAL-06** (cosmético, baixa prioridade) e os itens adiados da seção 8 (PostgreSQL, S3, traces/alertmanager). **CI/CD com deploy automatizado, rotação de JWT secret e métricas de observabilidade foram pagos em 2026-08-09**. **QAL-06 pago em 2026-08-10** — toda a dívida técnica (TECH_DEBT) está quitada; restam apenas itens de produto/infra da seção 8 (PostgreSQL, S3, traces/alertmanager). Branch protection não habilitável em repo privado free (requer GitHub Pro) — mitigado no deploy pelo gate `needs` dentro do próprio workflow.

## 12. Recomendações

1. ✅ ~~Publicar v1.1.0~~ e seguintes assim que cada janela de R0x fosse fechada — aplicado progressivamente 2026-08-04..08.
2. ✅ ~~Agrupar os breaking de v1.2.0 numa única janela~~ — aplicado no commit `4686195` (R03) coordenado com R01 (BigInt).
3. Tornar a atualização deste changelog um gate de merge (item do `ROADMAP.md` §7) — ainda pendente; recomenda-se implementar como step do CI para evitar drift no futuro (este hotfix foi capturado justamente por drift documental).
4. **Cobertura SSR no frontend**: o CI já roda `npm run build` (passo `Build` em `ci.yml`), mas o bug foi introduzido em `15b736a` (FRN-04) e só capturado na conferência manual de 2026-08-09 — sugere que o CI **falhou nesse commit mas foi mergeado** (provável: bypass ou workflow ran em branch sem gate obrigatório). Recomendação: tornar o status check do `frontend` job **obrigatório** antes de merge (branch protection rule no GitHub) — ⚠️ **bloqueado 2026-08-09**: repo privado em conta free não permite branch protection/rulesets (exige GitHub Pro); mantido como recomendação até upgrade ou repo público.
