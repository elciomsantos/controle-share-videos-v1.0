# TEST_PLAN.md — Controle Share Videos v1.0

| Campo | Valor |
|---|---|
| Fase de origem | 10 (Testes/QA) + contribuição da Fase 7 (QAL-01) |
| Data | 2026-08-04 |
| Status | ✅ Plano entregue (implementação pendente — R07 da Fase 12) |

## 1. Introdução

Plano de testes para levar o projeto de **zero testes automatizados** a uma linha de base sustentável: unitários (backend/frontend), integração com banco e E2E **não destrutivos**, com gates de CI. Atende QTS-01/02/03/04/05/06/07 (Fase 10) e QAL-01 (Fase 7).

## 2. Metodologia

- Pirâmide de testes: unitário (rápido, sem I/O) → integração (Prisma + SQLite dedicado) → E2E (HTTP real) → UI (crítico).
- Banco de teste **dedicado e efêmero** (`file:./test-e2e.db`), criado/apagado por execução — nunca o banco de dev (`migrate reset -f` é proibido nos novos scripts).
- Cobertura priorizada pelos fluxos críticos do produto (compartilhamento de vídeo): upload com chunks → criação de share → convite por e-mail → download/stream → expiração.
- CI em GitHub Actions com 4 gates: lint → build → unit → e2e.

## 3. Evidências (situação atual)

| ID | Achado | Estado |
|----|--------|--------|
| QTS-01 | Zero `*.spec.ts`/`*.test.ts`; `@nestjs/testing` órfão | 🔴 |
| QTS-02 | `test:system` destrutivo (`prisma migrate reset -f`) + `npx newman` sem newman declarado | 🔴 |
| QTS-03 | Coleção Newman cobre só auth+share (25 req / 34 `pm.test`); sem config/user/logs/system, senha/expiração/cotas/throttle/Range | 🟠 |
| QTS-04 | Sem CI/gates | 🟠 |
| QTS-05 | Credenciais/URL hardcoded (`system2@test.org`, `N44HcHgeuAvfCT`, `API_URL`) | 🟡 |
| QTS-06 | Sem ferramenta de cobertura | 🟡 |
| QTS-07 | `@nestjs/testing` órfão | 🟡 |

## 4. Estratégia e Estrutura Proposta

### 4.1 Backend
- **Unitários** (`backend/test/unit/`): `ConfigService` (tipos/`parseInt`), guards (fail-open SEC-01), `share.service` (validação, transformShare), `file/local.service` (chunks, cotas com `BigInt`), `jobs.service` (limpeza em lote).
- **E2E** (`backend/test/e2e/`, `jest-e2e.json` + `supertest`): boot NestJS real com banco efêmero; `beforeAll` migra, `afterAll` limpa.
- **Scripts sugeridos**:
  ```jsonc
  {
    "test": "jest",
    "test:unit": "jest --config ./test/unit/jest-unit.json",
    "test:e2e": "DATABASE_URL=file:./test-e2e.db jest --config ./test/jest-e2e.json --runInBand",
    "test:coverage": "jest --coverage --coverageThreshold='{\"global\":{\"lines\":60}}'"
  }
  ```

### 4.2 Frontend
- **Unitários** (Vitest): `fileSize.util`, `EditableUpload` (soma de tamanhos com `BigInt`), `auth.service` (decode JWT), componentes puros.
- Smoke de build (`next build`) já cobre erro de compilação.

### 4.3 E2E (Newman reformulado)
- Mover credenciais/URL para env (`API_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`).
- Adicionar testes para: config CRUD, usuários, logs do sistema, expiração de share, senha de share, cotas, throttle (429), download `Range`/206.
- Tornar coleção **não destrutiva** (dados de teste isolados + limpeza).

### 4.4 CI — `.github/workflows/ci.yml`
```yaml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npm run build
      - run: npm run test:unit
      - run: npm run test:e2e
```

## 5. Matriz de Cenários Prioritários (fluxos críticos)

| Fluxo | Cenário | Assert |
|-------|---------|--------|
| Auth | Login admin / bloqueio sem token (fail-closed) | 200 / 401 |
| Upload | Upload em chunks; soma de tamanho respeita cota (BigInt, sem NaN) | 201 / 413 |
| Share | Criar share com senha; link com senha na query string é rejeitado | 201 / 400 |
| Convite | E-mail a destinatário; duplicata não gera notificação (BDB-06) | ok / 1 e-mail |
| Download | Arquivo único; **HTTP Range → 206** | 200 / 206 |
| Expiração | Share expirado é removido pelo cron em lote | vazio |
| Cotas | `shareSizeLimit` ultrapassada → upload negado | 413 |
| Throttle | Requisições acima do limite → 429 | 429 |

## 6. Critérios de Aceitação (Definition of Done)
- `npm run lint` + `build` verdes; `test:unit` e `test:e2e` verdes em CI.
- Cobertura mínima de linhas **60%** (backend) nas áreas críticas.
- `test:system` antigo substituído por versão não destrutiva ou marcado `@skip` até ser reformulado.
- Novas features devem chegar acompanhadas de teste (gate de revisão).

## 7. Conclusões
- O esforço inicial é concentrado (montar Jest+supertest+CI), mas **desbloqueia as refatorações R01–R06 com segurança**. Sem testes, nenhuma das correções estruturais deve ser mergeada.

## 8. Recomendações

1. Implementar **R07** (Fase 12) primeiro: `jest` + `ts-jest` + `supertest` no backend, `vitest` no frontend, banco efêmero `test-e2e.db`, CI com 4 gates (lint/build/unit/e2e).
2. Substituir `test:system` destrutivo por versão não destrutiva; remover `@nestjs/testing` órfão (QTS-07).
3. Externalizar credenciais/URL do Newman para env (QTS-05) e ampliar a coleção para config/user/logs/expiração/cotas/throttle/Range (QTS-03).
4. Adicionar gate de cobertura **≥60%** nas áreas críticas e regra de revisão: feature nova só entra com teste (QTS-06).
5. Usar a matriz de cenários da seção 5 como checklist de regressão a cada release.
