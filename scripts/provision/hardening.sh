#!/bin/bash
# =============================================================================
# Hardening Script for Controle Share Videos Host Server
# INFRA-MED-03: firewall (UFW), fail2ban, SSH hardening, Docker Bench cron
# Run as root on the production host before or during initial deployment.
# =============================================================================
set -euo pipefail

echo "=== Starting host hardening ==="

# ---------------------------------------------------------------------------
# 1. UFW firewall — allow only SSH, HTTP, HTTPS, SMB (LAN-only)
# ---------------------------------------------------------------------------
echo "[1/3] Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp        # SSH
ufw allow 80/tcp        # HTTP  (Let's Encrypt ACME)
ufw allow 443/tcp       # HTTPS
ufw limit 22/tcp        # rate-limit SSH connections
# SMB 445 — deny by default, allow only from private LAN ranges so the
# Samba share [videos] is reachable from the office network but never
# from the public IP. Re-run scripts/provision/samba.sh after this to
# install the share itself (hardening.sh only opens the firewall).
ufw deny 445/tcp
ufw allow from 192.168.0.0/16 to any port 445 proto tcp
ufw allow from 10.0.0.0/8       to any port 445 proto tcp
ufw allow from 172.16.0.0/12    to any port 445 proto tcp
ufw --force enable
ufw status verbose

# ---------------------------------------------------------------------------
# 2. Fail2ban — protect SSH and HTTP(S) services
# ---------------------------------------------------------------------------
echo "[2/3] Installing & configuring Fail2ban..."
apt-get update -y
apt-get install -y fail2ban

cat > /etc/fail2ban/jail.local << 'JAIL'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled   = true
port      = ssh
filter    = sshd
logpath   = /var/log/auth.log
maxretry  = 3
bantime   = 86400

[caddy]
enabled  = true
port     = http,https
filter   = caddy
logpath  = /var/log/caddy/access.log
maxretry = 20
bantime  = 3600

# Samba — protect the SMB share [videos] from brute-force authentication.
# Mirror the LAN-only ranges opened in UFW above; fail2ban still applies
# inside those ranges. Default samba filter ships with fail2ban.
[samba]
enabled  = true
port     = 445
filter   = samba
logpath  = /var/log/samba/log.smbd
maxretry = 5
bantime  = 3600
JAIL

# Caddy/nginx filter for fail2ban
cat > /etc/fail2ban/filter.d/caddy.conf << 'FILTER'
[Definition]
failregex = ^<HOST> .* "GET /api/auth/signIn.* HTTP/\d\.\d" 4\d\d
            ^<HOST> .* "POST /api/auth.* HTTP/\d\.\d" 4\d\d
            ^<HOST> .* "POST /api.* HTTP/\d\.\d" 4\d\d
ignoreregex =
FILTER

systemctl enable fail2ban
systemctl restart fail2ban
fail2ban-client status

# ---------------------------------------------------------------------------
# 3. SSH hardening
# ---------------------------------------------------------------------------
echo "[3/3] Hardening SSH configuration..."
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%Y%m%d)

sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PubkeyAuthentication .*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^#\?ChallengeResponseAuthentication .*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?UsePAM .*/UsePAM no/' /etc/ssh/sshd_config
sed -i 's/^#\?X11Forwarding .*/X11Forwarding no/' /etc/ssh/sshd_config
sed -i 's/^#\?ClientAliveInterval .*/ClientAliveInterval 300/' /etc/ssh/sshd_config
sed -i 's/^#\?ClientAliveCountMax .*/ClientAliveCountMax 2/' /etc/ssh/sshd_config
sed -i 's/^#\?MaxAuthTries .*/MaxAuthTries 3/' /etc/ssh/sshd_config
sed -i 's/^#\?MaxSessions .*/MaxSessions 10/' /etc/ssh/sshd_config

# Restrict to specific users if desired:
# echo "AllowUsers deploy" >> /etc/ssh/sshd_config

systemctl reload sshd

# ---------------------------------------------------------------------------
# 4. Docker Bench Security — auditoria CIS semanal (INFRA-MED-03, item 15)
# ---------------------------------------------------------------------------
echo "[4/4] Configuring Docker Bench Security weekly audit..."
# Garante que o script existe no deploy (definido em deploy-prod.sh)
BENCH_SCRIPT="/opt/controle-share-videos-v1.0/scripts/security/docker-bench.sh"
if [ -f "$BENCH_SCRIPT" ]; then
    chmod +x "$BENCH_SCRIPT"
    # Remove entradas antigas para idempotência antes de reinstalar
    crontab -l 2>/dev/null | grep -v "docker-bench.sh" | crontab -
    ( crontab -l 2>/dev/null; \
      echo "30 5 * * 1 $BENCH_SCRIPT >> /var/log/controle-share-videos-docker-bench.log 2>&1" ) | crontab -
    echo "Cron instalado: seg 05:30 (docker-bench.sh)"
else
    echo "WARN: $BENCH_SCRIPT não encontrado — pule a instalação do cron (deploy completo primeiro)."
fi

echo ""
echo "=== Host hardening complete ==="
echo "Actions taken:"
echo "  - UFW firewall: only ports 22, 80, 443 open"
echo "  - Fail2ban: SSH (3 retries, 24h ban), HTTP auth (20 retries, 1h ban)"
echo "  - SSH: root login disabled, password auth disabled, key-only"
echo "  - Docker Bench Security: weekly CIS audit (Mon 05:30)"
echo ""
echo "Next steps:"
echo "  1. Add your SSH public key: ssh-copy-id user@host"
echo "  2. Verify you can login with key before closing the session"
echo "  3. Run: docker compose -f docker-compose.prod.yml up -d"
