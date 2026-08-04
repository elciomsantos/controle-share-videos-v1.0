# ARCHITECTURE_REVIEW.md — Controle Share Videos v1.0

| Campo | Valor |
|---|---|
| Fase de origem | 1 (Arquitetural) + 0 (Descoberta) + contribuições de 2–11 |
| Data | 2026-08-04 |
| Status | ✅ Revisão entregue (recomendações pendentes — Fase 13) |

## 1. Introdução

Revisão da arquitetura do **Controle Share Videos v1.0** — fork do Pingvin Share X (v1.21.1) focado em compartilhamento de vídeos, com backend NestJS + Prisma/SQLite e frontend Next.js + Mantine. Este documento descreve a arquitetura atual, suas fortalezas, os pontos de atrito e o alvo de evolução.

## 2. Metodologia

- Leitura estrutural do monorepo (`backend/`, `frontend/`, `docker-compose*`, `reverse-proxy/`).
- Mapeamento de módulos, cadeia de guards, camadas e fluxo de dados.
- Cruzamento com os achados das Fases 2–11 para separar "limitações de design" de "falhas pontuais".

## 3. Arquitetura Atual (Fase 0 — Descoberta)

- **Monorepo**: `backend/` (NestJS 11, Prisma 7.9/SQLite via better-sqlite3) e `frontend/` (Next.js 16.2, Pages Router, Mantine 9).
- **Backend modular** por feature (auth, share, file, user, config, jobs, mail) com controllers/services/DTOs.
- **Cadeia de guards** global via `APP_GUARD`: Throttler → JWT → Roles → PasswordMustChange.
- **Prisma** como única camada de persistência; SQLite em arquivo único (`data/controle-videos.db`).
- **AsyncLocalStorage** para correlation ID (logs com contexto por requisição).
- **Deploy**: Docker Compose (base + prod) com Caddy 2.9 (reverse-proxy/TLS), multi-stage, non-root (UID 1002), volume `backend-data`.
- **Pipelines de features**: upload por chunks com `.tmp-chunk`, ZIP on-the-fly, expiração por cron (`@nestjs/schedule`), stream de download, e-mail de convite.

## 4. Fortalezas Arquiteturais (não são achados)

- Separação em módulos de feature e injeção de dependência consistente.
- Pipeline de guards composível (`strictShareOwner`, `shareSecurity`, `downloadLimit`, `shareTokenSecurity`) bem segmentado.
- Design seguro de física de arquivos: gravação em `.tmp-chunk` antes de commit, non-root no container.
- Trilha de auditoria imutável (`DownloadLog`) com índices e contadores atômicos (`increment`).
- Config centralizada e em memória (`CONFIG_VARIABLES`) com reload controlado.
- Migrations versionadas com backfills.

## 5. Pontos de Atrito (resumo dos achados por camada)

| Camada | Atrito | Achados |
|--------|--------|---------|
| Autenticação | Guard global fail-open; tokens sem TTL/reuse-detection | SEC-01, SEC-03, SEC-07 |
| Share | God class `ShareService` (772 LOC) concentra orquestração+mapeamento+a-dados | ARQ-02 |
| Dados | `File.size` String; sentinela `EPOCH_ZERO`; índices faltantes | BDB-01/02/05 |
| Performance | Listagens sem paginação; ZIP com N streams; e-mail sequencial | PERF-01/02/03 |
| Frontend | Duas libs JWT; estado mutável; `parseInt` de tamanho | FRN-01/02/03, INF-03 |
| Processo | Zero testes/CI; refs de docs quebradas; SECURITY stub | QAL-01, DOC-01/02 |

## 6. Evidências

- **Fontes primárias:** `FASE-0-DESCOBERTA.md` (estrutura/stack), `FASE-1-ARQUITETURAL.md` (ARQ-*), `FASE-2-BACKEND.md` (guards, resetPassword), `FASE-3-FRONTEND.md` (libs JWT, estado), `FASE-4-DATABASE.md` (BDB-*), `FASE-6-PERFORMANCE.md` (PERF-*), `FASE-7-QUALIDADE.md` (QAL-*), `FASE-12-REFATORACAO.md` (consolidado).
- **Contagens:** 15 módulos backend + cadeia `APP_GUARD` (Throttler→JWT→Roles→PasswordMustChange) verificada em `app.module.ts`; `ShareService` 772 LOC / 27 métodos (métrica de acoplamento); 2 libs JWT no frontend; guards `strictShareOwner`/`shareSecurity`/`downloadLimit`/`shareTokenSecurity` confirmados.
- **Cruzamento:** pontos de atrito mapeados por camada (seção 5) derivam de achados com evidência de arquivo/linha em cada fase; nada é inferência sem fonte.

## 7. Arquitetura-Alvo (evolução incremental)

```
presentation  (controllers/pages — thin, validação por guard/pipes)
      │
services     (orquestração fina — ShareService enxuto)
      │
domain       (ShareMapper, ShareArchiveService, FileStorageService — novos)
      │
persistence  (Prisma, índices, tipos numéricos — BigInt)
      │
cross        (ConfigService tipado, AsyncLocalStorage, jobs em lote)
```

Princípios-alvo:
1. **Fail-closed** por padrão (guards); público explícito via `@Public()`.
2. **Serviços pequenos** com responsabilidade única (decompor `ShareService`).
3. **Tipos fortes** (sem `any`, `config.get(): any` → getters tipados).
4. **Testabilidade** como critério de aceitação de mudança.
5. **Contratos explícitos** (paginação, BigInt serializado) versionados e documentados.

## 8. Conclusões

- A arquitetura é **fundamentalmente sólida** (modular, guards bem segmentados, física de arquivos segura) — os problemas estão em **instâncias de design** (fail-open, String para tamanho, god class, sem testes), não no esqueleto.
- A evolução deve ser **incremental e preservando APIs**: nenhuma reescrita verde é justificada.
- Prioridade de mudanças arquiteturais: (1) fail-closed, (2) tipos numéricos, (3) paginação, (4) decomposição do `ShareService`, (5) tipagem de config — ver `REFACTORING_PLAN.md` (R02, R01, R03, R05, R06).

## 9. Recomendações

1. **Fail-closed primeiro (R02):** trocar o fallback anônimo do guard global por `UnauthorizedException`, com rotas públicas explícitas via `@Public()`.
2. **Tipos numéricos (R01):** `File.size`/`shareSizeLimit` → `BigInt`, com `CAST`/backfill e deploy coordenado backend+frontend.
3. **Contratos explícitos (R03):** envelope paginado `Page<T>` nas listagens; documentar como breaking no changelog.
4. **Decomposição (R05):** extrair `ShareMapper`/`ShareArchiveService`/`FileStorageService` do `ShareService` — somente após a rede de testes (R07).
5. **Config tipada (R06):** substituir `get(): any` por `getNumber`/`getBoolean`/`getString` com `ConfigKeys`.
6. **Gate de arquitetura:** nova mudança só entra com teste + revisão de coesão (evitar crescimento do god class); reauditar a cada 3 meses.
