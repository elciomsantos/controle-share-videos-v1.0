# CI/CD — Pipeline de Integração e Deploy Automático

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/ci.yml` |
| Script de deploy | `scripts/deploy/deploy-prod.sh` |
| Estratégia | SSH direto do GitHub Actions para o host de produção |
| Gatilho | Push em `main` com CI verde (backend + frontend) |
| Status | 🔵 Pronto para ativação (requer secrets + setup one-time no host) |

## 1. Visão geral

O pipeline tem dois estágios no mesmo workflow:

1. **CI** (jobs `backend` + `frontend`): lint → build → unit → coverage → e2e. Roda em
   PRs e pushes.
2. **CD** (job `deploy`): só executa em push para `main`, **depois** que `backend` e
   `frontend` passaram (`needs: [backend, frontend]`). Conecta via SSH ao host,
   envia o script de deploy por stdin e o executa com `TARGET_REF=$GITHUB_SHA`.

```
push main ──► CI backend ──► CI frontend ──► (verdes) ──► CD deploy (SSH) ──► host
                                                                  │
                                              backup → fetch → checkout → build → up -d
                                                                    │
                                                              healthcheck OK? ──► fim
                                                                    │ não
                                                                    ▼
                                                              rollback p/ ref anterior
```

## 2. O que o deploy faz no host (`deploy-prod.sh`)

1. **Backup pré-deploy** (opcional, `RUN_BACKUP=1`) via `scripts/backup.sh` — fail-closed
   quando `NODE_ENV=production` e `GPG_RECIPIENT` ausente: sem backup criptografado, o
   deploy **aborta**.
2. `git fetch --prune origin` e resolução do ref alvo (`TARGET_REF`).
3. `git checkout --detach <commit>` — deploy imutável pelo SHA exato que passou no CI.
4. `docker compose -f docker-compose.prod.yml build`.
5. `docker compose -f docker-compose.prod.yml up -d --remove-orphans`.
6. **Healthcheck** do container backend (até `healthy`, retries 60 × 5s).
7. **Rollback automático** para o ref anterior em falha de build/up/healthcheck.

Códigos de saída: `0` sucesso, `1` falha sem rollback, `2` rollback executado.

## 3. Secrets necessários no GitHub (Settings → Secrets and variables → Actions)

| Secret | Descrição |
|---|---|
| `DEPLOY_HOST` | IP ou hostname do host de produção (ex: `192.168.0.10`) |
| `DEPLOY_USER` | Usuário SSH do deploy no host (ex: `deploy`) |
| `DEPLOY_PORT` | Porta SSH (default `22`; omitir se padrão) |
| `DEPLOY_SSH_KEY` | **Chave privada** SSH do deploy (conteúdo completo do `id_ed25519`) |

> `DEPLOY_SSH_KEY` deve ser uma **deploy key dedicada**, não a chave pessoal do
> operador. Use um par de chaves exclusivo do pipeline (ver §4.1).

## 4. Setup one-time no host de produção

### 4.1 Criar usuário e chave de deploy

```bash
# No host (como root):
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy          # para executar docker compose
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh

# Gerar um PAR DE CHAVES EXCLUSIVO para o pipeline (na sua máquina):
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_ed25519 -N ""

# Copiar a CHAVE PÚBLICA para o host:
ssh-copy-id -i ~/.ssh/deploy_ed25519.pub deploy@<host>

# No GitHub, adicionar o conteúdo de ~/.ssh/deploy_ed25519 (privada)
# como secret DEPLOY_SSH_KEY.
```

### 4.2 Provisionar o repo e os pré-requisitos do compose prod

```bash
# Como deploy no host:
sudo mkdir -p /opt/controle-share-videos-v1.0
sudo chown deploy:deploy /opt/controle-share-videos-v1.0
cd /opt/controle-share-videos-v1.0
git clone <repo-url> .

# Volumes/bind mounts de dados (RAID6) — chown 1002:1002 conforme o plano:
sudo mkdir -p /srv/controle-share-videos/data/{images,uploads}
sudo chown -R 1002:1002 /srv/controle-share-videos/data

# Docker secrets externos (admin_*, smtp_password, acme_email, domain, jwt_secret):
# ver docker-compose.prod.yml (seção secrets) e docs/PLANO-IMPLANTACAO.md.
```

### 4.3 Permissão para o usuário `deploy` rodar o `git fetch`

O repo clonado deve pertencer ao usuário `deploy` (ou o usuário precisa permissão de
escrita em `.git`). Com o clone feito por `deploy` (passo acima), isso já é satisfeito.

### 4.4 Backup habilitado (recomendado)

O job define `RUN_BACKUP=1`. Para o deploy não abortar, configure o backup criptografado:

```bash
# No host, criar /etc/environment ou no perfil do usuário deploy:
#   GPG_RECIPIENT=<key-id-or-email>
#   BACKUP_DIR=/opt/app/backups
#   NODE_ENV=production
```

Ver `scripts/backup.sh` (fail-closed) para os pré-requisitos GPG.

## 5. Fluxo de ativação

1. Configurar os secrets §3 no GitHub.
2. Executar o setup one-time §4 no host.
3. Push em `main` → CI roda → job `deploy` executa o pipeline.
4. Acompanhar em **Actions → CI → job Deploy (produção)**.

## 6. Operações manuais de apoio

| Operação | Comando |
|---|---|
| Rollback manual para tag | `TARGET_REF=v1.3.0 APP_DIR=... ./scripts/deploy/deploy-prod.sh` no host |
| Deploy de tag específica | `TARGET_REF=<tag> RUN_BACKUP=1 ./scripts/deploy/deploy-prod.sh` |
| Ver logs dos serviços | `docker compose -f docker-compose.prod.yml logs -f` |
| Status dos serviços | `docker compose -f docker-compose.prod.yml ps` |

## 7. Segurança e boas práticas

- **`StrictHostKeyChecking=no` + `UserKnownHostsFile=/dev/null`** no job: necessário para
  não depender de known_hosts pré-populado no runner efêmero. Mitigação: o GitHub Actions
  valida o fluxo por completo antes do merge e o host/credenciais ficam sob secrets;
  recomenda-se fixar a impressão digital do host (`HostKeyAlias`/`known_hosts`) quando o
  deploy passar a usar um runner self-hosted.
- A chave privada (`DEPLOY_SSH_KEY`) nunca é impressa nos logs (só gravada em
  `~/.ssh/deploy_key` com `chmod 600`).
- O script de deploy é enviado por stdin **do próprio ref**, eliminando código divergente
  pré-existente no host.
- Rollback automático limita a janela de indisponibilidade a falhas de build/healthcheck.
- `concurrency: cancel-in-progress: false` impede dois deploys simultâneos na produção.

## 8. Pendências/limitações

- **Sem GitHub Pro (repo privado free)**: não há branch protection/rulesets obrigatórios.
  O gate "só deploy após CI verde" é garantido por `needs: [backend, frontend]` no próprio
  workflow — independente de ruleset.
- **Multi-instância**: o pipeline é single-host. Para múltiplos hosts ou Docker Swarm,
  evoluir para registry (GHCR) + `docker compose pull` (ver ROADMAP, longo prazo).
- **Node-exporter/monitoring**: segue fora do escopo deste pipeline (compose separado).

## 9. Evidências

- Workflow: `.github/workflows/ci.yml` (job `deploy`, linhas 74-113).
- Script: `scripts/deploy/deploy-prod.sh` (130 LOC).
- Fontes: `ROADMAP.md` §6 (CI/CD), `CHANGELOG_SUGERIDO.md` §8 (Itens Adiados),
  `PLANO-IMPLANTACAO.md` §2 (modelo de deploy single-host).
