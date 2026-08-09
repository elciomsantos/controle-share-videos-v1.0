# TECH_DEBT.md — Controle Share Videos v1.0

| Campo | Valor |
|---|---|
| Fase de origem | 7 (Qualidade) + contribuições de 1, 2, 3, 4, 11 |
| Data | 2026-08-09 (atualizado em conferência final) |
| Status | ✅ Dívida técnica quitada — todos os itens P1/P2/P3 pagos (R01-R08 + SEC-01..08 + FRN-01/02/04/05/07/08/12 + ARQ-01/03/04 + BKD-02/04 + BDB-02/05/06 + DOC-01/02 + DOP-07 + QTS-05 + PERF-02/03); HOTFIX build frontend 2026-08-09 (commit `71fee21`); **rodada de correções da auditoria consolidada 2026-08-09** (13 fixes: schema Prisma BDB-05, sentinela EPOCH_ZERO residual, closure stale, drain hang, nanoid vuln, lint 0 warnings, etc.); restam apenas itens "cosméticos" opcionais (FRN-06/09 já pagos, QAL-06 monolitismo leve) |

## 1. Introdução

Registro único da dívida técnica do projeto: tudo que não é bug de segurança/perf de linha única, mas degrada manutenibilidade, extensibilidade e velocidade de entrega. Consolidado a partir de QAL-* (Fase 7), ARQ-* (Fase 1), BKD-* (Fase 2), FRN-* (Fase 3), BDB-* (Fase 4) e DOC-* (Fase 11).

## 2. Metodologia

- Classificação em quadrantes **Tipo × Urgência**: (a) facilita evolução futura, (b) está ativamente atrasando trabalho.
- Estimativa de esforço de pagamento (muito baixo → alto) e risco.
- Prioridade de pagamento ponderada por: impacto em manutenção × frequência de toque no arquivo.

## 3. Evidências

- **Fontes primárias:** `FASE-1-ARQUITETURAL.md`, `FASE-2-BACKEND.md`, `FASE-3-FRONTEND.md`, `FASE-4-DATABASE.md`, `FASE-7-QUALIDADE.md`, `FASE-11-DOCUMENTACAO.md`.
- **Critério:** cada dívida listada abaixo tem achado original com evidência de código (arquivo/linha) e documentação oficial citada na fase de origem.
- **Métricas objetivas (Especificação-final l.198+):** complexidade ciclomática e tamanho de classe (ARQ-02: `ShareService` com 772 LOC / 27 métodos); acoplamento e coesão (god class concentra orquestração + mapeamento + acesso a dados); tamanho de função e aninhamento (guards encadeados); contagem de `any` em assinaturas (BKD-02/08, QAL-03).

## 4. Inventário de Dívida Técnica

### 3.1 Arquitetural (Fase 1)

| ID | Dívida | Impacto | Esforço |
|----|--------|---------|---------|
| ~~ARQ-02~~ | ~~God class `ShareService` (772 LOC, 27 métodos)~~ | ✅ Pago (R05) — 794 → 698 LOC, extraídos `ShareMapper`/`ShareArchiveService`/`FileStorageService` |
| ~~ARQ-03~~ | ~~Duplicação `date.util.ts` backend/frontend~~ | ✅ Pago (2026-08-08) — pacote `@controle-share/shared` com `date.util.ts` unificado |
| ~~ARQ-04~~ | ~~Boilerplate repetido de guards/validação~~ | ✅ Pago (2026-08-08) — decorators compostos `@Authenticated()`/`@AdminOnly()`/`@ShareOwnerAccess()` |
| ~~ARQ-01~~ | ~~Dependência circular `ShareModule` ↔ `FileModule`~~ | ✅ Pago (2026-08-08) — `ShareDomainModule` extraído |

### 3.2 Backend (Fase 2)

| ID | Dívida | Impacto | Esforço |
|----|--------|---------|---------|
| ~~BKD-01~~ | ~~`resetPassword()` reutilizado em fluxos diferentes (sem TTL)~~ | ✅ Pago (SEC-03) — `expiresAt` 1h + validação na redenção |
| ~~BKD-02~~ | ~~Tipos `any` em assinaturas~~ | ✅ Pago (2026-08-08) — `ShareMapper.transformShare` tipado com `ShareLike` |
| ~~BKD-03~~ | ~~`parseInt` de tamanho com `NaN` (duplica BDB-01)~~ | ✅ Pago (R01) — centralizado em `toBytes` |
| ~~BKD-06~~ | ~~Jobs de limpeza um-a-um sem transação~~ | ✅ Pago (R04) — batch 50 + cursor + `try/catch` por item |
| ~~BKD-04~~ | ~~Falha engolida em `DownloadLogService.record()`~~ | ✅ Pago (2026-08-08) — retry com backoff exponencial + log estruturado |
| ~~BKD-08~~ | ~~Retornos `any` em serviços~~ | ✅ Pago (R06) — getters tipados `getNumber`/`getBoolean`/`getString`/`getTimespan` |

### 3.3 Frontend (Fase 3)

| ID | Dívida | Impacto | Esforço |
|----|--------|---------|---------|
| ~~FRN-01~~ | ~~Gatilhos/efeitos frágeis (JWT decode sem verif.)~~ | ✅ Pago (2026-08-08) — `jose/jwtVerify` no middleware com Docker secret |
| ~~FRN-02~~ | ~~Estado mutável fora de lugar (módulo-level)~~ | ✅ Pago (2026-08-08) — `useState` + `await Promise.all` + `useRef` flag |
| ~~FRN-03~~ | ~~`parseInt` de tamanho com `NaN`~~ | ✅ Pago (R01) — soma via `Number` |
| ~~FRN-04~~ | ~~Tipos `any`/props fracamente tipadas~~ | ✅ Pago (2026-08-08) — `FileRecord`/`FileUpload`/`FileMetaData` + `ApiErrorResponse` (~55 usos eliminados) |
| ~~FRN-05~~ | ~~Loop potencial de reload por idioma~~ | ✅ Pago (2026-08-08) — `hasReloadedRef` + `router.replace` substitui `location.reload()` |
| ~~FRN-07~~ | ~~Preview PDF via `window.location.href`~~ | ✅ Pago (2026-08-08) — `<iframe>` inline com sandbox |
| ~~FRN-08~~ | ~~Categorias config inconsistentes~~ | ✅ Pago (2026-08-08) — lowercase em toda a stack |
| ~~FRN-12~~ | ~~Mutação de props por referência~~ | ✅ Pago (2026-08-07) — `map` imutável com spread |

### 3.4 Banco (Fase 4)

| ID | Dívida | Impacto | Esforço |
|----|--------|---------|---------|
| ~~BDB-01~~ | ~~`File.size`/`shareSizeLimit` como `String`~~ | ✅ Pago (R01) — migration BigInt + `toBytes` |
| ~~BDB-05~~ | ~~Sentinela `EPOCH_ZERO` ("nunca expira") espalhada em 3 arquivos~~ | ✅ Pago (2026-08-08) — `expiration DateTime?` (null = nunca expira) + `ShareSecurity` 1:1 obrigatório |
| ~~BDB-06~~ | `ShareRecipient` sem `@@unique(shareId, email)` | ✅ Resolvido 2026-08-08 — unique composto + deduplicação prévia |

### 3.5 Qualidade/Processo (Fase 7, 10, 11)

| ID | Dívida | Impacto | Esforço |
|----|--------|---------|---------|
| ~~QAL-01~~ | ~~Zero testes automatizados e sem CI~~ | ✅ Pago (R07) — jest/ts-jest + e2e 16/16 + unit 85/85 + cobertura ≥80% + `ci.yml` |
| ~~QAL-03~~ | ~~`config.get(): any` como ponto fraco central~~ | ✅ Pago (R06) — `ConfigKeys`/`ConfigTypeMap` + getters tipados, sem `any` |
| ~~QAL-04~~ | ~~Anti-pattern `new Promise(async …)` (download de arquivo)~~ | ✅ Pago (R07) — `local.service.ts` refatorado |
| ~~QAL-05~~ | ~~TODOs com impacto de segurança/sessão pendentes~~ | ✅ Pago (2026-08-08) — TODO `auth.service.ts:131` (logout all devices) implementado em `5667793` |
| QAL-06 | Arquivos monolíticos e duplicação leve | Baixa | Médio | ⏳ Pendente (cosmético, não bloqueante) |
| ~~DOC-01~~ | ~~~20 referências quebradas no README~~ | ✅ Resolvido 2026-08-08 — seção "Testes" reescrita; refs verificadas |

## 5. Pagamentos realizados (2026-08-04)

| ID | Dívida | Status |
|----|--------|--------|
| QAL-01 | Zero testes automatizados e sem CI | ✅ Paga (R07) — jest/ts-jest + e2e 5/5 + unit 44/44 + cobertura ≥60% + `ci.yml` |
| BDB-01 | `File.size`/`shareSizeLimit` como `String` | ✅ Paga (R01) — migration BigInt + `toBytes` + `Number()` no front |
| BKD-03 | `parseInt` de tamanho com `NaN` | ✅ Paga (R01) — centralizado em `toBytes` |
| FRN-03 | `parseInt` de tamanho com `NaN` | ✅ Paga (R01) — soma via `Number` |
| QAL-04 | Anti-pattern `new Promise(async …)` | ✅ Paga (R07) — `local.service.ts` refatorado |
| DOC-02 | `SECURITY.md` vazio | ✅ Paga — versões suportadas + canal privado de report |
| BDB-02 | Índices ausentes nos caminhos quentes | ✅ Paga (2026-08-04) — 5 @@index no schema, migration `add_hot_path_indexes` |
| PERF-01/BDB-03 | Listagens sem paginação | ✅ Paga (R03) — envelope `Page<T>` + `take`/`skip` + `count`, frontend adaptado, Breaking v1.2.0 |
| BKD-06 | Jobs de limpeza um-a-um sem transação | ✅ Paga (R04) — batch `take: 50` + cursor + `deleteMany` + `try/catch` por item |
| BDB-04 | Crons de limpeza um-a-um sem transação | ✅ Paga (R04) — `select: { id: true }`, `deleteMany`, isolamento de erro por item |
| PERF-04 | Jobs de limpeza sem batching/limite por execução | ✅ Paga (R04) — teto de 50 por lote, sem N+1 |
| QAL-03 | `config.get(): any` como ponto fraco central | ✅ Paga (R06) — `ConfigKeys`/`ConfigTypeMap` + getters tipados, sem `any` no service (backend) |
| BKD-08 | Retornos `any` em serviços | ✅ Paga (R06) — getters tipados `getNumber`/`getBoolean`/`getString`/`getTimespan` |
| FRN-04 | Tipos `any`/props fracamente tipadas | ✅ Paga (R06) — `ConfigTypeMap`/`GetReturn` no frontend, `get()` sem `any`, `parseInt` manual removido |
| ARQ-02 | God class `ShareService` (772 LOC, 27 métodos) | ✅ Paga (R05) — extraídos `ShareMapper`/`ShareArchiveService`/`FileStorageService`; `ShareService` 794 → 698 LOC; +9 testes de regressão |
| SEC-03/BKD-01 | Token de reset de senha sem TTL | ✅ Paga — `expiresAt` 1h + validação na redenção em `resetPassword()` |
| SEC-05 | Senha de share em query string | ✅ Paga — token via POST `/shares/:id/token` com senha no body |
| FRN-12 | Mutação de props por referência | ✅ Paga (2026-08-07) — `map` imutável com spread em `upload/index.tsx`, `EditableUpload.tsx`, `showCreateUploadModal.tsx` |
| SEC-04 | Injeção de HTML em e-mails de share | ✅ Paga (2026-08-07) — `escapeHtml` em `common/sanitize.ts` aplicado a valores de usuário quando `email.sendHtmlEmails=true` |

## 6. Quadrante Urgência × Evolução

- **Urgente pagar agora** (bloqueia segurança/evolução): ~~QAL-01 (testes)~~✅, ~~BKD-01/SEC-03 (reset TTL)~~✅, ~~FRN-12 (mutação de props)~~✅, ~~BDB-01 (String→BigInt)~~✅.
- **Pagar em breve** (facilita features): DOC-01 (README).
- **Pagas recentemente**: ~~BDB-05~~ (nullable `expiresAt` + schema 1:1 corrigido 2026-08-09), ~~BDB-02~~ (índices), ~~PERF-01/BDB-03~~ (paginação R03), ~~BKD-06/BDB-04/PERF-04~~ (jobs em lote R04), ~~QAL-03/BKD-08/FRN-04~~ (config tipada R06), ~~ARQ-02~~ (split ShareService R05), ~~SEC-03/BKD-01~~ (TTL reset), ~~SEC-05~~ (token via body), ~~FRN-12~~ (mutação por referência), ~~SEC-04~~ (sanitização HTML e-mail), ~~SEC-06~~ (oráculo resend), ~~SEC-07~~ (rotação/reuso refresh), ~~SEC-08~~ (fail-closed magic bytes).
- **Baixa prioridade** (cosmético/semântico): FRN-05, FRN-02, ~~BDB-06~~, QAL-06, ARQ-04.

## 7. Conclusões

- **Toda a dívida técnica P1/P2/P3 foi quitada** ao longo da Fase 12 (2026-08-08) e conferência final (2026-08-09). Único item restante: **QAL-06** (monolitismo leve / duplicação cosmética), classificado como baixa prioridade sem impacto funcional ou de segurança.
- Hotfix pós-relatório (2026-08-09, commit `71fee21`) corrigiu regressão de build frontend pré-existente (`useTranslate()` em escopo de módulo em `FileList.tsx`) — capturada durante a conferência final, não pela suíte de testes (cobertura SSR não exercida — gap que pode ser tratado futuramente como melhoria QAL).
- **Rodada de correções da auditoria consolidada (2026-08-09)**: 13 fixes aplicados, incluindo a **correção do schema Prisma do BDB-05** (a coluna `securityId` nunca existiu no banco — o schema tinha campo fantasma + relação 1:1 duplicada; `prisma format/validate/generate` voltaram a passar) e a **eliminação completa do sentinela `EPOCH_ZERO` residual** do código de negócio (jobs, `getSharesByUser`, `parseExpiration`, e-mails e 4 componentes do frontend usavam `.unix() === 0`/`EPOCH_ZERO`, quebrando com o novo `null` pós-BDB-05). Detalhes na seção 26 do `PROGRESSO-REFATORACAO.md`.
- **Rotação de `JWT_SECRET` sem queda de sessão (2026-08-09)**: `JwtSecretService` + `POST /api/configs/admin/rotateJwtSecret`; tokens assinados com `kid` no header e verificação por histórico `internal.jwtSecretHistory` (janela de retenção de ~13 meses). Precedência de segredo: env `JWT_SECRET` → Docker secret file (com rotação híbrida via API) → DB; segredos em repouso cifrados (AES-256-GCM) quando a chave está configurada. Encerra o item "Rotação de `JWT_SECRET` / secret manager" que estava no backlog de próximos épicos. Detalhes em `docs/auditoria/relatorios/CHANGELOG_CORRECOES.md`.

## 8. Recomendações de pagamento (ordem)

1. ✅ ~~Testes + CI (QAL-01/QTS-01)~~ — **pago (R07)**.
2. ✅ ~~BKD-01/SEC-03, FRN-12~~ — dívidas com risco de segurança **pagas**.
3. ✅ ~~ARQ-02 (R05), QAL-03, BKD-06, BDB-05~~ — refatorações estruturais **pagas**.
4. ✅ ~~SEC-06/07/08~~ — segurança **paga** (2026-08-07).
5. ✅ ~~DOC-01, FRN-05, BDB-06, QAL-04/05, ARQ-03/04, FRN-01/02/04/07/08, ARQ-01, BKD-02/04, DOP-07, QTS-05~~ — backlog contínuo **pago**.
6. ✅ ~~FRN-06 (user-scalable), FRN-09 (noopener), DOC-02 (SECURITY.md), BKD-05 (timespan validation)~~ — **pagos 2026-08-07**.
7. ⏳ **QAL-06** — único item pendente (cosmético, baixa prioridade). Sugestão: endereçar como parte de futura iniciativa de consolidação de duplicação leve, sem urgência.
