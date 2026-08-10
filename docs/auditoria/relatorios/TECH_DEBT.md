# TECH DEBT — Controle Share Videos v1.0

> **Fase 8**: Mapeamento de dívida técnica
> **Data**: 2026-08-10
> **Auditor**: Opencode (agente automatizado)

---

## 1. Resumo

| ID | Descrição | Severidade | Status |
|---|---|---|---|
| R01 | Decompor AuthService | Média | **Pendente** |
| R02 | Extrair UploadRepository | Média | **Pendente** |
| R03 | Tipagem de controllers | — | ✅ Concluída |
| R04 | Batching de jobs | — | ✅ Concluída |
| R05 | Decompor ShareService | — | ✅ Concluída |
| R06 | ConfigService tipado | — | ✅ Concluída |
| D01 | SQLite em produção | Alta (aceita) | Limitação documentada |
| D02 | Sem testes E2E | Média | Pendente |
| D03 | Branch `fix/producao-v1.1.0` não mergeada | Média | Sincronizar |
| D04 | Caddy sem CSP | Média | Pendente |
| D05 | Backup sem restore test | Baixa | Pendente |

---

## 2. Dívidas Detalhadas

### R01 — Decompor AuthService (Pendente)
- **Arquivo**: `backend/src/auth/service/auth.service.ts`
- **Problema**: AuthService concentra login, refresh, logout, verificação, rotação
- **Impacto**: Dificuldade de testes isolados, manutenção complexa, violação de SRP
- **Severidade**: Média — funcionando, mas obstáculo para evolução
- **Esforço estimado**: 3-5 dias
- **Plano**: ver `REFACTORING_PLAN.md`

### R02 — Extrair UploadRepository (Pendente)
- **Arquivo**: Upload module sem camada repository isolada
- **Problema**: Lógica de storage acoplada ao controller/service
- **Impacto**: Dificulta troca de storage (S3, backblaze, etc) e testes
- **Severidade**: Média
- **Esforço estimado**: 2-3 dias
- **Plano**: ver `REFACTORING_PLAN.md`

### D01 — SQLite em produção (Aceita)
- **Problema**: Single file, single writer, sem replica/failover
- **Mitigação**: WAL mode, jobs batching (R04), monitoramento Prometheus
- **Severidade**: Alta (aceita com condições)
- **Condição**: Documentar limitação em README operacional + ROADMAP para PostgreSQL

### D02 — Sem testes E2E
- **Problema**: CI executa apenas unit/integration testes, sem Playwright/Cypress
- **Impacto**: Regressões de fluxo ponta-a-ponta não detectadas automaticamente
- **Severidade**: Média
- **Recomendação**: Adicionar Playwright no CI para fluxos críticos (login, upload, share)

### D03 — Branch `fix/producao-v1.1.0` não mergeada
- **Problema**: Refatorações R03-R06 em branch remota não mergeada em `main`
- **Evidência**: `remotes/origin/fix/producao-v1.1.0` divergente
- **Ação**: Verificar se trabalho de R03-R06 já está em main (se sim, branch pode ser deletada)
- **Severidade**: Média

### D04 — Caddy sem CSP
- Ver `SECURITY_REPORT.md` S-05

### D05 — Backup sem restore test
- **Problema**: `scripts/backup/` gera backup mas sem script de restore automatizado para validação
- **Recomendação**: Adicionar job de restore test em ambiente staging

---

## 3. Resumo de Severidade

```
ALTA (aceita):     D01 (SQLite)
MÉDIA:             R01, R02, D02, D03, D04
BAIXA:             D05
```

---

## 4. Recomendação

As dívidas de severidade Média (R01, R02) podem ser endereçadas no ciclo v1.1. D01 (SQLite) é aceita com monitoramento e documentação. D02 (E2E) e D04 (CSP) são recommendations de hardening.

**Nenhuma dívida bloqueia produção desde que explicitamente aceita com plano de remediação**.

---

*Fim do TECH_DEBT.md*
