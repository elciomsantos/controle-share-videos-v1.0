# ROADMAP.md — Roteiro de Evolução do Controle Share Videos v1.0

| Campo | Valor |
|---|---|
| Fase de origem | 13 (Plano de Execução) |
| Data | 2026-08-04 |
| Status | ✅ Roteiro entregue (execução por marcos) |

## 1. Introdução

Roteiro de evolução organizado em horizontes **curto/médio/longo prazo**, agrupando quick wins, correções P0/P1 e evolução de produto. Cada marco referencia o artefato que detalha a mudança.

## 2. Metodologia

- Horizontes: curto (0–1 mês, segurança/dados), médio (1–3 meses, performance/dívida), longo (3–6 meses, manutenibilidade/produto).
- Itens extraídos da tabela de prioridades do `AUDIT_REPORT.md` (Fase 13.2) e dos achados P0–P3 das Fases 1–12.
- Ordem interna respeita a sequência de refatoração R07→R02→R01→R08→R03→R04→R06→R05 (`REFACTORING_PLAN.md`).
- Cada marco referencia o artefato-fonte (SECURITY_REPORT, PERFORMANCE_REPORT, etc.) para rastreabilidade.

## 3. Quick Wins (melhorias < 30 min — executar primeiro)

- Fix override `postcss` → 8.5.22+ e `npm audit fix` (INF-01).
- `engines` + `.nvmrc` (Node ≥24) (INF-02).
- Fixar tags de imagem `:latest` no monitoring (DOP-06) — ClamAV removido do compose.
- Excluir `secrets/` e `.env*` do `.dockerignore` (DOP-07).
- `rel="noopener noreferrer"` nos `target="_blank"` (FRN-09).
- Remover `user-scalable=no` (FRN-06).
- Preencher `license`/`repository` nos 4 `package.json` (DOC-04).
- Sanear `.env.local.example` (DOC-05).
- Índices nos caminhos quentes (`expiration`, `creatorId`, `File.shareId`, `expiresAt`, `isActivated`) (BDB-02).
- Health check barato — não ler `Config` inteira (PERF-07/DOP-08).
- `@@unique([shareId, email])` em `ShareRecipient` (BDB-06).

## 4. Curto Prazo (0–1 mês) — Estabilização de Segurança e Dados

| Item | Artefato | Prioridade |
|------|----------|------------|
| Infra de testes + CI (R07) | `REFACTORING_PLAN.md`, `TEST_PLAN.md` | P0 |
| JwtGuard fail-closed (R02) | `REFACTORING_PLAN.md`, `SECURITY_REPORT.md` | P0 |
| `File.size`/`shareSizeLimit` → `BigInt` (R01) | `REFACTORING_PLAN.md`, `SECURITY_REPORT.md` | P0 |
| Correções deploy Docker/Caddy (R08) | `REFACTORING_PLAN.md` | P1 |
| Expirar token de reset (SEC-03/BKD-01) | `SECURITY_REPORT.md` | P1 |
| Senha de share fora da query string (SEC-05) | `SECURITY_REPORT.md` | P1 |
| Preencher `SECURITY.md` (DOC-02) | `SECURITY_REPORT.md` | P1 |
| Paginação nas listagens (R03) | `PERFORMANCE_REPORT.md` | P1 |

## 5. Médio Prazo (1–3 meses) — Performance, Disponibilidade e Dívida

| Item | Artefato | Prioridade |
|------|----------|------------|
| HTTP Range (206) no download de vídeo | `PERFORMANCE_REPORT.md` | P1 |
| Jobs de limpeza em lote/transacional (R04) | `PERFORMANCE_REPORT.md`, `TECH_DEBT.md` | P2 |
| Config tipada, sem `any` (R06) | `TECH_DEBT.md` | P2 |
| E-mails de destinatários em paralelo controlado | `PERFORMANCE_REPORT.md` | P2 |
| ZIP: concorrência e nível de deflate | `PERFORMANCE_REPORT.md` | P2 |
| ~~Decidir ClamAV~~ ✅ Encerrado por decisão formal (26/07/2026) — rejeitado; código/dep/daemon removidos | `SECURITY_REPORT.md` | P2 |
| Sanear HTML em e-mails (SEC-04) | `SECURITY_REPORT.md` | P2 |
| ~~Remover órfãs (`clamscan`, 1 de 2 libs JWT)~~ ✅ `clamscan` removido; resta unificar `jose`×`jwt-decode` | `DEPENDENCY_AUDIT.md` | P2 |
| Corrigir ~20 referências quebradas do README (DOC-01) | `TECH_DEBT.md` | P2 |
| `EPOCH_ZERO` → `expiresAt` nullable (BDB-05) | `TECH_DEBT.md` | P2 |
| Refresh token atômico + reuse-detection (SEC-07) | `SECURITY_REPORT.md` | P3 |

## 6. Longo Prazo (3–6 meses) — Manutenibilidade e Produto

| Item | Artefato | Prioridade |
|------|----------|------------|
| Decomposição do `ShareService` (R05) | `REFACTORING_PLAN.md`, `ARCHITECTURE_REVIEW.md` | P2 |
| Rate-limit de `resendVerification` (SEC-06) | `SECURITY_REPORT.md` | P3 |
| ~~Rotação de `JWT_SECRET` e segredos em secret manager~~ ✅ Pago 2026-08-09 | `SECURITY_REPORT.md`, `ARCHITECTURE_REVIEW.md` | P3 |
| Migrar SQLite → banco concorrente (PostgreSQL) quando o volume exigir | `ARCHITECTURE_REVIEW.md` | P3 |
| Módulo de observabilidade (métricas, traces, alertas) | `ARCHITECTURE_REVIEW.md` | P3 |
| ~~CI/CD com deploy automatizado~~ ✅ Pago 2026-08-09 (job `deploy` no `ci.yml` + `scripts/deploy/deploy-prod.sh`; guia `docs/CI-CD.md`) | `ROADMAP.md` | P3 |
| Suporte oficial a multi-instância / armazenamento S3 | `ARCHITECTURE_REVIEW.md` | P3 |
| Versionamento de API e changelog automatizado | `CHANGELOG_SUGERIDO.md` | P3 |

## 7. Critérios de Governança
- Cada marco entra via PR com CI verde (testes), changelog e revisão.
- Nada estrutural (R05) sem rede de testes (R07) estável.
- Mudanças de contrato (R01, R03) versionadas e anunciadas no `CHANGELOG_SUGERIDO.md`.
- Reauditoria de segurança (fase 5) a cada 3 meses ou a cada release de contrato.

## 8. Evidências

- Fontes: `AUDIT_REPORT.md` (13.2 Prioridades; 13.3 Quick Wins; 13.4 Refatorações), `FASE-12-REFATORACAO.md` (75 achados), `SECURITY_REPORT.md`, `PERFORMANCE_REPORT.md`, `DEPENDENCY_AUDIT.md`, `TECH_DEBT.md`, `TEST_PLAN.md`.
- Cada item das tabelas carrega o ID do achado (SEC-*, PERF-*, INF-*, DOC-*, BDB-*, DOP-*, FRN-*, QAL-*) com evidência de arquivo/linha na fase de origem.

## 9. Conclusões

- A maior parte do ganho em risco está no **primeiro mês** (fail-closed, BigInt, deploy, testes+CI).
- Itens de longo prazo dependem de base de testes e não devem ser iniciados antes de R07.

## 10. Recomendações

1. Executar os 11 quick wins imediatamente (sem dependência de CI).
2. Aplicar o bloco de curto prazo como primeira release (v1.1.0 do `CHANGELOG_SUGERIDO.md`).
3. Revisar o roteiro a cada trimestre, atualizando prioridades conforme uso real e reauditoria de segurança.
