#!/bin/bash
# =============================================================================
# Hardening Script for Controle Share Videos Host Server
# INFRA-MED-03: firewall (UFW), fail2ban, SSH hardening
# Run as root on the production host before or during initial deployment.
# =============================================================================
set -euo pipefail

echo "=== Starting host hardening ==="

# ---------------------------------------------------------------------------
# 1. UFW firewall — allow only SSH, HTTP, HTTPS
# ---------------------------------------------------------------------------
echo "[1/3] Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp        # SSH
ufw allow 80/tcp        # HTTP  (Let's Encrypt ACME)
ufw allow 443/tcp       # HTTPS
ufw limit 22/tcp        # rate-limit SSH connections
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

echo ""
echo "=== Host hardening complete ==="
echo "Actions taken:"
echo "  - UFW firewall: only ports 22, 80, 443 open"
echo "  - Fail2ban: SSH (3 retries, 24h ban), HTTP auth (20 retries, 1h ban)"
echo "  - SSH: root login disabled, password auth disabled, key-only"
echo ""
echo "Next steps:"
echo "  1. Add your SSH public key: ssh-copy-id user@host"
echo "  2. Verify you can login with key before closing the session"
echo "  3. Run: docker compose -f docker-compose.prod.yml up -d"
