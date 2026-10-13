# Provisionamento do Host On-Premise — Guia Executável

**Cenário:** servidor físico da organização (GML), domínio próprio a definir, SMTP interno disponível.
**Pré-requisito:** Debian 13 "trixie" (64-bit) instalado, acesso SSH. Ubuntu Server 22.04/24.04 LTS também funciona com os mesmos passos.
**Complemento obrigatório:** `docs/ESPECIFICACAO_SEGURANCA_DOCKER_HOST_v1.0.md` (requisitos formais).

---

## 1. Base do sistema

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg ufw fail2ban git rsync sudo
# Usuário dedicado ao deploy (sem root direto)
sudo adduser deploy && sudo usermod -aG sudo deploy
```

> **Notas específicas do Debian 13 (trixie):**
> - Se o instalador definiu senha de root, o `sudo` pode não vir instalado —
>   por isso ele entra na linha de `apt install` acima.
> - `/tmp` agora é **tmpfs** (limite ~50% da RAM, limpo após ~10 dias): não use
>   `/tmp` para dumps ou arquivos grandes; use os diretórios em `/opt`.
> - `/etc/sysctl.conf` **não é mais lido** pelo systemd-sysctl — parâmetros de
>   kernel locais devem ficar em `/etc/sysctl.d/*.conf`.
> - OpenSSH 10: chaves **DSA não são mais aceitas** — use ed25519 (o passo 5 já usa).

## 2. Docker + Swarm (o compose de produção usa secrets de Swarm)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
# Swarm single-node: habilita `docker secret create`
sudo docker swarm init --advertise-addr <IP-INTERNO-DO-HOST>
```

> O `get.docker.com` registra o repositório oficial
> (`download.docker.com/linux/debian`, suite `trixie` — suportada oficialmente
> pelo Docker Engine) e as atualizações passam a vir via `apt`. Para instalação
> manual do repositório, use o passo 3 do `README.md`.

## 3. Firewall e SSH

```bash
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP -> redirect TLS'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw enable
# SSH: desabilitar senha, manter chave (drop-in tem precedência no Debian 13)
sudo tee /etc/ssh/sshd_config.d/00-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sudo sshd -t && sudo systemctl restart ssh
```

> **Docker × firewall no Debian 13:** o Docker avisa que regras criadas com
> `nft` puro não são suportadas em host com Docker — `ufw` é frontend de
> iptables e continua compatível. Portas **publicadas** pelo Docker não passam
> pelas regras do ufw: exponha apenas 80/443 (Caddy) no compose e, para filtrar
> tráfego de containers, use a chain `DOCKER-USER`.

## 4. Diretórios e secrets do Swarm

```bash
sudo mkdir -p /opt/controle-share-videos-v1.0 /opt/app/backend/data
sudo chown -R deploy:deploy /opt/controle-share-videos-v1.0

# Secrets exigidos por docker-compose.prod.yml (valores do .env.production.local)
printf '%s' "<ADMIN_EMAIL>"     | sudo docker secret create admin_email -
printf '%s' "admin"             | sudo docker secret create admin_username -
printf '%s' "<ADMIN_PASSWORD>"  | sudo docker secret create admin_password -
printf '%s' "<DOMAIN>"          | sudo docker secret create domain -
printf '%s' "<ACME_EMAIL>"      | sudo docker secret create acme_email -
```

> **Domínio ainda indefinido:** enquanto não houver DNS público, o Caddy pode
> emitir certificado *internal CA* (`tls internal`) para hostname local —
> adequado para rede da GML; trocar para Let's Encrypt quando o domínio for
> definido (basta preencher DOMAIN/ACME_EMAIL nos secrets).

## 5. Deploy key (CI → host)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N "" -C "ci-deploy@$(hostname)"
cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/deploy_key   # colar no GitHub Secret DEPLOY_SSH_KEY
```

No GitHub → Settings:
- **Secrets:** `DEPLOY_HOST`, `DEPLOY_USER=deploy`, `DEPLOY_PORT=22`, `DEPLOY_SSH_KEY`
- **Variables:** `DEPLOY_ENABLED=true`

## 6. Backup offsite (obrigatório antes do go-live)

Sem nuvem pública, escolher UMA opção:

| Opção | Como |
|---|---|
| **A. MinIO em segundo servidor/NAS** (compatível S3) | provisionar MinIO → usar `scripts/backup/backup-sqlite.sh` com `S3_BUCKET` apontando lá + criptografia GPG |
| **B. rsync p/ NAS** | cron com `rsync -az --delete` dos volumes + `age`/GPG para cifrar; testar restore mensalmente |

Regra inegociável: **backup em máquina diferente do host de produção**, com teste de restore documentado (Fase 5 do checklist).

## 7. Monitoramento

```bash
docker compose -f docker-compose.monitoring.yml up -d   # Prometheus + Alertmanager
```
Configurar webhook Slack/canal interno em `scripts/monitoring/alertmanager.template.yml`.

## 8. Validação final

1. `bash scripts/staging-validation.sh` contra o host
2. Repetir cenário de limites do pentest (#40) no host
3. Marcar Fases 0–4 do `docs/GOLIVE-CHECKLIST.md` com evidências
