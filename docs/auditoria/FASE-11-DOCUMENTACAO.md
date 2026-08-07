# FASE 11 — Auditoria de Documentação

**Status:** ✅ Concluída
**Data:** 2026-08-04
**Escopo:** README (raiz/backend/frontend), SECURITY.md, `docs/` (Visão, implantação, padronização, auditoria), exemplos de ambiente (`.env.local.example`), metadados de licença/atribuição e consistência das referências.

---

## 11.1 Resumo Executivo

O corpo documental **existente** é de boa qualidade: `docs/Visao-geral.md` (33 KB de arquitetura + RBAC + fluxos), `docs/PLANO-IMPLANTACAO.md` (10 divergências críticas com plano de ação) e `docs/auditoria/Especificacao-final.md` (processo maduro de auditoria com formato obrigatório de recomendação de 9 campos). O problema está na **consistência e no ciclo de vida**: um grande corpus documental (programa de "Padronização — 11 temas", guia de implantação, análises, EVOLUCAO) foi **removido do repositório** (visível no histórico git), mas o README e o código continuam referenciando esses arquivos — **20 referências quebradas**, incluindo `docs/Padronizacao-07-clamav.md`, citado em `share.service.ts:246` como a "decisão formal" de remoção do ClamAV (documento inexistente, já apontado na Fase 5/SEC-02). Há ainda **conflito de status** da decisão ClamAV entre README ("Decidido"), `Visao-geral.md` ("Rejeitado") e o código ("removed per formal decision"), e um **`SECURITY.md` vazio** — inadequado para um serviço com achados de segurança relevantes (Fases 5, 8 e 10).

**Causa raiz:** os commits `22a0c2f`/`912f838` reescreveram as guias e os commits posteriores (`3271756`/`5415662`) removeram arquivos sem atualizar os vínculos — o README descreve um estado documental que não existe mais.

## 11.2 Critérios Avaliados

| Critério | Método | Evidência |
|---|---|---|
| Existência vs referência | Caminhos citados no README/código × `find` real | 20 de 24 refs quebradas; `git log --diff-filter=D` |
| Qualidade do corpus existente | Leitura de `Visao-geral`, `PLANO-IMPLANTACAO`, `conf-dominio`, `auditoria-final`, `Especificacao-final` | Estruturas completas, seções numeradas |
| Consistência de decisões entre fontes | Cruzamento README ↔ Visao-geral ↔ código (ClamAV) | 3 status conflitantes para o mesmo tema |
| Segurança da documentação | `SECURITY.md`, canal de disclosure | Stub vazio (74 bytes) |
| Compliance/atribuição | `package.json` (`license`, `repository`), `LICENSE`, atribuição upstream | Sem metadados; sem NOTICE de upstream |
| Usabilidade operacional | `.env.local.example` vs envs reais lidas pelo código | Exemplo cobre 1 de ~8 envs |

## 11.3 Achados Detalhados

### DOC-01 — ~20 referências de documentação quebradas no README (corpus removido do git) 🔴 Alto

- **Onde:** `README.md:18,80,139-169`; arquivos citados em `docs/Implantacao/*` e `docs/*.md`.
- **Evidência:** dos 20 caminhos citados no README, **18 não existem em lugar nenhum** do repo e **2 existem em caminho divergente** (`docs/PLANO-IMPLANTACAO.md` e `docs/conf-dominio.md` — linkados como `docs/Implantacao/...`, pasta inexistente). `git log --all --diff-filter=D` confirma a remoção: `docs/Padronizacao.md`, `docs/Padronizacao-02..11-*.md`, `docs/Implantacao/Implantacao.md`, `docs/Analise-sistema.md`, `docs/Analise-melhoria-implantacao.md`, `docs/Achados-pos-evolucao.md`, `docs/Pre-producao.md`, `docs/Auditoria-pre-producao.md`, `docs/EVOLUCAO.md`. O working tree ainda tem `D docs/Implantacao.md` (deletado, não commitado).
- **Impacto:** o "programa de padronização (11 temas)" e o "guia completo de implantação" — apresentados como artefatos centrais do projeto — **não são recuperáveis pelo leitor**; links quebrados no GitHub (404) corroem a confiança e escondem decisões de arquitetura documentadas (SEC-02 já mostrara `Padronizacao-07` inexistente).

### DOC-02 — `SECURITY.md` é um stub vazio 🔴 Alto (informativo)

- **Onde:** `SECURITY.md` (74 bytes).
- **Evidência:** as seções "Supported Versions" e "Reporting a Vulnerability" estão em branco. Para um serviço com 8 achados de segurança na Fase 5, 2 vulnerabilidades ativas na Fase 8 (INF-01) e 7 achados de QA/segurança na Fase 10, **não há canal documentado de disclosure** nem política de versões suportadas.
- **Impacto:** vulnerabilidades reportadas por terceiros não têm caminho oficial; o repositório não sinaliza quais versões recebem correção.

### DOC-03 — Decisão ClamAV conflitante entre README, `Visao-geral` e código 🟠 Médio — ✅ Resolvido (2026-08-07)

- **Onde:** `README.md:38,149` ("Decidido — código pendente", na época), `docs/Visao-geral.md:9` ("**Rejeitado** — fora de escopo, sem código"), `backend/src/share/share.service.ts:246` ("ClamAV scan removed per formal decision docs/Padronizacao-07-clamav.md").
- **Evidência:** três fontes afirmavam status diferentes para o mesmo tema, e o documento que "formalizaria" a decisão **existia** mas não fora cruzado pela auditoria (`docs/Padronizacao-07-clamav.md`, 26/07/2026 — **Rejeitado**). A Fase 5 (SEC-02) já registrara a divergência; ela persiste.
- **Impacto:** a ausência de varredura antivírus é **apresentada como recurso do produto** no README e ao mesmo tempo **rejeitada** na visão arquitetural — o operador não sabe se deve contar com a proteção (eco de DOP-02/Fase 9).
- **Resolução:** a decisão formal existe e **rejeita** a integração. O módulo `backend/src/clamscan/`, a dependência `clamscan` e o daemon dos compose files foram removidos (fecha SEC-02/QAL-02/INF-03/DOP-02). **README já limpo:** `grep -rn "ClamAV|clamscan|antivírus"` no README não retorna ocorrências — os relatos "Decidido — código pendente" foram retirados, alinhando README ↔ `Visao-geral.md` ↔ `Padronizacao-07-clamav.md`. DOC-03 **fechado**.

### DOC-04 — Ausência de metadados de licença/repositório e atribuição de upstream 🟡 Baixo

- **Onde:** `package.json` (raiz/backend/frontend/scripts — nenhum campo `license`/`repository`), `LICENSE` (BSD-2-Clause, © elciomsantos 2026).
- **Evidência:** `grep -rn '"license"'` → nenhum resultado. O README declara "Fork independente do Pingvin Share X v1.21.1", mas não há `NOTICE`/atribuição nos `package.json` nem menção de licença no README. O upstream (Pingvin Share X) é distribuído como BSD-2-Clause (fonte: AlternativeTo); ainda assim, a cadeia (fork de fork) merece verificação de conformidade.
- **Impacto:** impossível publicar em registry npm sem corrigir; rastreabilidade de origem do fork inexistente; risco residual de conformidade legal não gerenciado.

### DOC-05 — `.env.local.example` não documenta as variáveis reais de ambiente 🟡 Baixo

- **Onde:** `.env.local.example` (240 bytes: apenas `ADMIN_PASSWORD` + comentários opcionais), `backend/src/main.ts:204`, `docker-compose*.yml`.
- **Evidência:** o backend lê `BACKEND_PORT`/`PORT`, `DATABASE_URL`, `TRUST_PROXY` (PLANO-IMPLANTACAO §D), e o prod usa `ADMIN_EMAIL`, `ADMIN_USERNAME`, `DOMAIN`, `ACME_EMAIL` e a convenção `*_FILE` (`user.seed.ts:17`). O exemplo documenta **1** delas.
- **Impacto:** onboarding/operação exige ler código e compose para descobrir o restante — exatamente o tipo de fricção que DOC-01 demonstra se repetir.

## 11.4 Fortalezas (não são achados)

- **`docs/Visao-geral.md` (33 KB)** — arquitetura completa e bem estruturada: objetivo, escopo/fora de escopo, público-alvo por papel (admin/operador/auditor), fluxos (upload, compartilhamento, crons, auditoria).
- **`docs/PLANO-IMPLANTACAO.md`** — maturidade rara: 10 divergências críticas entre plano e código (A–J), ordem de execução e "pontos em aberto" explícitos.
- **`docs/auditoria/Especificacao-final.md` + `docs/auditoria-final.md`** — processo formal: fases, formato obrigatório de recomendação (9 campos), critérios de aceitação, artefatos finais.
- **`docs/conf-dominio.md`** — guia prático No-IP/TLS.
- **README raiz organizado** (funcionalidades detalhadas, setup Docker/manual, variantes de compose, seção de testes honesta).
- **`.env.local.example` existe** e instrui a geração da senha com `openssl rand -base64 32`.
- **LICENSE presente** (BSD-2-Clause) no primeiro commit.

## 11.5 Classificação

| Critério | Nota (0-100) | Justificativa |
|---|---|---|
| Qualidade do corpus existente | **72** | Visão, implantação e especificação de auditoria sólidas |
| Existência/cobertura | **55** | 4 docs reais; ~16 do corpus "anunciado" ausentes |
| Consistência de referências/links | **25** | 20 refs quebradas no README + código citando doc inexistente |
| Segurança da documentação | **30** | SECURITY.md vazio |
| Compliance/atribuição | **50** | LICENSE ok; metadados e NOTICE ausentes |
| **Documentação (geral)** | **40** | Bom conteúdo, péssima manutenção dos vínculos |

## 11.6 Recomendações (priorizadas)

1. **Re-sincronizar o README com o corpus real (Alto):** ou restaurar do histórico git (`git show <commit>:` das guias de padronização/implantacao — commits `912f838`/`22a0c2f`) os docs ainda relevantes, ou reescrever a seção "Documentação" para listar apenas os arquivos existentes (`docs/Visao-geral.md`, `docs/PLANO-IMPLANTACAO.md`, `docs/conf-dominio.md`, `docs/auditoria/*`); corrigir os paths `docs/Implantacao/*` → raiz de `docs/`. Manter a lista verificada por um script simples (`for f in $(grep -oP 'docs/[A-Za-z0-9_./-]+\.md' README.md)`).
2. **Preencher `SECURITY.md` (Alto):** versões suportadas, e-mail/chave privada de security disclosure e política de correção — fecha DOC-02 e dá canal aos achados das Fases 5/8/10.
3. ~~**Resolver a decisão ClamAV (Médio)**~~ ✅ **Concluído (2026-08-07):** a decisão formal `docs/Padronizacao-07-clamav.md` (26/07/2026) é **"Rejeitado — removido"**, alinhada a `Visao-geral` e `share.service.ts`; módulo, dep e daemon removidos; README já sem menções ao ClamAV. Fecha DOC-03, SEC-02 (F5), QAL-02 (F7) e DOP-02 (F9).
4. **Adicionar metadata de licença/atribuição (Baixo):** `"license": "BSD-2-Clause"` + `"repository"` nos 4 `package.json`; `NOTICE` no README creditando Pingvin Share X v1.21.1; verificar conformidade da cadeia de licenciamento.
5. **Documentar as variáveis de ambiente (Baixo):** expandir `.env.local.example` (DATABASE_URL, BACKEND_PORT, TRUST_PROXY) e criar `.env.example`/seção no README cobrindo o modelo prod (`DOMAIN`, `ACME_EMAIL`, `ADMIN_*`, `*_FILE`).

## 11.7 Notas de Execução

- Evidências de 2026-08-04: varredura de todos os `.md` do repo (17 arquivos em `docs/` + `SECURITY.md`); comparação automática dos 24 caminhos citados no README vs existência real (20 quebrados, 2 por path errado); `git log --all --diff-filter=D` e `git status` (deleção não commitada de `docs/Implantacao.md`); leitura de `Visao-geral`, `PLANO-IMPLANTACAO`, `conf-dominio`, `auditoria-final` e `Especificacao-final`; verificação do status ClamAV em README/Visao-geral/`share.service.ts:246`; verificação de upstream (Pingvin Share X, BSD-2-Clause) via busca externa.
- **Referências cruzadas:** DOC-01 ↔ SEC-02 (F5, `Padronizacao-07` inexistente); DOC-03 ↔ SEC-02 (F5), QAL-02 (F7), INF-03 (F8), DOP-02 (F9); DOC-02 ↔ F5/F8/F10 (volume de achados de segurança sem canal de disclosure); DOC-04 ↔ INF-04 (F8, metadados de dependências).
- **Próxima etapa:** Fase 12 — Refatoração (proposta de correções priorizadas das Fases 1–11, sem aplicar código).
