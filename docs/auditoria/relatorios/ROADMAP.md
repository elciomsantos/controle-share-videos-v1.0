# ROADMAP — Controle Share Videos pós-v1.0

> **Fase 14**: Roadmap pós-lançamento
> **Data**: 2026-08-10
> **Auditor**: Opencode (agente automatizado)
> **Horizonte**: 6-12 meses

---

## 1. v1.1 — Refatoração e Hardening (4 semanas)

| Item | Esforço | Sprint |
|---|---|---|
| R02 — UploadRepository | 2-3 dias | 1 |
| ~~H-01 — CSP no Caddy~~ | ~~0.5 dia~~ | ✅ Concluído (2026-08-11) |
| R01 — AuthService decomposition | 5-7 dias | 2 |
| ~~H-03 — Sync branch `fix/producao-v1.1.0`~~ | ~~0.5 dia~~ | ✅ Concluído (2026-08-11) |
| H-04 — Playwright E2E setup | 3-5 dias | 3 |
| H-02 — Restore test automatizado | 1-2 dias | 4 |
| Docs operacional + README hardening | 2-3 dias | 4 |

---

## 2. v1.2 — Observabilidade e SRE (4-6 semanas)

- Alertas no Alertmanager/Grafana:
  - Job de limpeza falhou
  - SQLite lock contention
  - Latência p95 > 500ms
  - Disk usage > 80%
- Dashboards de SLI/SLO
- Tracing distribuído (OpenTelemetry)
- Runbooks para incidentes comuns

---

## 3. v1.3 — Cache e Escala (6-8 semanas)

- **Redis** para cache de configurações e permissões
- Avaliar migração do SQLite para **PostgreSQL** se crescimento > 500 usuários simultâneos
  - Estimativa: 2-3 semanas (migração + testes + deploy)
- Rate limit no edge Caddy com `caddy-ratelimit` plugin

---

## 4. v1.4 — S3 Storage Option (4 semanas)

- Implementar `S3UploadRepository` usando interface criada em R02
- Compatível com MinIO (S3 self-hosted) ou AWS S3
- Configuração por feature flag

---

## 5. v2.0 — App Router Migration (futuro)

- Migrar Next.js pages router → app router (quando Mantine 9 suportar)
- Streaming SSR
- React Server Components para reduzir bundle client

---

## 6. Backlog Contínuo

- **Dependabot / Renovate** — atualizações automáticas
- **Pentest externo** anual
- **Smoke load test** — k6 no CI

---

## 7. Marcos

| Marco | Versão | ETA |
|---|---|---|
| Go-live v1.0 | v1.0 | Imediato (com condições) |
| R01+R02+E2E+CSP | v1.1 | +4 semanas |
| Alertas + tracing | v1.2 | +8-10 semanas |
| Redis/PostgreSQL | v1.3 | +14-16 semanas |
| S3 storage | v1.4 | +18-20 semanas |

---

## 8. Notas

- v1.0 go-live **não depende** de R01/R02 — dívidas aceitas com plano de remediação
- Migração PostgreSQL (v1.3) só recomendada se métricas de SQLite em produção indicarem contenção
- S3 storage (v1.4) só acionado se volume de arquivos > 100GB

---

*Fim do ROADMAP.md*
