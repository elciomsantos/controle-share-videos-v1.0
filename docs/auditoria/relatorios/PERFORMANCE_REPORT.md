# PERFORMANCE REPORT — Controle Share Videos v1.0

> **Fase 6**: Auditoria de performance
> **Data**: 2026-08-10
> **Auditor**: Opencode (agente automatizado)

---

## 1. Resumo Executivo

| Dimensão | Status |
|---|---|
| Upload concorrente | ✅ QAL-06 (3 paralelos + limiter) |
| Jobs batching | ✅ R04 |
| Paginação | ✅ Prisma (cursor/offset) |
| Índices DB | ✅ Definidos no schema |
| Cache | ⚠️ Não implementado (aceitável p/ escala atual) |
| SQLite WAL | ✅ Habilitado |

---

## 2. Upload de Arquivos

### Concorrência Limitada
**Arquivo**: `frontend/src/utils/concurrency.ts`
- `UPLOAD_CONCURRENCY = 3` — máx. 3 uploads paralelos por usuário
- `createUploadLimiter()` — factory de rate limiter para limitar throughput

**Veredito ✅**: Limita acidez de requests e previne sobrecarga do backend. QAL-06 implementada e validada.

---

## 3. Jobs Assíncronos

### Batching (R04 ✅)
**Arquivo**: `backend/src/jobs/jobs.service.ts`

- Antes do R04: jobs executavam 1 share por iteração (N+1 queries)
- Após R04: jobs processam em **batch** reduzindo I/O no SQLite

**Veredito ✅**: Reduz drasticamente queries e bloqueio de writer em SQLite.

---

## 4. Banco de Dados (SQLite)

### SQLite WAL Mode
- `WAL` (Write-Ahead Logging) habilitado — permite leitores concorrentes com 1 writer
- Pragmas configurados para consistência

### Índices
**Arquivo**: `backend/prisma/schema.prisma`
- Índices definidos em campos de busca frequente (shareId, userId, expiration)
- `@@index` em relações foreign key

### Paginação
- Prisma `findMany` com `take`/`skip` ou `cursor` para paginação eficiente
- Lista de shares com paginação + filtros

### BigInt para Tamanho
- Campo `size` do Share usa `BigInt` (não `Int`) — evita overflow para arquivos > 2GB

---

## 5. Achados de Performance

### P-03: Sem cache Redis (MÉDIO-BAIXO)
- **Problema**: Backend sem cache para queries frequentes (config, user permissions)
- **Evidência**: Sem instância Redis em `docker-compose.prod.yml`
- **Causa**: Decisão de design — SQLite + NestJS in-memory suffice para escala atual
- **Risco**: Queries repetidas ao DB para dados quentes
- **Prioridade**: **Média-Baixa** — aceitável para centenas de usuários, não para milhares
- **Recomendação**: Avaliar Redis no roadmap se crescimento > 1000 usuários simultâneos

### P-04: SQLite single-writer (conhecido)
- **Problema**: SQLite permite apenas 1 writer simultâneo (mesmo em WAL)
- **Mitigação**: R04 (batching) reduz writes concorrentes
- **Prioridade**: Baixa (limitação aceita)
- **Ver observação em ARCHITECTURE_REVIEW.md A-06**

---

## 6. Frontend

- Next.js 16 com pages router — SSR/SSG configurável
- Mantine 9 — biblioteca leve comparada a Material-UI
- Sem bundle bloat detectado

---

## 7. Veredito de Performance

**Nota**: 7.5/10

Performance adequada para escala baixa/média (centenas de usuários). Com upload limitado, jobs em batch, SQLite WAL e índices, sistema comporta carga institucional típica. Redis cache é otimização futura justificada no ROADMAP.

---

*Fim do PERFORMANCE_REPORT.md*
