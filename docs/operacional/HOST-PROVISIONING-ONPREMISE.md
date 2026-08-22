# Provisionamento do Host On-Premise — Guia Executável

**Cenário:** servidor físico da organização (GML), domínio próprio a definir, SMTP interno disponível.
**Pré-requisito:** Ubuntu Server 22.04/24.04 LTS (ou Debian 12) instalado, acesso SSH.
**Complemento obrigatório:** `docs/ESPECIFICACAO_SEGURANCA_DOCKER_HOST_v1.0.md` (requisitos formais).

---

## 1. Base do sistema

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg ufw fail2ban git rsync
# Usuário dedicado ao deploy (sem root direto)
sudo adduser deploy && sudo usermod -aG sudo deploy
```

## 2. Docker + Swarm (o compose de produção usa secrets de Swarm)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
# Swarm single-node: habilita `docker secret create`
sudo docker swarm init --advertise-addr <IP-INTERNO-DO-HOST>
```

## 3. Firewall e SSH

```bash
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP -> redirect TLS'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw enable
# SSH: desabilitar senha, manter chave
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

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
