# PERFORMANCE_REPORT.md — Controle Share Videos v1.0

| Campo | Valor |
|---|---|
| Fase de origem | 6 (Performance) + achados correlatos de 4 (BDB-02/03) e 9 (DOP-08) |
| Data | 2026-08-04 |
| Status | ✅ Consolidação entregue (correções pendentes de execução — Fase 13) |
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
| PERF-01 | Listagens de shares **sem paginação** e com `includes` completos (N+1 amplificado) | 🔴 | Escala | `share.service.ts:272-301` | ❌ |
| BDB-03 | Mesmo problema visto do lado do banco | 🟡 | Escala | `share.service.ts:272-301` | ⚠️ parcial |
| BDB-02 | Índices ausentes nos caminhos quentes (`expiration`, `creatorId`, `File.shareId`, `expiresAt` dos tokens, `isActivated`) | 🟡 | Escala | `schema.prisma` | ✅ |
| PERF-02 | `complete()` envia e-mails de destinatários **sequencialmente** | 🟠 | Latência | `share.service.ts` | ✅ |
| PERF-03 | `createZip()` abre até `zipMaxFiles` **streams simultâneos** com deflate nível 9 inline | 🟠 | CPU/EMFILE | `share.service.ts` | ✅ (nível zip) |
| PERF-04 | Jobs de limpeza **sem batching/limite por execução** | 🟠 | Escala | `jobs.service.ts:35-86,170-188` | ⚠️ parcial |
| PERF-05 | `deleteTemporaryFiles()` com **fs síncrono** (bloqueia event loop) | 🟡 | Blocking I/O | `file/local.service.ts` | ✅ |
| PERF-06 | Downloads **sem HTTP Range (206)** — seek de vídeo quebrado | 🟠 | Funcional/UX | `file/` controller/serviço | ❌ |
| PERF-07 | Health check lê a **tabela `Config` inteira** | 🟡 | Trivial | `health` controller | ✅ |
| DOP-08 | Healthcheck `/api/health` no compose cruza com PERF-07 | 🟡 | Operação | `docker-compose.yml` | ✅ |

## 4. Conclusões

- **O gargalo dominante é a falta de paginação**: `getShares()`/`getSharesByUser()` materializam todas as linhas com todas as relações. É o item de maior ROI de escala.
- Download de vídeo (caso de uso central do produto — "share de vídeos") **não suporta Range requests**, o que quebra seek/streaming progressivo no player.
- E-mails sequenciais e streams de ZIP simultâneos são correções baratas e de alto impacto em latência/estabilidade.
- Jobs de limpeza rodam minuto a minuto varrendo a tabela toda sem índice em `expiration` (BDB-02) nem limite por execução.
- `fs` síncrono e healthcheck lendo `Config` inteira são ruído de baixo custo de correção.

## 5. Recomendações (prioridade de execução)

1. **P1 — PERF-01/BDB-03**: paginação por cursor/`take`+`skip` com `select` mínimo (R03 da Fase 12).
2. **P1 — BDB-02**: criar índices nos caminhos quentes (quick win, sem mudança de comportamento).
3. **P1 — PERF-06**: adicionar suporte a `Range`/`206` no download de vídeo.
4. **P2 — PERF-04**: batching + limite por execução nos crons (R04 da Fase 12).
5. **P2 — PERF-02**: enviar e-mails dos destinatários em paralelo controlado.
6. **P2 — PERF-03**: reduzir concorrência de streams e nível de deflate no ZIP.
7. **P3 — PERF-05/07/DOP-08**: `fs` assíncrono; health check barato (`SELECT 1` ou métrica em memória).

**Próximo passo:** executar conforme `REFACTORING_PLAN.md` (R03, R04) e validar com testes de carga no `TEST_PLAN.md`.
