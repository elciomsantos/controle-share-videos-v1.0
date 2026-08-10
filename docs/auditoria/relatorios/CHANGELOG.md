# CHANGELOG — Controle Share Videos v1.0

> **Fase 17**: Registro de mudanças
> **Data**: 2026-08-10
> **Auditor**: Opencode (agente automatizado)
> **Comparação**: Conforme decisão do usuário, **não comparar com baseline anterior**. Foco em estado atual para go-live.

---

## v1.0 — Auditoria de Prontidão para Produção (2026-08-10)

### Resumo
Auditoria completa do estado atual do Controle Share Videos v1.0 (fork de Pingvin Share) validada para ir para produção **com condições**, nota geral **7.5/10**.

### Estado Técnico Atual

#### ✅ Funcionalidades Validadas
- Backend NestJS 11 + Prisma 6 + SQLite com 10 models validados
- JWT com rotação híbrida (kid + timeline + mutex + AES-256-GCM)
- Guards globais fail-closed: ThrottlerGuard, JwtGuard, RolesGuard, PasswordMustChangeGuard
- RBAC fino com 4 papéis (ADMIN, AUDITOR, OPERATOR, USER) e decorators semânticos
- Frontend Next.js 16 + Mantine 9 com middleware jose para JWT
- Upload concorrente limitado (QAL-06: UPLOAD_CONCURRENCY=3)
- Decomposição ShareService (R05 ✅): ShareMapper + ShareArchiveService + FileStorageService
- ConfigService tipado (R06 ✅): ConfigTypeMap elimina `any`
- Jobs com batching (R04 ✅)
- Docker multi-stage (8 stages, non-root UID 1002, node:24-alpine)
- Caddy reverse proxy com TLS, HSTS, filtro `pwd=`
- CI/CD GitHub Actions com deploy SSH + scripts de backup/hardening
- Observabilidade: Prometheus + Grafana + Loki
- `pnpm audit` limpo (0 CVE)

#### ⚠️ Pendências (com plano de remediação em v1.1)
- **R01**: AuthService não decomposto (monolítico) — REFACTORING_PLAN
- **R02**: UploadRepository não extraído — REFACTORING_PLAN
- **S-05/D04**: Caddy sem CSP header — REFACTORING_PLAN H-01
- **D02**: Sem testes E2E — REFACTORING_PLAN H-04
- **D03**: Branch `fix/producao-v1.1.0` divergente — REFACTORING_PLAN H-03
- **D05**: Backup sem restore test automatizado — REFACTORING_PLAN H-02

#### 📋 Limitações Aceitas
- **A-06/D01**: SQLite em produção (single-writer, sem replica) — Aceito com monitoramento Prometheus + ROADMAP PostgreSQL em v1.3

### Histórico Git (Commits Relevantes)
- `6a29928` — 13 correções documentadas
- `973bdc1` — QAL-06 (concorrência upload + modais decompostos)
- `6c84d71` — Rotação JWT híbrida
- `4c81acc` — Monitoramento Prometheus/Grafana/Loki
- `31221f2` — CI/CD deploy SSH

### Refatorações Concluídas
- ✅ R03 — Tipagem de controllers
- ✅ R04 — Batching de jobs
- ✅ R05 — Decomposição ShareService
- ✅ R06 — ConfigService tipado

### Refatorações Pendentes
- ⏳ R01 — Decompor AuthService (ETA: Sprint 2 v1.1)
- ⏳ R02 — Extrair UploadRepository (ETA: Sprint 1 v1.1)

### Artefatos gerados nesta auditoria (13/13)
1. ✅ DISCOVERY.md
2. ✅ ARCHITECTURE_REVIEW.md
3. ✅ SECURITY_REPORT.md
4. ✅ PERFORMANCE_REPORT.md
5. ✅ TECH_DEBT.md
6. ✅ REFACTORING_PLAN.md
7. ✅ ROADMAP.md
8. ✅ DEPENDENCY_AUDIT.md
9. ✅ TEST_PLAN.md
10. ✅ AUDIT_MATRIX.md
11. ✅ EVIDENCE_INDEX.md
12. ✅ CHANGELOG.md (este)
13. ✅ AUDIT_REPORT.md (consolidador)

### Decisões de Auditoria
- Não comparar com baseline anterior (decisão explícita do usuário)
- Foco em validar estado atual para produção
- Pendências não bloqueiam go-live desde que explicitamente aceitas com plano de remediação v1.1

---

*Fim do CHANGELOG.md*
