# REFACTORING_PLAN.md — Controle Share Videos v1.0

| Campo | Valor |
|---|---|
| Fase de origem | 12 (Refatoração) → desdobrada em plano executável |
| Data | 2026-08-04 |
| Status | ✅ Plano entregue (execução pendente — pós-auditoria) |

## 1. Introdução

Plano de execução das **8 refatorações priorizadas** (R01–R08, Fase 12) com tarefas, arquivos-alvo, esforço, critérios de aceitação e sequência de dependências. Respeita o processo controlado de implementação (Especificação-final l.174+): commits atômicos, testes antes/depois, sem quebra de API sem versão.

## 2. Metodologia

- Cada R vira um **épico** com tarefas em ordem.
- Pré-requisito global: **R07 (testes + CI)** — nada estrutural antes da rede de segurança.
- Critério de aceitação por item: lint+build+test verdes; mudança de contrato documentada no changelog.
- Esforço em S (médio dia de dev): S, M, L.

## 3. Evidências

- **Fonte consolidada:** `FASE-12-REFATORACAO.md` (75 achados priorizados das Fases 1–11, formato de 10 campos com código atual/sugerido).
- **Localizações-chave (arquivo/linha):** `jwt.guard.ts:36-38` (R02); `schema.prisma:106,21` + `share.service.ts:135,505` + `local.service.ts:92-93,122,128-130,163-164,203,288` + `EditableUpload.tsx:66-72`/`FileList.tsx:68` (R01); `share.service.ts:272-301` (R03); `jobs.service.ts:21-86,170-188` (R04); `config.service.ts:103-115` (R06); `docker-compose.prod.yml:12,56-57,65-66` + `reverse-proxy/Caddyfile.prod` (R08).
- **Critério de inclusão:** todo épico atende aos critérios de aceitação da Especificação-final (resolve problema real, melhora segurança/performance/manutenção, alinhado à doc oficial, não quebra compatibilidade sem versão).

## 4. Épicos e Tarefas

### R07 — Infraestrutura de testes + CI  *(pré-requisito — esforço M)*
1. Declarar `newman` (dev) e `@nestjs/testing` util; instalar `jest`, `ts-jest`, `supertest`, `@types/supertest`.
2. `jest-e2e.json` + banco efêmero `test-e2e.db` (proibido `migrate reset -f`).
3. Unitários iniciais: `ConfigService`, `JwtGuard`, `fileSize` util.
4. E2E não destrutivo do fluxo auth+share mínimo.
5. `.github/workflows/ci.yml` (lint/build/unit/e2e).
6. **Aceite:** CI verde; `test:system` antigo desativado/reescrito; cobertura ≥60% nas áreas críticas.

### R02 — JwtGuard fail-closed  *(segurança — esforço S)*
1. Auditar rotas com `@Public()` (download por e-mail, health).
2. Substituir `catch { return config.get(...) }` por relançar `UnauthorizedException` (`jwt.guard.ts:36-38`).
3. Teste de regressão: token inválido → 401.
4. **Aceite:** rota protegida sem token → 401; rotas públicas continuam 200.

### R01 — `File.size`/`shareSizeLimit` → `BigInt`  *(dados — esforço M/L)*
1. Migration: colunas para `BigInt` com `CAST`/backfill.
2. DTO central: `toBytes` em `share.dto.ts`; remover `parseInt` (`share.service.ts:135,505`; `local.service.ts:122,128-130,203`).
3. Frontend: `FileList.tsx:68` (`+file.size`) e `EditableUpload.tsx:66-72` (soma via `Number`).
4. Testes de cota com valor não numérico (sem `NaN`).
5. **Aceite:** cota respeitada com tamanhos > 2^31; **deploy coordenado**; changelog com breaking note.

### R08 — Correções de deploy Docker/Caddy  *(operação — esforço S/M)*
1. Compose prod: `frontend` → `target: frontend` (runtime).
2. Compose base: `DATABASE_URL` dentro do volume `/opt/app/backend/data`.
3. `reverse-proxy`: injetar `DOMAIN`/`ACME_EMAIL` reais; remover secrets mortos (`jwt_secret`, `smtp_password`) do compose base.
4. `.dockerignore`: excluir `secrets/` e `.env*` (DOP-07).
5. **Aceite:** `docker compose up --build` sobe frontend acessível; Caddy obtém TLS; contexto sem segredos.

### R03 — Paginação nas listagens  *(performance — esforço M)*
1. `Page<T>` envelope + `page`/`perPage` (teto 100) em `getShares`/`getSharesByUser` (`share.service.ts:272-301`).
2. Ajustar controller e frontend para o envelope.
3. `@@index` em `expiration`, `creatorId,uploadLocked,expiration` (BDB-02).
4. **Aceite:** payload limitado; contratos versionados; frontend paginando.

### R04 — Jobs de limpeza em lote + transação  *(disponibilidade — esforço S/M)*
1. `deleteExpiredShares`/`deleteUnfinishedShares`/`deleteUnactivatedUsers` com `take: 50` + `try/catch` por item + `deleteMany` (`jobs.service.ts:21-86,170-188`).
2. **Aceite:** falha de um share não interrompe o lote; logs por falha.

### R06 — Config tipada  *(qualidade — esforço S/M)*
1. `ConfigKeys` union + `getNumber`/`getBoolean`/`getString` (`config.service.ts:103-115`).
2. Migrar consumidores (`local.service.ts:128,143`; `EditableUpload.tsx:37,66`).
3. **Aceite:** sem `any` no `ConfigService`; sem `parseInt` manual.

### R05 — Decomposição do `ShareService`  *(manutenção — esforço L)*
1. Extrair `ShareMapper` (transformShare), `ShareArchiveService` (ZIP), `FileStorageService` (cotas/física).
2. `ShareService` vira orquestração fina; `share.module.ts` re-registra providers.
3. **Aceite:** 772 LOC reduzido; testes de regressão verdes; comportamento inalterado.

## 5. Sequência com dependências

```
R07 → R02 → R01 → R08 → R03 → R04 → R06 → R05
(1)   (2)   (3)   (4)   (5)   (6)   (7)   (8)
```

R07 primeiro; R05 por último (depende da rede de testes). R01 exige deploy coordenado backend+frontend.

## 6. Riscos da Execução
- **R01**: migração de dados + contrato `BigInt` (JSON string) — risco de regressão de UI; mitigado por testes e deploy coordenado.
- **R03**: mudança de shape de resposta (breaking para consumidores da API) — versionar ou manter compat.
- **R05**: refatoração ampla sem testes → alto risco; estritamente após R07.
- **R02**: se alguma rota dependia do fallback anônimo sem `@Public()` — auditar antes.

## 7. Conclusões
- Execução estimada: **~6–8 dias de dev focados** (R07 1–2d, R01 1–1.5d, R05 1.5–2d, demais ≤0.5d).
- Prioridade inegociável: **R07 antes de qualquer refatoração estrutural**; **R02 e R01 são os que mais reduzem risco** (segurança).

## 8. Recomendações

1. Executar na ordem **R07 → R02 → R01 → R08 → R03 → R04 → R06 → R05**, uma alteração por vez (processo controlado da Especificação-final).
2. Aplicar **R02 (fail-closed)** e **R01 (BigInt)** como primeiro lote pós-CI — são os de maior redução de risco e impacto em dados.
3. Para **R01** e **R03**: coordenar deploy backend+frontend e registrar breaking no `CHANGELOG_SUGERIDO.md`.
4. Não iniciar **R05** (split do `ShareService`) sem cobertura de testes (R07) e sem métrica de coesão como gate.
5. Manter atualizados `TECH_DEBT.md` e `CHANGELOG_SUGERIDO.md` a cada épico concluído.
