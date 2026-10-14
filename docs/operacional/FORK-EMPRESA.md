# FORK-EMPRESA — Transferência do repositório para a organização da empresa

> Runbook do fork do repositório pessoal (`elciomsantos/controle-share-videos-v1.0`)
> para a organização da empresa no GitHub, **antes do go-live**.
> Tipo de cópia escolhido: **Fork GitHub vinculado** (mantém vínculo com o
> upstream para sincronizar correções futuras via PR).
> Versão do documento: 1.0 · Criado em 2026-10-14

---

## 1. Visão geral e princípios

| Aspecto | Decisão |
|---|---|
| Tipo de cópia | Fork GitHub vinculado (não mirror destacado) |
| Repositório canonical de produção | **A organização da empresa** — deploy e releases saem daqui |
| Papel do repo pessoal (`elciomsantos`) | Upstream de desenvolvimento — sincroniza correções para a empresa via PR |
| CI/CD no fork | 100% dinâmico (`${{ github.repository }}`) — GHCR, cosign e SLSA apontam automaticamente para o repo da empresa |
| Histórico git | Preservado por completo (SHAs idênticos), incluindo allowlists do gitleaks (commit `efc3a63` continua válido) |
| Issues/PRs/Runs | **Não** são copiados — histórico de auditoria fica no repo pessoal; archive se necessário (ver §7) |

**O que é dinâmico (não precisa de ajuste no fork):**

- Nome das imagens GHCR (`ghcr.io/<org>/<repo>/...`) — via `env.IMAGE_NAME: ${{ github.repository }}`
- Assinatura cosign e verificação de identidade (`certificate-identity-regexp` usa `github.repository`)
- SLSA provenance, SBOM, Dependabot (`.github/dependabot.yml` acompanha o fork), CodeQL, gitleaks, hadolint, Trivy — todos config-files rastreados no repo

**O que é literal (precisa do script §5):**

- `repository.url` nos 4 `package.json` (raiz, backend, frontend, scripts)
- `runbook_url` em `scripts/monitoring/alerts.yml` (≈40 alertas)
- URLs de clone em `README.md`, `SECURITY.md` e `docs/operacional/DEPLOY.md`

---

## 2. Pré-requisitos (antes de fazer o fork)

- [ ] CI verde no `main` do repo pessoal (workflows `CI` e `Security Gate`)
- [ ] Working tree limpo e pushed (`git status` vazio)
- [ ] Permissão de **criar repositórios** na organização da empresa (Owner ou `create repo` permitido)
- [ ] Definido o nome do repo na empresa (ex.: `minha-empresa/controle-share-videos-v1.0`)
- [ ] Time de ops com acesso admin ao repo da empresa (para configurar secrets/branch protection)

---

## 3. Executando o fork

### 3.1 Via interface web (recomendado)

1. Acesse `https://github.com/elciomsantos/controle-share-videos-v1.0`
2. **Fork** → Owner: **organização da empresa** → nome: `controle-share-videos-v1.0`
3. Desmarque "Copy the `main` branch only" se quiser manter as branches `fix/*` (opcional)

### 3.2 Via GitHub CLI

```bash
gh repo fork elciomsantos/controle-share-videos-v1.0 \
  --org minha-empresa \
  --clone=false
```

### 3.3 Verificação imediata

```bash
git ls-remote https://github.com/minha-empresa/controle-share-videos-v1.0.git HEAD
# Deve retornar o mesmo SHA do HEAD do repo pessoal
```

---

## 4. Configuração pós-fork no repositório da empresa

> **Importante:** forks nascem com **Actions desabilitadas** e sem secrets.
> Nada roda até concluir esta seção.

### 4.1 Habilitar Actions e permissões

1. **Actions → General → Actions permissions**: "Allow all actions and reusable workflows"
2. **Actions → General → Workflow permissions**:
   - "Read and write permissions" ✅
   - "Send ID tokens to workflows" ✅ — **obrigatório** para assinatura cosign keyless e SLSA provenance (workflows declaram `id-token: write`, mas a política do repo pode bloquear)
3. **Actions tab → "I understand my workflows, go ahead and enable them"** (botão de ativação do fork)

### 4.2 Habilitar Executors de segurança que acompanham o fork

| Configuração | Como |
|---|---|
| Dependabot | Settings → Security → Dependabot (o `.github/dependabot.yml` já cobre os 5 lockfiles + pins de actions) |
| Code scanning (CodeQL) | Settings → Code scanning — já configurado via `.github/codeql/codeql-config.yml`; primeiro run ocorre no primeiro push |
| Secret scanning + push protection | Settings → Advanced Security → ativar ambos |
| Gitleaks (workflow) | Já ativo via `security-gate.yml` — roda no primeiro push (allowlists preservam os SHAs do histórico) |

### 4.3 Secrets e variables de deploy (idênticos ao checklist go-live 2.5/2.6)

**Settings → Secrets and variables → Actions:**

| Nome | Tipo | Uso |
|---|---|---|
| `DEPLOY_HOST` | Secret | Host de produção (SSH) |
| `DEPLOY_USER` | Secret | Usuário deploy no host |
| `DEPLOY_PORT` | Secret | Porta SSH (default 22) |
| `DEPLOY_SSH_KEY` | Secret | Chave privada SSH (deploy key do host) |
| `SLACK_WEBHOOK` | Secret | Notificações de falha do Security Gate — configuração e testes em §4.7 |

**Settings → Secrets and variables → Actions → Variables:**

| Nome | Valor | Efeito |
|---|---|---|
| `DEPLOY_ENABLED` | `true` | Ativa o job `Deploy (produção)` no push em `main` |

> Sem `DEPLOY_ENABLED=true` o job de deploy é **pulado com segurança** —
> o pipeline completa sem tocar no host.

### 4.4 Branch protection em `main`

Settings → Branches → Add branch ruleset (ou classic rule) para `main`:

- [ ] Require status checks: `Backend (lint, build, unit, e2e)`, `Security E2E (§35)`, `Frontend (lint, build, unit)`, `Build Docker Images`, `E2E (Playwright)` + jobs do Security Gate (`Secret Scanning`, `Dependency Audit`, `Static Analysis (SAST)`, `CodeQL Analysis`, `Dockerfile Security Lint`, `Production Readiness Check`)
- [ ] Require a pull request before merging (≥1 aprovação)
- [ ] Block force pushes e deletions

> Os nomes exatos dos checks aparecem após o primeiro run; ajuste o ruleset então.

### 4.5 Primeira execução de validação

```bash
# O workflow CI não tem workflow_dispatch (só push/PR) — dispare via commit vazio:
git commit --allow-empty -m "chore(ci): primeira execução no repo da empresa" && git push
```

Confirme: `gh run list --repo minha-empresa/controle-share-videos-v1.0 --limit 3` → todos ✓.
(O Security Gate aceita dispatch manual — usado no teste controlado do §4.7.)

### 4.6 RC de validação da cadeia de release (sign-artifacts + SLSA)

> Os jobs `Sign Release Artifacts` (GHCR push + assinatura cosign) e
> `Generate SLSA Provenance` **não têm switch** — são acionados pelo evento
> `release: published`. A única forma de testá-los é publicar um release.
> Como a identidade do certificado cosign é **por repositório** (emissor:
> `https://github.com/<org>/<repo>/...`), a validação precisa rodar no repo
> da empresa — um ensaio no repo pessoal valida a mecânica, mas as
> assinaturas/atestações de go-live são as do repo da empresa.

**Pré-requisitos** (causas mais comuns de falha aqui):

- §4.1 ok: "Send ID tokens to workflows" **e** "Read and write permissions"
  (cosign keyless + push para GHCR com `GITHUB_TOKEN`)
- Se a org usar "Allow select actions": permitir `slsa-framework/slsa-github-generator`
  (workflow reutilizável de terceiro usado pelo job `provenance`) — com
  "Allow all actions" (§4.1) já está coberto
- Primeiro push cria os pacotes
  `ghcr.io/minha-empresa/controle-share-videos-v1.0-backend`/`-frontend`
  (visibilidade private por padrão; ajuste em Packages se o host precisar puxar)

**Executar o RC:**

```bash
gh release create v1.0.0-rc.1 \
  --repo minha-empresa/controle-share-videos-v1.0 \
  --target main --prerelease \
  --title "v1.0.0-rc.1 — validação da cadeia de release" \
  --notes "RC de validação; não usar em produção."
```

**Checklist de verificação do run do Security Gate:**

- [ ] `container-scan` e `sbom` verdes (também rodam no evento release)
- [ ] `Sign Release Artifacts` verde → imagens
      `ghcr.io/minha-empresa/controle-share-videos-v1.0-backend|frontend:v1.0.0-rc.1`
      publicadas e assinadas
- [ ] `Generate SLSA Provenance` verde → atestados `*.intoto.jsonl` anexados
      como assets da release (`upload-assets: true`)
- [ ] `Production Readiness Check` verde

**Verificação criptográfica local:**

```bash
cosign verify \
  --certificate-identity-regexp '^https://github.com/minha-empresa/controle-share-videos-v1.0/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/minha-empresa/controle-share-videos-v1.0-backend:v1.0.0-rc.1
```

**Depois da validação:** mantenha o RC como candidato de go-live (evidence para
GOLIVE 0.3) ou remova com `gh release delete v1.0.0-rc.1 --cleanup-tag`.

### 4.7 Notificação de falha (Slack) — configuração e teste

O job `Notify on Failure` roda em **qualquer falha** dos gates e envia via
Slack incoming webhook (corrigido em 2026-10-14: a condição antiga checava
`env.SLACK_WEBHOOK` nunca definida — passo sempre pulado; agora o secret é
promovido a env do job e a action v4 usa os inputs `webhook`/`webhook-type`).

**Configurar:**

1. Crie um Slack app ([api.slack.com/apps](https://api.slack.com/apps)) com o
   scope `incoming-webhook`; instale no workspace e aponte para o canal de ops
2. Salve a URL gerada como secret `SLACK_WEBHOOK` no repo da empresa (§4.3)

**Teste 1 — webhook entrega (rápido):**

```bash
SLACK_WEBHOOK='https://hooks.slack.com/services/...'  # colar a URL real
curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST -H 'Content-Type: application/json' \
  -d '{"text":"✅ teste do webhook de falha do Security Gate (controle-share-videos)"}' \
  "$SLACK_WEBHOOK"
# esperado: 200 + mensagem no canal
```

**Teste 2 — ponta a ponta (controlado, opcional):** crie uma branch
descartável com um **segredo falso evidente** (ex.: `AKIAFAKEFAKEFAKEFAKE00` em
um arquivo novo), publique a branch e dispare o Security Gate nela — o
`secret-scan` falha, o `Notify on Failure` roda e a mensagem deve chegar:

```bash
git checkout -b test/notify-slack
echo 'aws_key = "AKIAFAKEFAKEFAKEFAKE00"  # valor FALSO p/ teste de notificação' > fake-secret.txt
git add fake-secret.txt && git commit -m "test: dispara notify-failure (valor falso)"
git push origin test/notify-slack
gh workflow run "Security Gate" --repo minha-empresa/controle-share-videos-v1.0 \
  --ref test/notify-slack
# confirmar mensagem no Slack; depois:
git push origin --delete test/notify-slack && git checkout main && git branch -D test/notify-slack
```

> ⚠️ Use **somente** valores falsos e óbvios; nunca um segredo real. Se a org
> tiver push protection de secret scanning, o push pode ser bloqueado — nesse
> caso o Teste 1 + a próxima falha legítima de CI servem como validação.
> Qualquer falha real futura do Security Gate também é uma validação natural.

---

## 5. Repontuação das URLs (script único)

Ainda no **clone do repo da empresa**:

```bash
git clone git@github.com:minha-empresa/controle-share-videos-v1.0.git
cd controle-share-videos-v1.0

./scripts/provision/update-repo-urls.sh minha-empresa/controle-share-videos-v1.0
# valida: substitui nos 4 package.json + alerts.yml + README/SECURITY/DEPLOY,
# valida os JSONs e sai com erro se sobrar qualquer referência antiga.

git add -A && git commit -m "chore(repo): repontua URLs para a organização da empresa" && git push
```

O script é **idempotente** (re-executar é seguro) e **fail-closed** (exit 1 se
restar `github.com/elciomsantos/...` em json/yml/md, fora da própria doc do fork).

---

## 6. Host de produção apontando para o repo da empresa

O deploy (`scripts/deploy/deploy-prod.sh`) faz `git fetch origin` no clone do
host — o `origin` deve ser o **repo da empresa**:

```bash
# No host (/opt/controle-share-videos-v1.0):
cd /opt/controle-share-videos-v1.0
git remote set-url origin git@github.com:minha-empresa/controle-share-videos-v1.0.git
git remote add upstream git@github.com:elciomsantos/controle-share-videos-v1.0.git || true
git fetch origin && git status   # deve estar no mesmo SHA do repo da empresa
```

A **deploy key** do host (chave SSH read-only usada pelo `git fetch`) deve estar
cadastrada como Deploy Key no repo da empresa: Settings → Deploy keys → Add
(com acesso read-only).

> Se o host ainda não existe: provisione conforme
> `docs/operacional/HOST-PROVISIONING-ONPREMISE.md`, clonando direto do repo da empresa.

---

## 7. Histórico de auditoria e rastreabilidade

O histórico de issues/PRs/runs fica no repo pessoal. Para o go-live da empresa,
arquive as evidências existentes (o próprio repo já versiona a maioria):

- `docs/auditoria/` — pentests, checklist de segurança, changelog (rastreados ✓)
- `docs/GOLIVE-CHECKLIST.md` — evidências de go-live (rastreado ✓)
- Runs do CI do repo pessoal — exporte os logs relevantes (PDF/log) para
  `docs/auditoria/` antes de archivar o repo pessoal, se aplicável.

---

## 8. Sincronização upstream → empresa (rotina)

O vínculo de fork permite puxar correções do repo pessoal:

```bash
# No clone local, sincronizar via GitHub UI (botão "Sync fork") ou:
git fetch upstream
git checkout main
git merge upstream/main        # ou PR: upstream:main -> empresa:main
# Resolver scripts/provision/update-repo-urls.sh se houver conflito de URL:
./scripts/provision/update-repo-urls.sh minha-empresa/controle-share-videos-v1.0
git push origin main
```

**Regra:** o pipeline de deploy só roda no repo da empresa (`DEPLOY_ENABLED`
lá). Nunca configure `DEPLOY_ENABLED` no repo pessoal — o upstream não deploya.

---

## 9. Ordem final de operação (resumo executável)

1. [ ] §2 — CI verde no repo pessoal
2. [ ] §3 — Fork para a org da empresa
3. [ ] §4.1–4.2 — Actions + permissões + security features habilitadas
4. [ ] §4.5 — Primeiro run verde no repo da empresa
5. [ ] §5 — Script de repontuação + commit + push
6. [ ] §4.3–4.4 — Secrets/variables de deploy + branch protection
7. [ ] §4.6 — RC de validação da cadeia de release (`v1.0.0-rc.1`): sign-artifacts + SLSA verdes e `cosign verify` OK
8. [ ] §4.7 — Slack `SLACK_WEBHOOK` configurado e teste de entrega (curl ≥ teste 1)
9. [ ] §6 — Host de produção apontando para o repo da empresa (+ deploy key)
10. [ ] Prosseguir com o `docs/GOLIVE-CHECKLIST.md` a partir da Fase 1
    (a Fase 0 passa a referenciar o **repo da empresa**: CI verde, RC validado,
    tag de release final e imagem no GHCR da org, com SLSA/cosign)

---

## 10. Rollback da transferência (se algo der errado)

| Situação | Ação |
|---|---|
| Fork criado no lugar errado | Delete o fork (não há estado no host ainda) e refaça o §3 |
| CI da empresa vermelho por permissão | Revisar §4.1 (ID tokens / write permissions) — causa mais comum |
| Deploy apontou para o repo errado | `git remote set-url origin ...` no host (§6) — o deploy-prod.sh usa o `TARGET_REF` enviado pelo workflow, o clone apenas resolve o ref via origin |
| Precisar voltar ao repo pessoal como canonical | Rode `update-repo-urls.sh elciomsantos/controle-share-videos-v1.0` no clone e reaponte o host — o script aceita qualquer destino |

---

**Documentos relacionados:** `docs/GOLIVE-CHECKLIST.md` (go-live completo) ·
`docs/operacional/DEPLOY.md` (implantação) ·
`docs/operacional/HOST-PROVISIONING-ONPREMISE.md` (provisionamento do host) ·
`scripts/provision/update-repo-urls.sh` (repontuação de URLs)
