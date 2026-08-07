# TECH_DEBT.md — Controle Share Videos v1.0

| Campo | Valor |
|---|---|
| Fase de origem | 7 (Qualidade) + contribuições de 1, 2, 3, 4, 11 |
| Data | 2026-08-04 |
| Status | 🔄 Parcialmente paga — PR #1 quitou QAL-01, BDB-01, BKD-03, FRN-03, QAL-04 e DOC-02; BDB-02/R03 pagos em `fix/producao-v1.1.0` (2026-08-04) |

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
| ARQ-02 | God class `ShareService` (772 LOC, 27 métodos) — orquestração+validação+mapeamento+a-dados | Alta | Alto |
| ARQ-03 | Duplicação e divergência backend/frontend (ex.: `parseInt` de tamanho nos dois lados) | Alta | Médio |
| ARQ-04 | Boilerplate repetido de guards/validação | Média | Médio |
| ARQ-01 | Tamanho/coesão dos módulos | Média | Médio |

### 3.2 Backend (Fase 2)

| ID | Dívida | Impacto | Esforço |
|----|--------|---------|---------|
| BKD-01 | `resetPassword()` reutilizado em fluxos diferentes (sem TTL) — **vira risco de segurança** (SEC-03) | Alta | Muito baixo |
| BKD-02 | Tipos `any` em assinaturas | Média | Baixo |
| BKD-03 | `parseInt` de tamanho com `NaN` (duplica BDB-01) | Alta | Baixo |
| BKD-06 | Jobs de limpeza um-a-um sem transação | Média | Médio |
| BKD-08 | Retornos `any` em serviços | Média | Baixo |

### 3.3 Frontend (Fase 3)

| ID | Dívida | Impacto | Esforço |
|----|--------|---------|---------|
| FRN-01 | Gatilhos/efeitos frágeis | Média | Médio |
| FRN-02 | Estado mutável fora de lugar | Média | Médio |
| FRN-03 | `parseInt` de tamanho com `NaN` | Alta | Baixo |
| FRN-04 | Tipos `any`/props fracamente tipadas | Média | Baixo |
| FRN-05 | Fallback silencioso (erro engolido) | Média | Baixo |
| FRN-12 | Mutação de props por referência | Alta | Médio |

### 3.4 Banco (Fase 4)

| ID | Dívida | Impacto | Esforço |
|----|--------|---------|---------|
| BDB-01 | `File.size`/`shareSizeLimit` como `String` | Alta | Alto |
| BDB-05 | Sentinela `EPOCH_ZERO` ("nunca expira") espalhada em 3 arquivos | Média | Médio |
| BDB-06 | `ShareRecipient` sem `@@unique(shareId, email)` | Baixa | Muito baixo |

### 3.5 Qualidade/Processo (Fase 7, 10, 11)

| ID | Dívida | Impacto | Esforço |
|----|--------|---------|---------|
| QAL-01 | Zero testes automatizados e sem CI | Muito alta | Alto |
| QAL-03 | `config.get(): any` como ponto fraco central | Média | Médio |
| QAL-04 | Anti-pattern `new Promise(async …)` (download de arquivo) | Baixa | Baixo |
| QAL-05 | TODOs com impacto de segurança/sessão pendentes | Média | Baixo |
| QAL-06 | Arquivos monolíticos e duplicação leve | Baixa | Médio |
| DOC-01 | ~20 referências quebradas no README | Média | Baixo |

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
- **Pagar em breve** (facilita features): BDB-05 (nullable `expiresAt`), DOC-01 (README), SEC-06 (rate-limit resend), SEC-07 (reuse-detection refresh).
- **Pagas recentemente**: ~~BDB-02~~ (índices), ~~PERF-01/BDB-03~~ (paginação R03), ~~BKD-06/BDB-04/PERF-04~~ (jobs em lote R04), ~~QAL-03/BKD-08/FRN-04~~ (config tipada R06), ~~ARQ-02~~ (split ShareService R05), ~~SEC-03/BKD-01~~ (TTL reset), ~~SEC-05~~ (token via body), ~~FRN-12~~ (mutação por referência), ~~SEC-04~~ (sanitização HTML e-mail).
- **Baixa prioridade** (cosmético/semântico): FRN-05, FRN-02, BDB-06, QAL-06, ARQ-04.

## 7. Conclusões

- A dívida está **concentrada em dois nós**: (1) o `ShareService` monolítico e (2) a ausência de testes que tornaria qualquer refatoração segura. O nó (2) **já foi pago** (R07) — os demais pagamentos agora têm rede de testes para serem feitos com segurança.
- Três itens "leves" são, na verdade, **gatilhos de segurança** (BKD-01/SEC-03, FRN-12) — **já pagos**, subiram na fila apesar do baixo esforço.
- Não há dívida de contrato público acumulada além de R03 (paginação) — **já paga com Breaking v1.2.0**.
- BDB-02 (índices nos caminhos quentes) também foi pago como quick-win pré-R03.

## 8. Recomendações de pagamento (ordem)

1. ✅ ~~Testes + CI (QAL-01/QTS-01)~~ — **pago (R07)**.
2. ✅ ~~BKD-01/SEC-03, FRN-12~~ — dívidas com risco de segurança **pagas**.
3. ~~ARQ-02~~ (R05), ~~QAL-03~~, ~~BKD-06~~, BDB-05 — refatorações estruturais (R05/R06/R04 pagos; BDB-05 pendente).
4. SEC-06 (rate-limit resend), SEC-07 (reuse-detection refresh) — segurança pendente.
5. DOC-01, FRN-05, BDB-06, QAL-04/05/06, ARQ-04 — backlog contínuo.
