# AUDIT MATRIX — Controle Share Videos v1.0

> **Fase 16**: Matriz de rastreabilidade
> **Data**: 2026-08-10
> **Auditor**: Opencode (agente automatizado)
> **Protocolo**: Problema → Evidência → Causa → Risco → Prioridade → Recomendação → Implementação → Teste → Validação → Documentação

---

## Matriz Consolidada

| ID | Problema | Evidência | Causa | Risco | Prioridade | Recomendação | Status | Artefato |
|---|---|---|---|---|---|---|---|---|
| **A-01** | AuthService monolítico | `backend/src/auth/service/auth.service.ts` | Refatoração R01 não executada | Manutenção difícil, testes isolados | Média | Decompor em Login/Token/Refresh/Verification | **Pendente** | TECH_DEBT, REFACTORING_PLAN |
| **A-02** | UploadRepository não extraído | Upload module sem camada repo | Refatoração R02 não executada | Troca de storage difícil | Média | Extrair `IUploadRepository` | ✅ Resolvido (R02) | TECH_DEBT, REFACTORING_PLAN |
| **A-03** | ConfigService tipado (R06) | `backend/src/config/config.service.ts` | — | — | — | — | ✅ OK | ARCHITECTURE_REVIEW |
| **A-04** | ShareService decomposto (R05) | `backend/src/share/share.service.ts` | — | — | — | — | ✅ OK | ARCHITECTURE_REVIEW |
| **A-05** | Jobs batching (R04) | `backend/src/jobs/jobs.service.ts` | — | — | — | — | ✅ OK | ARCHITECTURE_REVIEW, PERFORMANCE |
| **A-06** | SQLite sem replica | `docker-compose.prod.yml` | Decisão de design | SPOF, single-writer | Alta (aceita) | Documentar + ROADMAP PostgreSQL | **Aceito** | ARCHITECTURE_REVIEW, ROADMAP |
| **S-01** | Segredos via env_file em Caddy/monitoring | `docker-compose.prod.yml` | Omissão | Segredos não criptografados em trânsito | Baixa | Migrar para Docker Secrets | Pendente | SECURITY_REPORT |
| **S-02** | JWT fail-closed + rotação híbrida | `jwt.guard.ts`, `jwt-secret.service.ts` | — | — | — | — | ✅ OK | SECURITY_REPORT |
| **S-03** | RBAC fino com 4 papéis e decorators | `guards.decorator.ts` | — | — | — | — | ✅ OK | SECURITY_REPORT |
| **S-04** | Middleware frontend jose | `frontend/src/middleware.ts` | — | — | — | — | ✅ OK | SECURITY_REPORT |
| **S-05** | Caddy sem CSP header | `reverse-proxy/Caddyfile.prod` | Omissão | XSS não mitigado por CSP | Média | Adicionar diretiva CSP | ✅ Resolvido (H-01) | SECURITY_REPORT, REFACTORING_PLAN H-01 |
| **S-06** | Caddy sem rate limit edge | `Caddyfile.prod` | Omissão | DDoS volumétrico | Baixa | Avaliar caddy-ratelimit plugin | Pendente | SECURITY_REPORT |
| **P-01** | Upload concorrente limitado | `frontend/src/utils/concurrency.ts` | — | — | — | — | ✅ OK | PERFORMANCE |
| **P-03** | Sem cache Redis | Sem Redis no compose | Decisão de design | Queries repetidas | Média-Baixa | Avaliar Redis se crescimento | Pendente | PERFORMANCE, ROADMAP |
| **D-01** | SQLite em produção | — | Decisão de design | SPOF | Alta (aceita) | Monitorar + documentar | **Aceito** | TECH_DEBT, ROADMAP |
| **D-02** | Sem testes E2E | CI só roda unit/integration | Omissão | Regressões E2E | Média | Adicionar Playwright | Pendente | TEST_PLAN, REFACTORING_PLAN H-04 |
| **D-03** | Branch `fix/producao-v1.1.0` divergente | `git branch -a` | Trabalho paralelo não sync | Confusão de main verdade | Média | Verificar e sync/deletar | ✅ Resolvido (H-03) | TECH_DEBT, REFACTORING_PLAN H-03 |
| **D-04** | Caddy sem CSP | = S-05 | — | — | — | — | ✅ Resolvido (H-01) | SECURITY_REPORT |
| **D-05** | Backup sem restore test | `scripts/backup/` | Omissão | Backup inválido não detectado | Baixa | Job de restore test | Pendente | TECH_DEBT, REFACTORING_PLAN H-02 |

---

## Cobertura por Dimensão

| Dimensão | Achados | OK | Pendentes | Aceitos |
|---|---|---|---|---|
| Arquitetura | 6 | 4 (A-03, A-04, A-05) + A-02 | 1 (A-01) | 1 (A-06 SQLite) |
| Segurança | 6 | 4 (S-02, S-03, S-04) + S-05 | 2 (S-01, S-06) | — |
| Performance | 2 | 1 (P-01) | 1 (P-03) | — |
| DevOps | 5 | 2 (D-03, D-04) | 2 (D-02, D-05) | 1 (D-01 SQLite) |
| **TOTAL** | **19** | **11** | **6** | **2** |

---

## Resumo de Prioridades

- **Alta (aceita com monitoramento)**: A-06/D01 (SQLite)
- **Média**: A-01, D02
- **Baixa**: S-01, S-06, P-03, D05
- **Resolvidos**: A-02/R02 (UploadRepository), S-05/D04 (CSP), D03 (branch)

---

## Veredito Geral

**11/19 OK** + **2 aceitos com monitoramento** = **13/19 verde/aceito**
**6 pendentes** (média ou baixa prioridade)

**Atualizado após v1.1**: H-01 (CSP), H-03 (branch) e R02 (UploadRepository) resolvidos.

**Go-live**: Aprovado com condições. Pendências devem ser endereçadas em v1.1 (4 semanas).

---

*Fim do AUDIT_MATRIX.md*
