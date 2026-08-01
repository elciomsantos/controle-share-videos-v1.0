# Guia de Implantação em Produção

## Controle Share Videos v1.0

Este documento descreve a configuração recomendada para executar o
sistema **Controle Share Videos v1.0** em produção utilizando:

- Ubuntu Server 22.04/24.04 LTS como sistema operacional do host
- Docker Engine + Docker Compose v2
- 3 containers Docker isolados em rede bridge: `backend` (NestJS :8080),
  `frontend` (Next.js standalone :3333), `caddy` (Caddy 2.9 :80/443)
- SQLite3 via Prisma para usuários, compartilhamentos, tokens, configs e logs
- Segundo disco (RAID6 14 TB) em `/srv/controle-share-videos` para dados persistentes
- Domínio grátis No-IP (`seusistema.ddns.net`) com IP fixo — sem DUC
- Reverse proxy externo **Caddy** (não Nginx) com TLS automático Let's Encrypt
- Samba autenticado (usuário `uploader`) para upload de vídeos via LAN

---

## 1. Visão geral & arquitetura

```text
Internet/LAN
      │
      ▼
┌──────────────────────────────────────────────┐
│ ROTEADOR — port forwarding 80/443 → 192.168.x.y │
└──────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────┐
│ DISCO 1 (SSD/HD) — SISTEMA                    │
│ Ubuntu Server + Docker Engine                  │
│ /opt/controle-share-videos-v1.0/  ← git clone │
│                                                 │
│ docker-compose.prod.yml                        │
│   ├─ backend  (NestJS :8080)                   │
│   ├─ frontend (Next.js :3333)                  │
│   └─ caddy    (Caddy 2.9 :80/443)              │
│       │ TLS + headers + rate limit             │
│       ▼                                        │
│   rede app-network (bridge, internal: false)   │
└──────────────────────────────────────────────┘
      │ bind mounts (não volumes nomeados)
      ▼
┌──────────────────────────────────────────────┐
│ DISCO 2 (RAID6 14 TB) — /srv/                 │
│ /srv/controle-share-videos/                    │
│   ├─ data/                                     │
│   │   ├─ controle-videos.db        ← SQLite    │
│   │   ├─ images/                 ← frontend    │
│   │   └─ uploads/                                           │
│   │       ├─ _temp/              ← limpeza diária cron      │
│   │       └─ shares/             ← Samba [videos] + container │
│   ├─ backups/                                  │
│   │   ├─ sqlite/                               │
│   │   ├─ uploads/                              │
│   │   └─ images/                               │
│   └─ monitoring/ (opcional)                    │
│       ├─ prometheus/                           │
│       ├─ grafana/                              │
│       └─ loki/                                 │
└──────────────────────────────────────────────┘
```

**Princípio fundamental**: código e containers são descartáveis; dados
(`/srv/controle-share-videos/data/`) sobrevivem a rebuilds, updates,
rollbacks e recriação total dos containers.

---

## 2. Layout dos diretórios

```
/opt/controle-share-videos-v1.0/           ← código (git clone)
├── Dockerfile
├── docker-compose.prod.yml
├── reverse-proxy/
│   └── Caddyfile.prod
├── scripts/
│   ├── backup.sh
│   ├── verify-db.sh
│   ├── maintenance/
│   │   └── cleanup-temp.sh
│   ├── provision/
│   │   ├── hardening.sh
│   │   ├── samba.sh
│   │   └── grafana-secret.sh
│   └── docker/
│       ├── create-user.sh
│       └── entrypoint.sh
└── ...

/srv/controle-share-videos/                ← RAID6 (dados)
├── data/
│   ├── controle-videos.db
│   ├── images/
│   └── uploads/
│       ├── _temp/
│       └── shares/
├── backups/
│   ├── sqlite/
│   ├── uploads/
│   └── images/
└── monitoring/ (opcional)
    ├── prometheus/
    ├── grafana/
    └── loki/

/etc/samba/smb.conf                        ← share [videos]
```

---

## 3. Pré-requisitos

| Item | Especificação |
|------|---------------|
| SO Host | Ubuntu Server 22.04/24.04 LTS (64-bit) |
| Docker | Docker Engine 25+ + Compose v2 (`docker compose`) |
| Disco 2 | RAID6 montado, 14 TB, ext4/xfs |
| IP | IP fixo público no roteador (não DHCP) |
| Domínio | Conta No-IP (grátis) + hostname `seusistema.ddns.net` |
| Portas roteador | 80, 443 → IP local do servidor |
| Usuário host | `uploader` (UID 1102) para Samba |
| Usuário container | `controle-user` (UID/GID 1002) |
| GPG | Chave pública para criptografia de backup (`GPG_RECIPIENT`) |
| Git | Repositório clonado em `/opt/controle-share-videos-v1.0` |

---

## 4. Preparação do Ubuntu (discos, fstab, RAID6)

```bash
# 1) Identificar o disco do RAID6
lsblk -f
sudo blkid
# Anotar UUID, ex: 1234-5678-ABCD-EF00

# 2) Criar ponto de montagem
sudo mkdir -p /srv/controle-share-videos

# 3) /etc/fstab por UUID com nofail (não travar boot se RAID ausente)
echo "UUID=1234-5678-ABCD-EF00  /srv/controle-share-videos  ext4  defaults,nofail  0  2" \
  | sudo tee -a /etc/fstab

# 4) Montar e validar
sudo mount -a
df -h /srv/controle-share-videos
# Deve mostrar o RAID6 14 TB montado em /srv/controle-share-videos
```

---

## 5. Instalação do Docker + perfis de segurança

```bash
# Docker Engine + Compose v2
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker   # ou logout/login

# Verificar
docker compose version
# Docker Compose version v2.x.x

# Hardening do host (UFW, fail2ban, SSH)
sudo bash /opt/controle-share-videos-v1.0/scripts/provision/hardening.sh
```

O `hardening.sh`:
- UFW: `deny incoming`, `allow 22/80/443`, `limit 22`, `deny 445` + `allow from RFC1918 to 445`
- fail2ban: jails `sshd` (3 tentativas/24h), `caddy` (20/1h), `samba` (5/1h)
- SSH: root login não, password auth não, key-only, timeouts

---

## 6. Clone do projeto em /opt

```bash
cd /opt
sudo git clone https://github.com/seu-usuario/controle-share-videos-v1.0.git
sudo chown -R $USER:$USER controle-share-videos-v1.0
cd controle-share-videos-v1.0

# Em produção, travar numa tag de release (não main direto):
git fetch --tags
git checkout v1.2.3    # substitua pela tag desejada
```

> **Recomendação**: use tags Git para releases (`v1.2.3`, `v1.2.4`...). O branch `main` recebe desenvolvimento contínuo.

---

## 7. Criação dos Docker secrets

Todos os secrets são **externos** (criados no host, não no compose). O compose declara `external: true`.

```bash
# 1) Admin bootstrap (lidos pelo seed no primeiro boot)
echo "admin@empresa.local" | docker secret create admin_email -
echo "admin"               | docker secret create admin_username -
openssl rand -base64 32   | docker secret create admin_password -

# 2) SMTP (opcional — se não usar e-mail, crie secret vazio)
echo "smtp-password-real"  | docker secret create smtp_password -
# ou: echo "" | docker secret create smtp_password -

# 3) Let's Encrypt / Caddy
echo "seu-email@empresa.local" | docker secret create acme_email -
echo "seusistema.ddns.net"     | docker secret create domain -
```

Verificar:
```bash
docker secret ls
# Deve listar: admin_email, admin_username, admin_password, smtp_password, acme_email, domain
```

> **Nota**: o `internal.jwtSecret` **não** é Docker secret — é gerado pelo seed (`crypto.randomBytes(256)`), armazenado na tabela `Config` com `locked=true`, e nunca sai do banco.

---

## 8. Configuração do domínio No-IP

Ver seção dedicada: **`docs/Implantacao/conf-dominio.md`**

Resumo rápido:
1. Criar hostname `seusistema.ddns.net` no painel No-IP (A record → IP fixo)
2. Port forwarding 80/443 no roteador → IP local do servidor
3. Secrets `domain=seusistema.ddns.net` e `acme_email=seu@email` criados
4. Caddy provisiona TLS automaticamente via `Caddyfile.prod`
5. **Passo crítico**: definir `general.appUrl = https://seusistema.ddns.net` no banco (via UI Admin ou SQL)
6. Confirmar hostname No-IP a cada 30 dias (e-mail automático)

---

## 9. Criação dos diretórios no RAID6 + cópia dos dados existentes

```bash
# Estrutura base
sudo mkdir -p /srv/controle-share-videos/data/{images,uploads/_temp,uploads/shares}
sudo mkdir -p /srv/controle-share-videos/backups/{sqlite,uploads,images}
sudo mkdir -p /srv/controle-share-videos/monitoring/{prometheus,grafana,loki}

# Permissões base (container user = 1002:1002)
sudo chown -R 1002:1002 /srv/controle-share-videos/data
sudo chown -R 1002:1002 /srv/controle-share-videos/backups
sudo chown -R 1002:1002 /srv/controle-share-videos/monitoring

# setgid em uploads/shares para que arquivos criados via Samba
# herdem GID 1002 (container lê/escreve)
sudo chmod 2775 /srv/controle-share-videos/data/uploads/shares
sudo find /srv/controle-share-videos/data/uploads/shares -type d -exec chmod 2775 {} +

# Copiar dados atuais do repo (se houver) para o RAID6
sudo cp -a /opt/controle-share-videos-v1.0/data/controle-videos.db \
      /srv/controle-share-videos/data/
sudo cp -a /opt/controle-share-videos-v1.0/data/images/. \
      /srv/controle-share-videos/data/images/
sudo cp -a /opt/controle-share-videos-v1.0/data/uploads/. \
      /srv/controle-share-videos/data/uploads/

# Verificar
ls -la /srv/controle-share-videos/data/
# controle-videos.db  images/  uploads/
# Tudo owner 1002:1002
```

---

## 10. Ajuste do `general.appUrl` no banco

O `general.appUrl` controla os links gerados nos e-mails e no frontend
(compartilhamentos, reset de senha, convites). **Deve ser a URL pública HTTPS.**

### Opção A — Via UI Admin (recomendado)
1. Acessar `https://seusistema.ddns.net` → login admin
2. Menu Admin → Configurações → Geral
3. Editar `URL da Aplicação` → `https://seusistema.ddns.net` (sem barra final)
4. Salvar

### Opção B — Via SQL direto (antes do primeiro boot)
```bash
sqlite3 /srv/controle-share-videos/data/controle-videos.db \
  "UPDATE \"Config\" SET \"value\"='https://seusistema.ddns.net', \"updatedAt\"=CURRENT_TIMESTAMP \
   WHERE \"name\"='appUrl' AND \"category\"='general';"
```

> **Atenção**: não crie `/opt/controle-share-videos-v1.0/backend/config.yaml` em produção
> com a chave `general.appUrl`. O `ConfigService` carrega YAML a cada boot e
> **sobrescreve o banco** se a chave existir no YAML (`config.service.ts:62-65`).
> Use apenas UI Admin ou SQL direto na tabela `"Config"`.

---

## 11. Permissões 1002:1002 + chown + ACLs

O container roda como usuário `controle-user` (UID 1002) / grupo `controle-group` (GID 1002),
criados no `Dockerfile:90-91` e ajustados em runtime por `create-user.sh`.

```bash
# Garantir ownership no RAID6 (idempotente)
sudo chown -R 1002:1002 /srv/controle-share-videos/data
sudo chown -R 1002:1002 /srv/controle-share-videos/backups

# setgid nas pastas de upload para herdar GID 1002
sudo find /srv/controle-share-videos/data/uploads -type d -exec chmod 2775 {} +

# Arquivos 664, dirs 2775
sudo find /srv/controle-share-videos/data -type f -exec chmod 0664 {} +
sudo find /srv/controle-share-videos/data -type d -exec chmod 2775 {} +

# Verificar
stat -c '%u:%g %n' /srv/controle-share-videos/data/controle-videos.db
# 1002:1002 /srv/controle-share-videos/data/controle-videos.db
```

O Samba (próxima seção) usa `force group = 1002` + `create mask = 0664` +
`directory mask = 2775` para manter consistência quando o usuário `uploader`
(UID 1102) escreve via SMB.

---

## 12. Build e primeiro startup

```bash
cd /opt/controle-share-videos-v1.0

# Build sem cache (primeira vez)
docker compose -f docker-compose.prod.yml build --no-cache

# Subir
docker compose -f docker-compose.prod.yml up -d

# Verificar saúde
docker compose -f docker-compose.prod.yml ps
# backend, frontend, caddy → Up (healthy)

# Logs
docker compose -f docker-compose.prod.yml logs -f
```

Healthchecks esperados:
- `backend`: `curl -fs http://127.0.0.1:8080/api/health` → 200
- `frontend`: `curl -fs http://127.0.0.1:3333` → 200
- `caddy`: `caddy validate --config /etc/caddy/Caddyfile` → ok

---

## 13. Configuração do Samba autenticado

Execute **após** o hardening.sh e **após** a estrutura `/srv/.../data/uploads/shares` existir com owner 1002:1002.

```bash
sudo bash /opt/controle-share-videos-v1.0/scripts/provision/samba.sh
```

O script:
1. Instala `samba`
2. Cria usuário host `uploader` (UID 1102, shell `/usr/sbin/nologin`)
3. Adiciona `uploader` ao grupo GID 1002 (`controle-group-1002`)
4. Define senha Samba (`smbpasswd -a uploader`) — interativa ou via `UPLOADER_PASSWORD`
5. Ajusta permissões: `chown -R 1002:1002`, `chmod 2775` (dirs), `0664` (files)
6. Escreve `/etc/samba/smb.conf` com share `[videos]`:
   ```ini
   [videos]
       path = /srv/controle-share-videos/data/uploads/shares
       valid users = uploader
       force group = 1002
       create mask = 0664
       directory mask = 2775
       veto files = /*.bat/*.exe/*.scr/*.com/*.cmd/*.vbs/*.js/*.jse/*.wsf/*.ps1*/
       hosts allow = 192.168.0.0/16 10.0.0.0/8 172.16.0.0/12 127.0.0.1
   ```
7. `testparm` + `systemctl restart smbd nmbd`

### Teste no Windows (LAN)
```
Win+R → \\seu-servidor\videos
Usuário: uploader
Senha: <a definida no smbpasswd>
```
Arquivos colados aparecem **imediatamente** em
`/opt/app/backend/data/uploads/shares/` dentro do container.

### Rotacionar senha do uploader
```bash
sudo smbpasswd uploader
```

---

## 14. Firewall UFW (incluindo SMB LAN-only)

Já configurado pelo `hardening.sh`:

```bash
sudo ufw status verbose
# Status: active
# Logging: on (low)
# Default: deny (incoming), allow (outgoing), disabled (routed)
# New profiles: skip

# To                         Action      From
# --                         ------      ----
# 22/tcp                     ALLOW IN    Anywhere                   # SSH (limit)
# 80/tcp                     ALLOW IN    Anywhere                   # HTTP (ACME)
# 443/tcp                    ALLOW IN    Anywhere                   # HTTPS
# 445/tcp                    DENY IN     Anywhere                   # SMB default deny
# 445/tcp                    ALLOW IN    192.168.0.0/16             # SMB LAN
# 445/tcp                    ALLOW IN    10.0.0.0/8                 # SMB LAN
# 445/tcp                    ALLOW IN    172.16.0.0/12              # SMB LAN
```

> **Importante**: `hardening.sh` faz `ufw --force reset`. Rode-o **uma vez** no
> provisionamento inicial. Se precisar ajustar regras depois, edite manualmente
> ou crie script separado — não rode `hardening.sh` novamente após configurar o Samba.

---

## 15. Fail2ban

Já configurado pelo `hardening.sh` com 3 jails:

| Jail | Porta | Filtro | Log | MaxRetry | BanTime |
|------|-------|--------|-----|----------|---------|
| `sshd` | 22 | `sshd` | `/var/log/auth.log` | 3 | 24h |
| `caddy` | 80,443 | `caddy` (custom) | `/var/log/caddy/access.log` | 20 | 1h |
| `samba` | 445 | `samba` (built-in) | `/var/log/samba/log.smbd` | 5 | 1h |

Verificar:
```bash
sudo fail2ban-client status
sudo fail2ban-client status sshd
sudo fail2ban-client status caddy
sudo fail2ban-client status samba
```

---

## 16. Hardening do host

O script `scripts/provision/hardening.sh` executa:

1. **UFW** — deny incoming, allow 22/80/443, limit 22, SMB LAN-only
2. **Fail2ban** — instala, configura jails sshd/caddy/samba, habilita
3. **SSH** — `/etc/ssh/sshd_config`:
   - `PermitRootLogin no`
   - `PasswordAuthentication no`
   - `PubkeyAuthentication yes`
   - `ChallengeResponseAuthentication no`
   - `UsePAM no`
   - `X11Forwarding no`
   - `ClientAliveInterval 300`, `ClientAliveCountMax 2`
   - `MaxAuthTries 3`, `MaxSessions 10`
   - `systemctl reload sshd`

### Pós-hardening
```bash
# 1) Adicionar sua chave SSH (antes de fechar a sessão atual!)
ssh-copy-id usuario@servidor

# 2) Testar login com chave em nova aba/terminal
ssh usuario@servidor

# 3) Atualizações automáticas de segurança
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
# Responder "Sim" para downloads/instalação automática
```

---

## 17. Backup (GPG fail-closed) + cron

O script `scripts/backup.sh` já implementa a rotina completa:

- **Fail-closed**: em produção (`NODE_ENV=production`), **exige** `GPG_RECIPIENT` — aborta se não definido
- `sqlite3 .backup` → `gzip -9` → `gpg --encrypt --sign --recipient $GPG_RECIPIENT`
- Retenção: 30 dias (`find -mtime +30 -delete`)
- Saída em `/opt/app/backups/` (bind mount → `/srv/.../backups/sqlite/`)

### Gerar chave GPG (uma vez)
```bash
gpg --gen-key
# Tipo: RSA and RSA, 4096 bits, validade 2y/0, nome/email reais
# Exportar chave pública para o host de backup se off-site
gpg --export -a "seu@email" > pubkey.asc
```

### Configurar `GPG_RECIPIENT` no host (environment do container backend)
Adicione no `docker-compose.prod.yml` (backend → environment):
```yaml
environment:
  - GPG_RECIPIENT=seu@email
  # ou use Docker secret + *_FILE se preferir não expor no compose
```

### Cron diário (2h da manhã)
```bash
sudo crontab -e
# Backup diário 2h
0 2 * * * /opt/controle-share-videos-v1.0/scripts/backup.sh \
      >> /var/log/controle-share-videos-backup.log 2>&1
```

### Restaurar (manual)
```bash
# Descriptografar
gpg --decrypt backup.db.gz.gpg > backup.db.gz

# Descomprimir
gunzip backup.db.gz

# Restaurar no SQLite
sqlite3 /srv/controle-share-videos/data/controle-videos.db \
  ".restore 'backup.db'"
```

---

## 18. Restauração (disaster recovery)

### Cenário 1: Banco corrompido, containers ok
```bash
docker compose -f docker-compose.prod.yml down
# Restaurar backup mais recente (ver seção 17)
sqlite3 /srv/controle-share-videos/data/controle-videos.db ".restore 'backup.db'"
docker compose -f docker-compose.prod.yml up -d
```

### Cenário 2: Host perdido — rebuild completo
```bash
# 1) Novo Ubuntu Server + Docker + hardening.sh
# 2) Montar RAID6 em /srv/controle-share-videos (mesmo UUID no fstab)
# 3) Clone do repo em /opt/controle-share-videos-v1.0 (mesma tag)
# 4) Recriar Docker secrets (mesmos valores)
# 5) Build + up
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
# Dados no RAID6 intactos → aplicação sobe com usuários, shares, vídeos
```

---

## 19. Atualizações seguras (isolando dados) + rollback

### Atualização padrão
```bash
cd /opt/controle-share-videos-v1.0

# 1) Backup pré-update (obrigatório)
/opt/controle-share-videos-v1.0/scripts/backup.sh

# 2) Parar containers
docker compose -f docker-compose.prod.yml down

# 3) Atualizar código (tag de release)
git fetch --tags
git checkout v1.2.4    # nova tag

# 4) Rebuild
docker compose -f docker-compose.prod.yml build --no-cache

# 5) Subir
docker compose -f docker-compose.prod.yml up -d

# 6) Verificar
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

> **Por que é seguro**: dados em `/srv/controle-share-videos/data/` são **bind mounts**,
> fora do ciclo de vida do container. `down`/`build`/`up` nunca os tocam.
> `prisma migrate deploy` no entrypoint é idempotente — aplica só migrations novas.

### Rollback (update quebrou produção)
```bash
docker compose -f docker-compose.prod.yml down
git checkout v1.2.3    # tag anterior estável
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

---

## 20. Rotinas de manutenção

### Limpeza de `_temp` (diário 3h)
```bash
# Já criado: scripts/maintenance/cleanup-temp.sh
# Remove arquivos > 24h em data/uploads/_temp/

sudo crontab -e
0 3 * * * /opt/controle-share-videos-v1.0/scripts/maintenance/cleanup-temp.sh \
      >> /var/log/controle-share-videos-cleanup.log 2>&1
```

### VACUUM SQLite (mensal, opcional)
```bash
# Adicionar ao crontab se o banco crescer muito
0 4 1 * * sqlite3 /srv/controle-share-videos/data/controle-videos.db "VACUUM;" \
      >> /var/log/controle-share-videos-vacuum.log 2>&1
```

### Verificação de integridade (semanal)
```bash
0 5 * * 0 /opt/controle-share-videos-v1.0/scripts/verify-db.sh \
      >> /var/log/controle-share-videos-integrity.log 2>&1
```

---

## 21. Monitoramento (opcional)

Arquivo: `docker-compose.monitoring.yml` (já inclui Loki + Promtail — **não existe** `docker-compose.logging.yml` separado).

```bash
# Subir stack de monitoramento
docker compose -f docker-compose.monitoring.yml up -d

# Serviços
# - prometheus :9090   (métricas, TSDB 30d em /srv/.../monitoring/prometheus)
# - grafana    :3001   (dashboards, sessões em /srv/.../monitoring/grafana)
# - loki       :3100   (logs, chunks em /srv/.../monitoring/loki)
# - promtail          (coleta /var/log + docker containers → Loki)
# - node-exporter     (host metrics, network_mode: host)
```

### Pré-requisitos no host (antes do `up -d`)
```bash
# Diretórios no RAID6 com donos corretos para os usuários dos containers
# prometheus (UID 65534), grafana (UID 472), loki (UID 10001) — ajustar conforme imagens
sudo mkdir -p /srv/controle-share-videos/monitoring/{prometheus,grafana,loki}
# Exemplo genérico (ajustar UIDs se necessário):
sudo chown -R 65534:65534 /srv/controle-share-videos/monitoring/prometheus
sudo chown -R 472:472     /srv/controle-share-videos/monitoring/grafana
sudo chown -R 10001:10001 /srv/controle-share-videos/monitoring/loki
```

### Senha Grafana
```bash
bash /opt/controle-share-videos-v1.0/scripts/provision/grafana-secret.sh
# Imprime senha única — guarde!
# Login: http://seu-host:3001  (admin / <senha>)
```

---

## 22. Solução de problemas

| Sintoma | Diagnóstico | Ação |
|---------|-------------|------|
| `backend` unhealthy | `curl http://127.0.0.1:8080/api/health` falha | `docker logs backend` → ver migrações/seed |
| `caddy` não emite certificado | ACME falha | Verificar porta 80 aberta, DNS propagado, `domain` secret correto |
| Links gerados usam `localhost` | `general.appUrl` não definido ou = default | Definir via UI Admin ou SQL (seção 10) |
| Samba nega acesso | UFW / `hosts allow` / senha | `ufw status`, `testparm`, `smbpasswd uploader` |
| `_temp` cresce sem parar | Cron não roda / script erro | `systemctl status cron`, logs em `/var/log/...-cleanup.log` |
| Backup aborta "GPG_RECIPIENT required" | Falta env no backend | Adicionar `GPG_RECIPIENT` no compose ou secret |
| `prisma migrate deploy` falha | Migration conflitante | Verificar `docker logs backend`; nunca edite migrations aplicadas |

### Comandos úteis
```bash
# Entrar no container backend
docker exec -it controle-share-videos-backend sh

# Ver banco
sqlite3 /srv/controle-share-videos/data/controle-videos.db ".tables"

# Ver config appUrl
sqlite3 /srv/controle-share-videos/data/controle-videos.db \
  "SELECT * FROM \"Config\" WHERE \"name\"='appUrl';"

# Verificar permissões
ls -la /srv/controle-share-videos/data/uploads/shares/

# Testar Caddyfile
docker exec controle-share-videos-caddy caddy validate --config /etc/caddy/Caddyfile
```

---

## 23. Checklist final de produção

### Infraestrutura
- [ ] Ubuntu Server 22.04/24.04 LTS instalado
- [ ] RAID6 montado em `/srv/controle-share-videos` (fstab UUID + nofail)
- [ ] Docker Engine + Compose v2 instalados
- [ ] Usuário não-root no grupo `docker`

### Código & Secrets
- [ ] Repo clonado em `/opt/controle-share-videos-v1.0` (tag de release)
- [ ] 6 Docker secrets criados: `admin_email`, `admin_username`, `admin_password`, `smtp_password`, `acme_email`, `domain`
- [ ] `GPG_RECIPIENT` definido (env ou secret) para backup

### Domínio & TLS
- [ ] Hostname No-IP `seusistema.ddns.net` criado (A record → IP fixo)
- [ ] Port forwarding 80/443 no roteador → IP local do servidor
- [ ] `general.appUrl = https://seusistema.ddns.net` definido no banco
- [ ] Caddy emitiu certificado Let's Encrypt (logs: `acme: Obtaining certificate...`)

### Dados & Permissões
- [ ] `/srv/.../data` owner 1002:1002, dirs 2775, files 0664
- [ ] `uploads/shares` setgid (2775) para herdar GID 1002
- [ ] Backup testado (restore funcional)

### Samba
- [ ] `hardening.sh` executado (UFW + fail2ban + SSH)
- [ ] `samba.sh` executado (usuário `uploader`, share `[videos]`)
- [ ] Teste Windows: `\\servidor\videos` → autentica → cola vídeo → aparece no container

### Monitoramento (se usado)
- [ ] Diretórios `/srv/.../monitoring/{prometheus,grafana,loki}` criados com owners corretos
- [ ] `grafana-secret.sh` executado, senha guardada
- [ ] `docker compose -f docker-compose.monitoring.yml up -d` saudável

### Manutenção agendada (crontab root)
- [ ] `0 2 * * * backup.sh` (diário 2h)
- [ ] `0 3 * * * cleanup-temp.sh` (diário 3h)
- [ ] `0 4 1 * * sqlite3 ... VACUUM` (mensal, opcional)
- [ ] `0 5 * * 0 verify-db.sh` (semanal)

### Documentação
- [ ] Este guia lido e seguido
- [ ] `conf-dominio.md` lido e seguido
- [ ] Runbooks de restore/rollback acessíveis à equipe

---

**Fim do Guia de Implantação**

> Mantido em `docs/Implantacao/Implantacao.md` — versionado junto com o código.
> Atualize a tag de release neste documento a cada deploy de produção.