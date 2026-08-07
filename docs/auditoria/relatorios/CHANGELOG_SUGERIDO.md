# CHANGELOG_SUGERIDO.md — Sugestão de Changelog do Controle Share Videos v1.0

| Campo | Valor |
|---|---|
| Fase de origem | 13 (Plano de Execução) |
| Data | 2026-08-04 |
| Status | 🔄 Parcialmente aplicado no PR #1 (branch `fix/producao-v1.1.0`, CI verde, aguardando merge em `main`) |
| Base | AUDIT dos achados Fases 1–11; upstream Pingvin Share X v1.21.1 (BSD-2-Clause) |

## 1. Introdução

Changelog **proposto** organizado em versões sugeridas conforme o roadmap de execução. As entradas usam Conventional Commits. Apenas itens que mudam comportamento de usuário/API são listados como "Changed/Breaking".

## 2. Metodologia

- Versões derivadas do `ROADMAP.md` (curto→v1.1.0, médio→v1.2.0, longo→v1.3.0).
- Cada entrada referencia o achado original (SEC-*, BDB-*, DOP-*, INF-*, PERF-*, DOC-*, QAL-*) com evidência de arquivo/linha na fase de origem.
- Formato Conventional Commits; itens Breaking separados e com instrução de migração.
- Base: achados das Fases 1–12 consolidados em `FASE-12-REFATORACAO.md`; upstream Pingvin Share X v1.21.1 (BSD-2-Clause).

## 2.1 Status de Execução (2026-08-04, PR #1 + novos commits no branch)

**Aplicado** (CI verde — backend e frontend):
- ✅ **R07** — testes unit 44/44, e2e 5/5, cobertura 83.78% e CI (`ci.yml`); fix QAL-01/QTS-01.
- ✅ **R02** — JwtGuard **fail-closed** (401 sem token); fix SEC-01.
- ✅ **R08** — compose prod com estágio runtime `frontend` + Caddy; fix DOP-01/03/04/05/07.
- ✅ **R01** — `File.size`/`shareSizeLimit` → `BigInt`; fix BDB-01 (breaking, deploy coordenado).
- ✅ **DOC-02** — `SECURITY.md` preenchido (versões suportadas + canal privado de report).
- ✅ **BDB-02** — 5 índices nos caminhos quentes (commit `98de696`) — quick-win sem breaking.
- ✅ **R03** — Paginação nas listagens (commit `4686195`) — envelope `Page<T>`, **Breaking v1.2.0**.
- ✅ **R04** — Jobs de limpeza em lote (batch `take: 50` + cursor + `deleteMany` + `try/catch` por item); fix PERF-04/BDB-04/BKD-06 — sem breaking.

**Pendente (próximos épicos):**
- v1.1.0: ~~SEC-03 (TTL reset)~~ ✅, ~~SEC-05 (senha em query string)~~ ✅, ~~SEC-04 (sanitização HTML)~~ ✅, INF-01 (override postcss), DOC-04 (license/repository).
- v1.2.0: ~~PERF-01/BDB-03 (paginação — R03)~~ ✅, ~~PERF-04/BDB-04 (jobs — R04)~~ ✅, PERF-02..03,05..07, BDB-06 (unique composto).
- v1.3.0: QAL-03 (R06), ARQ-02 (R05), BDB-05, INF-03, DOC-01/03.

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
- Download de vídeo com suporte a **HTTP Range (206)** — seek/streaming do player — fix PERF-06.
- ~~Jobs de limpeza processam em lotes com isolamento de erro por share — fix PERF-04/BDB-04~~ ✅ **aplicado (R04)**.
- E-mails de destinatários enviados em paralelo controlado — fix PERF-02.
- ZIP com concorrência de streams e nível de deflate ajustados — fix PERF-03.
- `deleteTemporaryFiles()` sem `fs` síncrono — fix PERF-05.
- Health check sem ler a tabela `Config` inteira — fix PERF-07/DOP-08.
- `ShareRecipient` com unique composto `(shareId, email)` — evita notificações duplicadas — fix BDB-06.

## 5. Versão Sugerida — v1.3.0 (manutenibilidade)

### Changed
- `ConfigService.get()` tipado (sem `any`); getters `getNumber`/`getBoolean`/`getString`/`getTimespan`; frontend com `ConfigTypeMap`/`GetReturn` e `parseInt` manual removido — fix QAL-03/BKD-08/FRN-04 (R06).
- `ShareService` decomposto em `ShareMapper`/`ShareArchiveService`/`FileStorageService` (794 → 698 LOC; mapeamento, ZIP e cotas/estrutura física em módulos coesos) — fix ARQ-02 (R05).
- `EPOCH_ZERO` substituído por `expiresAt DateTime?` nullable — fix BDB-05.
- Duas libs JWT no frontend unificadas em uma — fix INF-03.
- `SECURITY.md` preenchido (versões suportadas + canal de report) — fix DOC-02.
- README: ~20 referências quebradas corrigidas; decisão ClamAV alinhada em docs e código — fix DOC-01/03.
- Progresso de upload e descrição de arquivos atualizados de forma imutável (spread em `upload/index.tsx`, `EditableUpload.tsx`, `showCreateUploadModal.tsx`) — fix FRN-12.

### Removed
- Dependências órfãs removidas (`clamscan`/`@types/clamscan` após decisão; `@nestjs/testing` após testes reais) — fix INF-03/QTS-07.

## 6. Itens Adiados (próximos ciclos)
- Rate-limit de `resendVerification` (SEC-06); refresh token atômico + reuse-detection (SEC-07); magic bytes fail-closed (SEC-08).
- Rotação de `JWT_SECRET` / secret manager.
- Migração SQLite → PostgreSQL; armazenamento S3; observabilidade.
- CI/CD com deploy automatizado e reauditoria de segurança trimestral.

## 7. Notas
- As mudanças *Breaking* (BigInt, paginação) devem sair com **instrução de migração de dados** e atualização do cliente.
- Manter este changelog atualizado a cada merge (gate de PR) conforme ROADMAP.md.

## 8. Evidências

- Fonte de cada entrada: IDs de achados com localização de arquivo/linha em `FASE-2-BACKEND.md` (SEC-01/03/04/05, BKD-01), `FASE-4-DATABASE.md` (BDB-01/02/04/05/06), `FASE-6-PERFORMANCE.md` (PERF-01..07), `FASE-8-INFRAESTRUTURA.md` (INF-01/03), `FASE-9-DOCKER-DEVOPS.md` (DOP-01/03/04/05/07/08), `FASE-11-DOCUMENTACAO.md` (DOC-01/02/04), `FASE-7-QUALIDADE.md` (QAL-03), `FASE-12-REFATORACAO.md` (R01–R08).
- Comportamento atual vs. proposto validado nos relatórios dedicados (`SECURITY_REPORT.md`, `PERFORMANCE_REPORT.md`, `DEPENDENCY_AUDIT.md`).

## 9. Conclusões

- v1.1.0 é de baixo risco e alta relação custo-benefício (sem breaking).
- v1.2.0 concentra os dois únicos breaking (BigInt, paginação) — exige deploy coordenado e instrução de migração.
- v1.3.0 é puramente de manutenção, sem mudança de contrato.

## 10. Recomendações

1. Publicar v1.1.0 logo após R07/R02/R08 e quick wins.
2. Agrupar os breaking de v1.2.0 numa única janela de deploy para reduzir custo de migração.
3. Tornar a atualização deste changelog um gate de merge (item do `ROADMAP.md` §7).
