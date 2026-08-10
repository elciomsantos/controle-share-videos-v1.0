# TEST PLAN — Controle Share Videos v1.0

> **Fase 12**: Cobertura e plano de testes
> **Data**: 2026-08-10
> **Auditor**: Opencode (agente automatizado)
> **Ferramenta**: Vitest (backend + frontend)

---

## 1. Ambiente de Testes

| Camada | Runner | Configuração |
|---|---|---|
| Backend | Vitest | `backend/vitest.config.ts` |
| Frontend | Vitest | `frontend/vitest.config.ts` |
| E2E | _Não implementado_ | Recomendado Playwright |

---

## 2. Cobertura Atual

### Backend
- **Unit tests**: serviços isolados (Share, Auth, Jobs, Config)
- **Integration tests**: controllers + Prisma (test DB SQLite in-memory)
- **Guard tests**: JwtGuard, RolesGuard, ThrottlerGuard
- **Decorators test**: @Public, @Authenticated, @AdminOnly

### Frontend
- **Unit tests**: utils (concurrency.ts, shareId.util.ts)
- **Component tests**: modais decompostos (QAL-06)
- **Middleware test**: `jose` verify com mocks

### Execução
```
pnpm --filter backend test   # ✅ passing
pnpm --filter frontend test  # ✅ passing
```

---

## 3. Gaps Identificados

### T-01: Sem testes E2E (D02)
- **Cobertura atual**: apenas unit/integration
- **Risco**: regressões em fluxos ponta-a-ponta não detectadas
- **Recomendação**: Adicionar Playwright para fluxos críticos:
  1. Login → Landing
  2. Upload → Share generation
  3. Share access → Download
  4. Expiration job → Share expirado
  5. Admin → Auditoria logs

### T-02: Sem teste de carga
- **Cobertura atual**: nenhum k6/Artillery
- **Recomendação**: Smoke test com k6 no CI/Staging:
  - 50 VUs por 30s em `/api/share`
  - Validar < 500ms p95

### T-03: Sem teste de mutação
- **Cobertura atual**: nenhum stryker
- **Prioridade**: Baixa — nice-to-have para aumentar confiança

---

## 4. Plano de Expansão

### Sprint 1 — Setup E2E
- Instalar Playwright
- Configurar `e2e/` com baseURL staging
- 1 smoke test (login)

### Sprint 2 — Fluxos críticos
- Login, Upload, Share, Download, Expiration

### Sprint 3 — Integration CI
- Job `e2e` no `.github/workflows/ci.yml`
- Rodar contra container stack staging

### Sprint 4 — Smoke load test
- Setup k6
- Adicionar script `tests/load/smoke.js`

---

## 5. Métricas Alvo

| Métrica | Atual | Alvo v1.1 |
|---|---|---|
| Backend unit coverage | ~70% (estimado) | 80% |
| Frontend unit coverage | ~60% (estimado) | 70% |
| E2E fluxos cobertos | 0 | 5 |
| Smoke load test | Nenhum | 1 |
| CI running time | ~2 min | < 10 min |

---

## 6. Conclusão

Cobertura de testes unitários e integration é **adequada e funcionando** ✅. Gap principal é ausência de E2E, que deve ser endereçado no v1.1 conforme ROADMAP. Para go-live, testes atuais + validação manual são suficientes, com E2E recomendado como melhoria contínua.

**Nota**: 7/10

---

*Fim do TEST_PLAN.md*
