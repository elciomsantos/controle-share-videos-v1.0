# TECH DEBT — Controle Share Videos v1.0

> **Fase 8**: Mapeamento de dívida técnica
> **Data**: 2026-08-10
> **Auditor**: Opencode (agente automatizado)

---

## 1. Resumo

| ID | Descrição | Severidade | Status |
|---|---|---|---|
| R01 | Decompor AuthService | Média | **Pendente** |
| R02 | Extrair UploadRepository | Média | ✅ Concluída |
| R03 | Tipagem de controllers | — | ✅ Concluída |
| R04 | Batching de jobs | — | ✅ Concluída |
| R05 | Decompor ShareService | — | ✅ Concluída |
| R06 | ConfigService tipado | — | ✅ Concluída |
| D01 | SQLite em produção | Alta (aceita) | Limitação documentada |
| D02 | Sem testes E2E | Média | Pendente |
| D03 | Branch `fix/producao-v1.1.0` não mergeada | Média | ✅ Resolvida (100% mergeada em main, branch removida) |
| D04 | Caddy sem CSP | Média | ✅ Resolvida (H-01: CSP adicionado no Caddyfile.prod) |
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

### R02 — Extrair UploadRepository (Concluída ✅)
- **Arquivo**: `backend/src/storage/` (nova camada)
- **Problema**: Lógica de storage acoplada ao controller/service
- **Impacto**: Dificulta troca de storage (S3, backblaze, etc) e testes
- **Severidade**: Média
- **Esforço estimado**: 2-3 dias
- **Solução aplicada**: Interface `IUploadRepository` (token `Symbol`) + `FilesystemUploadRepository` em `backend/src/storage/`. `StorageModule` injeta via DI. `LocalFileService`, `ShareArchiveService`, `JobsService` e `FileStorageService` agora dependem da interface, sem acesso direto a `fs`/`SHARE_DIRECTORY`. Trocar para S3 = criar `S3UploadRepository` + swap do provider.

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

### D03 — Branch `fix/producao-v1.1.0` não mergeada ✅
- **Problema**: Refatorações R03-R06 em branch remota não mergeada em `main`
- **Evidência**: `remotes/origin/fix/producao-v1.1.0` divergente
- **Ação**: Verificado — **todos os commits da branch já estão em main** (0 commits pendentes; merge-base = tip da branch). Branch removida do remoto (H-03).
- **Severidade**: Média — **Resolvida**

### D04 — Caddy sem CSP ✅
- **Ação**: CSP estrito adicionado no `header` do `reverse-proxy/Caddyfile.prod` (H-01), cobrindo `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (Mantine), `media-src 'self' blob:`, `frame-src 'self'` (PDF iframe), `worker-src 'self' blob:` (Serwist) e `object-src 'none'`. Validado com `caddy validate` (config válida).
- **Severidade**: Média — **Resolvida**

### D05 — Backup sem restore test
- **Problema**: `scripts/backup/` gera backup mas sem script de restore automatizado para validação
- **Recomendação**: Adicionar job de restore test em ambiente staging

---

## 3. Resumo de Severidade

```
ALTA (aceita):     D01 (SQLite)
MÉDIA:             R01, D02
BAIXA:             D05
RESOLVIDAS:        R02 (UploadRepository), D03 (branch), D04 (CSP H-01)
```

---

## 4. Recomendação

A dívida de severidade Média restante (R01 — AuthService) pode ser endereçada no próximo ciclo v1.1. D01 (SQLite) é aceita com monitoramento e documentação. D02 (E2E) é recommendation de hardening. **R02 (UploadRepository), D03 (branch) e D04 (CSP) já foram resolvidas**.

**Nenhuma dívida bloqueia produção desde que explicitamente aceita com plano de remediação**.

---

*Fim do TECH_DEBT.md*
