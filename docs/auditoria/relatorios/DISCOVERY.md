# DISCOVERY — Controle Share Videos v1.0

> **Fase 0**: Descoberta e mapeamento do projeto
> **Data**: 2026-08-10
> **Auditor**: Opencode (agente automatizado)
> **Metodologia**: Análise estática de código, histórico Git, estrutura de arquivos, configurações de build/deploy
> **Fontes**: Working tree + `git show HEAD` (relatórios baseline anteriores preservados no histórico)

---

## 1. Visão Geral

**Controle Share Videos v1.0** é um fork do [Pingvin Share](https://github.com/stonith404/pingvin-share) customizado para um cenário institucional brasileiro, com controle de acesso baseado em papéis (RBAC), auditoria, rotação de chaves JWT, observabilidade e pipeline CI/CD para deploy em servidor SSH.

O sistema permite upload, compartilhamento e expiração de vídeos/arquivos com rastreabilidade e governance.

---

## 2. Stack Tecnológica

| Camada | Tecnologia | Versão |
|---|---|---|
| Backend | NestJS | 11 |
| ORM | Prisma | 6 |
| Database | SQLite (BetterSQLite3) | — |
| Auth | JWT (rotação híbrida), argon2 | — |
| Crypto | AES-256-GCM (segredos), jose (frontend) | — |
| Frontend | Next.js | 16 (pages router) |
| UI | Mantine | 9 |
| Monorepo | pnpm workspaces | — |
| Pacote compartilhado | `packages/shared` | — |
| Reverse Proxy | Caddy | — |
| Containers | Docker multi-stage (8 stages) | node:24-alpine |
| CI/CD | GitHub Actions (deploy SSH) | — |
| Observabilidade | Prometheus, Grafana, Loki | — |

---

## 3. Estrutura de Diretórios

```
controle-share-videos-v1.0/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # 10 models, 8 migrations
│   │   └── migrations/
│   ├── src/
│   │   ├── auth/
│   │   │   ├── decorator/         # @Public, @Authenticated, @AdminOnly, @AdminOrAuditor, @OperatorOrAbove
│   │   │   ├── guard/             # JwtGuard (fail-closed), ThrottlerGuard global
│   │   │   ├── service/           # AuthService, JwtService com rotação
│   │   │   └── strategy/
│   │   ├── config/
│   │   │   ├── config.service.ts  # ConfigTypeMap tipado (R06)
│   │   │   └── jwt-secret.service.ts # Rotação híbrida (kid + timeline), mutex, AES-256-GCM, cache
│   │   ├── jobs/
│   │   │   └── jobs.service.ts    # Batching (R04)
│   │   ├── share/
│   │   │   ├── share.service.ts  # Decomposto (R05)
│   │   │   ├── ShareMapper.ts
│   │   │   ├── ShareArchiveService.ts
│   │   │   └── FileStorageService.ts
│   │   └── ...
│   └── test/
├── frontend/
│   ├── src/
│   │   ├── pages/                 # _app.tsx (sem useRef(language))
│   │   ├── utils/
│   │   │   ├── concurrency.ts     # UPLOAD_CONCURRENCY=3, createUploadLimiter()
│   │   │   └── shareId.util.ts   # generateShareId, generateAvailableLink, generateRandomPassword
│   │   └── middleware.ts          # JWT verify com jose
│   └── package.json
├── packages/
│   └── shared/                    # Tipos e constantes compartilhadas
├── docs/
│   ├── Visao-geral.md
│   ├── Relatorio/
│   │   └── Especificacao-final.md # Protocolo de auditoria (18 fases, 13 artefatos)
│   └── auditoria/
│       └── relatorios/             # 13 artefatos (este diretório)
├── reverse-proxy/
│   ├── Caddyfile.prod             # TLS, HSTS, filtro pwd=
│   └── Caddyfile.dev
├── scripts/
│   ├── deploy/
│   │   └── deploy-prod.sh         # deploy com backup/rollback
│   ├── backup/
│   └── hardening/
├── Dockerfile                     # 8 stages, non-root UID 1002
├── docker-compose.prod.yml        # secrets, volumes, networks
├── docker-compose.monitoring.yml  # Prometheus, Grafana, Loki
└── .github/
    └── workflows/
        └── ci.yml                 # CI/CD com deploy SSH
```

---

## 4. Histórico Git

### 4.1 Branches
- **`main`** (ativa) — branch de produção
- `remotes/origin/fix/producao-v1.1.0` — refatorações R03-R06 (não mergeada)

### 4.2 Tags
- `pre-evolucao`
- `pre-evolucao-fase-1` ... `pre-evolucao-fase-7`
- `pre-evo`

### 4.3 Commits Recentes Relevantes
| Commit | Descrição |
|---|---|
| `6a29928` | 13 correções documentadas |
| `973bdc1` | QAL-06 (concorrência de upload, decomposição de modais) |
| `6c84d71` | Rotação JWT híbrida (kid + timeline) |
| `4c81acc` | Monitoramento Prometheus/Grafana/Loki |
| `31221f2` | CI/CD deploy SSH |

### 4.4 Baseline Anterior
Os 11 artefatos de auditoria anteriores (AUDIT_REPORT, SECURITY_REPORT, PERFORMANCE_REPORT, TECH_DEBT, REFACTORING_PLAN, ROADMAP, DEPENDENCY_AUDIT, TEST_PLAN, ARCHITECTURE_REVIEW, CHANGELOG_CORRECOES, PROGRESSO-REFATORACAO) estão preservados no `git HEAD` em `docs/auditoria/relatorios/` mas foram **removidos do working tree**.

**Decisão do auditor**: Conforme instrução do usuário, **não comparar com baseline anterior**. Foco no estado atual para validação de produção.

---

## 5. Models do Banco de Dados (Prisma)

10 models mapeados:
1. `User` — usuários com role (ADMIN, AUDITOR, OPERATOR, USER)
2. `Share` — compartilhamentos (BigInt para size, DateTime? nullable para expiração)
3. `ShareSecurity` — relação 1:1 com Share (senha, limite de downloads)
4. `File` — arquivos individuais
5. `AuditLog` — logs de auditoria
6. `Job` — jobs agendados
7. `RefreshToken` — tokens de refresh
8. `JwtKid` — registros de chave JWT para rotação
9. `Config` — configurações dinâmicas
10. `SystemSetting` — settings globais

`prisma validate` ✅

---

## 6. Refatorações Documentadas (R01-R06)

| ID | Descrição | Status |
|---|---|---|
| R01 | Decompor AuthService | ✅ Concluída |
| R02 | Extrair UploadRepository | ✅ Concluída |
| R03 | Tipagem de controllers | ✅ Concluída |
| R04 | Batching de jobs | ✅ Concluída |
| R05 | Decompor ShareService (ShareMapper, ShareArchiveService, FileStorageService) | ✅ Concluída |
| R06 | ConfigService tipado (ConfigTypeMap) | ✅ Concluída |

---

## 7. Pontos de Atenção Identificados na Descoberta

1. **SQLite em produção** — banco single-file, sem replica/failover; funciona para escala baixa/média
2. **R01 e R02** — AuthService e UploadRepository já decompostos (resolvidos em v1.1, 2026-08-11)
3. **Branch `fix/producao-v1.1.0` não mergeada** — trabalho de refatoração paralelo
4. **Sem testes E2E** — apenas unit/integration testes no CI
5. **Backup SQLite sem validação de restore automatizada**

---

## 8. Conclusão da Descoberta

O projeto é um fork maduro do Pingvin Share com camada institucional robusta (RBAC, auditoria, rotação JWT, observabilidade). O estado atual é de **maturidade intermediária-alta** com 4 das 6 refatorações concluídas, segurança bem implementada e pipeline de deploy completo. As pendências (R01, R02, SQLite, E2E) são conhecidas e documentadas, não bloqueando produção com condições.

**Veredito preliminar**: Aprovado para produção com condições →详见 `AUDIT_REPORT.md`.

---

*Fim do DISCOVERY.md*
