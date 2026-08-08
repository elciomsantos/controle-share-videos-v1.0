# PERFORMANCE_REPORT.md — Controle Share Videos v1.0

| Campo | Valor |
|---|---|
| Fase de origem | 6 (Performance) + achados correlatos de 4 (BDB-02/03) e 9 (DOP-08) |
| Data | 2026-08-04 |
| Status | 🔄 Maioria executada — PERF-01/02/03/04/05/07 e BDB-02/03 pagos; resta PERF-06 |
| Objeto | Listagens, upload/download de vídeo, ZIP, jobs de limpeza, health check |

## 1. Introdução

Consolidação dos achados de performance da Fase 6 (`PERF-01` a `PERF-07`) com os de banco (Fase 4: `BDB-02` índices, `BDB-03` paginação) e operação (Fase 9: `DOP-08` healthcheck). Foco nos caminhos quentes: listagem de shares, upload com chunks, download/streaming de vídeo, ZIP e crons.

## 2. Metodologia

- Análise de complexidade assintótica e de I/O dos serviços críticos (`share.service.ts`, `file/local.service.ts`, `jobs.service.ts`).
- Revisão de índices do schema contra os filtros/orders reais.
- Identificação de bloqueio de event loop (I/O síncrono) e concorrência de streams (EMFILE).
- Classificação: impacto Escala / Latência / CPU / Blocking I/O / Funcional-UX.

## 3. Evidências e Achados

| ID | Achado | Sev. | Impacto | Localização | Quick Win |
|----|--------|------|---------|-------------|-----------|
| ~~PERF-01~~ | ~~Listagens de shares **sem paginação** e com `includes` completos (N+1 amplificado)~~ | ~~🔴~~ | ~~Escala~~ | ✅ Resolvido 2026-08-07 (R03) — `getShares(page,perPage)` com `skip`/`take`/`count` + envelope `{items,total,page,perPage}` |
| ~~BDB-03~~ | ~~Mesmo problema visto do lado do banco~~ | ~~🟡~~ | ~~Escala~~ | ✅ Resolvido 2026-08-07 (R03) — paginado com `take`/`skip` |
| ~~BDB-02~~ | ~~Índices ausentes nos caminhos quentes~~ | ~~🟡~~ | ~~Escala~~ | ✅ Resolvido 2026-08-04 — 5 `@@index` no schema (expiration, creatorId, File.shareId, expiresAt, isActivated) + migration `add_hot_path_indexes` |
| ~~PERF-02~~ | ~~`complete()` envia e-mails de destinatários **sequencialmente**~~ | ~~🟠~~ | ~~Latência~~ | ✅ Resolvido 2026-08-08 — `Promise.allSettled` + log por destinatário; falha não aborta mais o `complete()` |
| ~~PERF-03~~ | ~~`createZip()` abre até `zipMaxFiles` **streams simultâneos** com deflate nível 9 inline~~ | ~~🟠~~ | ~~CPU/EMFILE~~ | ✅ Resolvido 2026-08-08 — streams lazy em lotes de 16 com `drain`; default `zipCompressionLevel` 9→6 |
| ~~PERF-04~~ | ~~Jobs de limpeza **sem batching/limite por execução**~~ | ~~🟠~~ | ~~Escala~~ | ✅ Resolvido 2026-08-07 (R04) — batch `take: 50` + cursor + `deleteMany` + `try/catch` por item |
| ~~PERF-05~~ | ~~`deleteTemporaryFiles()` com **fs síncrono** (bloqueia event loop)~~ | ~~🟡~~ | ~~Blocking I/O~~ | ✅ Resolvido 2026-08-07 (commit `b1f2ea3`) — async `fs/promises` + try/catch por diretório/arquivo; +4 testes unit |
| PERF-06 | Downloads **sem HTTP Range (206)** — seek de vídeo quebrado | 🟠 | Funcional/UX | `file/` controller/serviço | ❌ |
| ~~PERF-07~~ | ~~Health check lê a **tabela `Config` inteira**~~ | ~~🟡~~ | ~~Trivial~~ | ✅ Resolvido 2026-08-07 (DOP-08) — `$queryRaw\`SELECT 1\`` |
| ~~DOP-08~~ | ~~Healthcheck `/api/health` no compose cruza com PERF-07~~ | ~~🟡~~ | ~~Operação~~ | ✅ Resolvido 2026-08-07 — healthcheck leve `SELECT 1` |

## 4. Conclusões

- ~~**O gargalo dominante é a falta de paginação**: `getShares()`/`getSharesByUser()` materializam todas as linhas com todas as relações.~~ ✅ Resolvido 2026-08-07 (R03 — paginação com `take`/`skip`/`count`).
- Download de vídeo (caso de uso central do produto — "share de vídeos") **não suporta Range requests**, o que quebra seek/streaming progressivo no player. ⏳ **Pendente (PERF-06).**
- ~~E-mails sequenciais e streams de ZIP simultâneos são correções baratas e de alto impacto em latência/estabilidade.~~ ✅ Resolvidos 2026-08-08 (PERF-02: `Promise.allSettled`; PERF-03: lotes de 16 com `drain` + nível 6).
- ~~Jobs de limpeza rodam minuto a minuto varrendo a tabela toda sem índice em `expiration` (BDB-02) nem limite por execução.~~ ✅ Resolvidos (BDB-02: índices 2026-08-04; PERF-04: batch 50 + try/catch 2026-08-07).
- ~~`fs` síncrono e healthcheck lendo `Config` inteira são ruído de baixo custo de correção.~~ ✅ Resolvidos (PERF-05: async `fs/promises`; PERF-07/DOP-08: `SELECT 1`).

## 5. Recomendações (prioridade de execução)

1. ~~**P1 — PERF-01/BDB-03**: paginação por cursor/`take`+`skip` com `select` mínimo (R03 da Fase 12).~~ ✅ Resolvido 2026-08-07.
2. ~~**P1 — BDB-02**: criar índices nos caminhos quentes.~~ ✅ Resolvido 2026-08-04.
3. **P1 — PERF-06**: adicionar suporte a `Range`/`206` no download de vídeo. ⏳ Pendente — **próximo bloco**.
4. ~~**P2 — PERF-04**: batching + limite por execução nos crons (R04 da Fase 12).~~ ✅ Resolvido 2026-08-07.
5. ~~**P2 — PERF-02**: enviar e-mails dos destinatários em paralelo controlado.~~ ✅ Resolvido 2026-08-08 (`Promise.allSettled` + log por destinatário).
6. ~~**P2 — PERF-03**: reduzir concorrência de streams e nível de deflate no ZIP.~~ ✅ Resolvido 2026-08-08 (lotes de 16 + `drain`; `zipCompressionLevel` 9→6).
7. ~~**P3 — PERF-05/07/DOP-08**: `fs` assíncrono; health check barato.~~ ✅ Resolvidos 2026-08-07.

**Próximo passo:** executar PERF-06 (suporte a HTTP Range/206 no download de vídeo) — último pendente da Fase 6.
