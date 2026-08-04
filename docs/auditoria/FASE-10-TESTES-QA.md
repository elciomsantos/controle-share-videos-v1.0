# FASE 10 — Auditoria de Testes/QA

**Status:** ✅ Concluída
**Data:** 2026-08-04
**Escopo:** Estado de testes (unit, integração, e2e), infraestrutura de CI/gates, cobertura dos fluxos críticos, qualidade das asserções e reprodutibilidade do único plano de teste existente.

---

## 10.1 Resumo Executivo

O projeto tem **zero testes automatizados reais**: o único artefato é uma coleção Newman de sistema (`backend/test/newman-system-tests.json`, 25 requests / 34 asserções) executada por `npm run test:system` — que **apaga o banco com `prisma migrate reset -f`** e chama `npx newman` **sem o `newman` estar declarado em nenhum `package.json`**. Não há testes unitários (o `@nestjs/testing` está instalado mas com **0 arquivos `.spec.ts`**), não há nenhum teste de frontend, não há framework de cobertura e **não há CI/hooks/gates** de qualidade. Em um serviço que gerencia arquivos, credenciais e limites de cota (com histórico de bug `NaN` em `File.size`, ver Fases 2-4), essa superfície de risco é o maior ponto fraco do projeto — espelho direto do QAL-01 (Fase 7).

O que existe, porém, tem mérito: o fluxo e2e cobre auth + criação de share + upload + download/zip com asserções de contrato em pontos-chave, e o `wait-on` orquestra o boot antes do Newman — mais do que a maioria dos forks do Pingvin Share.

## 10.2 Critérios Avaliados

| Critério | Método | Evidência |
|---|---|---|
| Testes unitários/integração | `find` de `*.spec.ts`/`*.test.ts`; deps de teste nos `package.json` | 0 arquivos; `@nestjs/testing` órfão (backend:79) |
| Testes de frontend | frameworks/scripts de teste no `frontend/package.json` | nenhum script, nenhuma dep |
| Testes de sistema/e2e | Inspeção da coleção Newman + script `test:system` | 25 req/34 asserts; `migrate reset -f`; `npx newman` não declarado |
| CI/gates | `.github/`, `.git/hooks`, scripts raiz | zero CI; hooks só samples |
| Cobertura de fluxos críticos | Cruzamento dos controllers existentes vs requests da coleção | `config/user/logs/system` e metade do `auth`/`share` sem teste |
| Qualidade das asserções | Leitura dos `event[].test` da coleção | contrato bom em alguns; `Get Zip` só `200` |

## 10.3 Achados Detalhados

### QTS-01 — Ausência total de testes automatizados em ambos os workspaces 🔴 Alto

- **Onde:** `backend/` (0 `*.spec.ts`), `frontend/` (sem script/dep de teste), `backend/package.json:79` (`@nestjs/testing` instalado, nunca usado).
- **Evidência:** `find backend -name "*.spec.ts" -o -name "*.test.ts"` → **0 ocorrências**; `frontend/package.json` não tem `test`/`vitest`/`jest`/Testing Library; `grep '"jest"' backend/package-lock.json` → 0. O único `@nestjs/testing` presente (backend:79) não é importado por nenhum arquivo.
- **Impacto:** regressões de lógica de negócio (limites de cota, expiração, tokens, acesso a share) passam silenciosamente. Espelha QAL-01 (Fase 7).

### QTS-02 — Único teste de sistema é destrutivo e não reprodutível 🔴 Alto

- **Onde:** `backend/package.json:10` (`test:system`), `backend/test/newman-system-tests.json`.
- **Evidência:** o script roda `prisma migrate reset -f` (apaga o SQLite e reseeda) antes do `nest start`; e chama `npx newman run ...` **sem `newman` em `dependencies`/`devDependencies`** (`ls backend/node_modules/.bin/newman` → ausente) — o `npx` baixa a versão corrente na hora, sem pinagem/`package-lock`.
- **Impacto:** rodar o teste contra o ambiente local **destrói o banco de desenvolvimento** (shares, users, config); o teste não é hermético nem reprodutível (versão do Newman flutuante, depende de rede).

### QTS-03 — Cobertura dos fluxos críticos muito abaixo do necessário 🟠 Médio

- **Onde:** coleção Newman (folders `_setup`, `Auth`, `Create Share`, `Get Share`) vs controllers `app/auth/config/file/logs/share/system/user`.
- **Evidência:** 25 requests; **metade da superfície de API sem nenhum teste**: `config/*`, `user/*`, `logs/*`, `system/*`, e metade do `share`/`auth` — não há teste para **share protegida por senha** (acesso negado), **expiração**, **`uploadLocked`**, **limites de cota/tamanho** (o bug `NaN` de `File.size`, BDB-01/FRN-03, não tem guard), **refresh token / signOut / password reset / ativação de conta**, **throttle/brute-force** (SEC-07/08), **download com Range/seek** (PERF-06) e **zip/thumbnail**. Asserções rasas: `Get Zip` valida apenas `status 200`.
- **Impacto:** os fluxos de segurança/limite (onde o produto é mais sensível) não têm rede de proteção — qualquer regressão passa despercebida até produção.

### QTS-04 — Sem CI nem gates de qualidade 🟠 Médio

- **Onde:** repositório raiz (sem `.github/workflows`, sem `.circleci`/`.gitlab-ci`), `.git/hooks` (apenas `*.sample`).
- **Evidência:** `ls .github/workflows` → não existe; nenhum script raiz de verificação além de `lint`/`format` manuais (`package.json` raiz). QAL-01 já apontava "zero testes + sem CI".
- **Impacto:** `lint`, `build` e testes nunca rodam em push/PR; o erro de lint conhecido (`local.service.ts:357`, Fase 7) e os overrides de segurança (Fase 8) não são bloqueados por nenhum gate.

### QTS-05 — Credenciais e dados hardcoded na coleção Newman 🟡 Baixo

- **Onde:** `backend/test/newman-system-tests.json` — `Sign In` usa `system2@test.org` + senha fixa (`N44HcHgeuAvfCT`); `API_URL=http://localhost:8080/api` como única variável.
- **Evidência:** amostragem direta da coleção. Para rodar em outro host/porta/credenciais é preciso editar o arquivo; dados fixos mascaram regressões de seed e dificultam o uso em CI paralela.
- **Impacto:** baixa portabilidade; risco de "falso verde" se o seed/admin mudar.

### QTS-06 — Sem ferramenta nem métrica de cobertura 🟡 Baixo

- **Onde:** `backend/` e `frontend/` (nenhum `jest.config*`, `vitest.config*`, `nyc`, `c8`).
- **Evidência:** `ls backend/node_modules/.bin | grep -iE 'jest|vitest|nyc|c8|playwright'` → vazio; sem `coverageThreshold`/`lcov` em nenhum lugar.
- **Impacto:** impossível medir tendência de qualidade; decisões de aceite ficam subjetivas.

### QTS-07 — `@nestjs/testing` órfão inflando o lockfile 🔡 Baixo

- **Onde:** `backend/package.json:79` (devDependency), nenhum `import` em `src/`.
- **Evidência:** 0 arquivos de teste (QTS-01) com a dependência presente; adiciona peso/átomos ao `npm audit` (eco de INF-04/Fase 8).
- **Impacto:** dívida de dependências; contradição com a ausência de testes.

## 10.4 Fortalezas (não são achados)

- **Existe um plano de teste de sistema e2e real** (Newman) cobrindo auth, criação de share, upload chunked e download/zip — raro em forks.
- **Asserções de contrato decentes** em pontos críticos: `Complete share` valida shape do payload (`id`, `expiration`, exatamente 4 keys); `Sign In` valida `accessToken`/`refreshToken`.
- **Orquestração do boot** com `wait-on` (`wait-on:8.0.3` declarado) antes do Newman — smoke test real de startup.
- **`@nestjs/testing` + `@nestjs/cli` já instalados**: a infraestrutura para unit tests está a um passo de configuração.
- **Setup local documentado** (README: `docker-compose.local.yml` recria o ambiente do zero) e root `package.json` com `lint`/`format` em ambos os workspaces.

## 10.5 Classificação

| Critério | Nota (0-100) | Justificativa |
|---|---|---|
| Cobertura de testes automatizados | **10** | 0 unit, 0 frontend, 1 e2e destrutivo raso |
| Qualidade/assertividade do e2e existente | **45** | bom em alguns pontos, raso em `Get Zip`/`Get File` |
| Reproducibilidade/segurança do teste | **20** | `migrate reset -f` + `npx newman` sem pin |
| CI/gates de qualidade | **0** | nenhum |
| Instrumentação de cobertura | **0** | nenhuma |
| **Testabilidade (geral)** | **18** | QAL-01 confirmado e agravado: sem unit, sem CI, e2e não seguro |

## 10.6 Recomendações (priorizadas)

1. **Criar suite e2e não-destrutiva e hermética (Alto, desbloqueia CI):** substituir `prisma migrate reset -f` por `prisma db push`/seed em **banco temporário** (SQLite em `os.tmpdir()`/in-memory) e declarar `newman` como devDependency pinada; `API_URL`/credenciais via variáveis da coleção (`{{API_URL}}`, `{{ADMIN_EMAIL}}`...). Nunca rodar contra o banco de dev.
2. **Adicionar unit/integração no backend (Alto):** jest + `@nestjs/testing` + supertest; prioridade aos caminhos de negócio: limites de cota/tamanho (guarda do `NaN` BDB-01), tokens/refresh, acesso a share protegida, jobs de expiração (`jobs.service`). `coverageThreshold` mínimo (ex.: statements 60%).
3. **Adicionar testes de componente no frontend (Médio):** vitest + @testing-library/react para upload, visão da share e auth (não há nenhuma dep — instalar); alvo: componentes de formulário e estado de erro.
4. **Implementar CI (Médio):** GitHub Actions com matrix Node 24, `npm run lint` + `build` + `test` em PR e push, com SQLite temporário; blinda QAL-01 e DOP-07.
5. **Expandir a coleção Newman (Médio):** cobrir refresh/signOut/reset, share com senha (negação), expiração, uploadLocked, limites, Range/seek (PERF-06), zip/thumbnail e `config/user/logs/system`.
6. **Gates locais (Baixo):** hooks `pre-commit` (lint-staged) no repo; remover ou usar `@nestjs/testing` (QTS-07).
7. **Instrumentação (Baixo):** relatório `lcov` + `coverageThreshold` para tendência; documentar metas de QA no README (QTS-06).

## 10.7 Notas de Execução

- Evidências de 2026-08-04: busca de `*.spec.ts`/`*.test.ts`/configs em todo o repo; inspeção dos `package.json` (backend/frontend/scripts/raiz); leitura completa da coleção Newman (estrutura, 25 requests, 34 `pm.test`, vars); verificação de `newman`/`wait-on` no lockfile e binários; ausência de `.github/`, `.gitlab-ci`, hooks.
- **Referências cruzadas:** QTS-01 ↔ QAL-01 (F7) e SEC-02/INF-03 (teste/segurança de deploy); QTS-02 ↔ DOP-03 (perda de dados em recriação); QTS-03 ↔ SEC-05/06/07/08 (F5), PERF-06 (F6), BDB-01/FRN-03 (F4/F3); QTS-04 ↔ QAL-01; QTS-07 ↔ INF-04 (F8).
- **Próxima etapa:** Fase 11 — Auditoria de Documentação (README, docs de deploy, especificações de fases).
