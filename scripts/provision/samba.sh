#!/bin/bash
# =============================================================================
# Provisioning script for the authenticated Samba share [videos].
#
# Goal: expose /srv/controle-share-videos/data/uploads/shares on the LAN
# as \\servidor\videos so a Windows station can paste videos that appear
# immediately inside the container (which reads the same bind mount).
#
# Security model:
#   - Dedicated host user `uploader` (UID 1102), NOT the container user.
#   - The shared directory is owned by 1002:1002 (the container's GID)
#     with setgid so files dropped in inherit GID 1002 → the container
#     can read/write them alongside Samba.
#   - Samba `force group = 1002` + `create mask = 0664` + `directory mask
#     = 2775` keep permissions consistent regardless of who created the
#     file.
#   - guest ok = no — every connection must authenticate as `uploader`.
#   - hosts allow is restricted to private LAN ranges (RFC 1918). The
#     matching UFW rules live in scripts/provision/hardening.sh.
#   - Risky extensions (.bat/.exe/.scr/...) are vetoed as hygiene.
#   - SMB3 minimum on the server side; SMB encryption REQUIRED and
#     signing MANDATORY (anti-MITM/tamper) — requires Win8+ clients.
#   - File operations audited via VFS full_audit → local7 →
#     /var/log/samba/audit.log (rsyslog drop-in installed below).
#
# Run as root on the production host, AFTER hardening.sh and AFTER the
# /srv/controle-share-videos/data tree exists and is chowned 1002:1002.
#
# Re-runnable: idempotent — recreates the user/samba user/config each run.
# =============================================================================
set -euo pipefail

# --- Configuration ----------------------------------------------------------
SHARE_NAME="${SHARE_NAME:-videos}"
SHARE_PATH="${SHARE_PATH:-/srv/controle-share-videos/data/uploads/shares}"
UPLOADER_USER="${UPLOADER_USER:-uploader}"
UPLOADER_UID="${UPLOADER_UID:-1102}"
UPLOADER_PASSWORD="${UPLOADER_PASSWORD:-}"   # prompt if empty
CONTAINER_GID="${CONTAINER_GID:-1002}"       # grupo do container (force group)

echo "=== Provisioning Samba share [${SHARE_NAME}] ==="

# --- 0. Pre-flight checks ---------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
  echo "[error] run as root: sudo $0" >&2
  exit 1
fi
if [ ! -d "${SHARE_PATH}" ]; then
  echo "[error] ${SHARE_PATH} does not exist." >&2
  echo "        Create the RAID6 data tree first (see docs/Implantacao/Implantacao.md)." >&2
  exit 1
fi

# --- 1. Install Samba -------------------------------------------------------
echo "[1/6] Installing Samba..."
apt-get update -y
apt-get install -y samba
systemctl enable --now smbd nmbd

# --- 2. Create host user `uploader` (UID 1102) ------------------------------
echo "[2/6] Ensuring host user ${UPLOADER_USER} (UID ${UPLOADER_UID})..."
if ! getent passwd "${UPLOADER_USER}" >/dev/null 2>&1; then
  if getent passwd "${UPLOADER_UID}" >/dev/null 2>&1; then
    echo "[warn] UID ${UPLOADER_UID} already in use by another user;" \
         "skipping creation (will reuse the existing Samba account)." >&2
  else
    useradd -u "${UPLOADER_UID}" -r -s /usr/sbin/nologin -d "${SHARE_PATH}" \
            -M "${UPLOADER_USER}"
  fi
fi

# Add the uploader user to the container's group so both can read/write.
CONTAINER_GROUP_NAME="controle-group-1002"
if ! getent group "${CONTAINER_GID}" >/dev/null 2>&1; then
  # Use a descriptive name; this is just a host-side group to own the share.
  groupadd -g "${CONTAINER_GID}" "${CONTAINER_GROUP_NAME}" || true
else
  CONTAINER_GROUP_NAME=$(getent group "${CONTAINER_GID}" | cut -d: -f1)
fi
usermod -aG "${CONTAINER_GROUP_NAME}" "${UPLOADER_USER}" || true

# --- 3. Samba user + password ----------------------------------------------
echo "[3/6] Setting Samba password for ${UPLOADER_USER}..."
if [ -z "${UPLOADER_PASSWORD}" ]; then
  # Interactive — prompted (input hidden).
  smbpasswd -a "${UPLOADER_USER}"
else
  # Non-interactive — for automated provisioning. Use env var or file.
  printf '%s\n%s\n' "${UPLOADER_PASSWORD}" "${UPLOADER_PASSWORD}" \
    | smbpasswd -a "${UPLOADER_USER}"
fi
smbpasswd -e "${UPLOADER_USER}"

# --- 4. Permissions on the share path ---------------------------------------
echo "[4/6] Fixing ownership/permissions on ${SHARE_PATH}..."
# Container must own + read/write. Uploader writes via Samba (force group
# below ensures new files become group 1002 regardless of who writes).
chown -R "1002:${CONTAINER_GID}" "${SHARE_PATH}"
# setgid on the directory tree so new subdirs inherit GID 1002.
find "${SHARE_PATH}" -type d -exec chmod 2775 {} +
find "${SHARE_PATH}" -type f -exec chmod 0664 {} +

# --- 5. Write /etc/samba/smb.conf -------------------------------------------
echo "[5/6] Writing /etc/samba/smb.conf..."
# Backup once (idempotent — do not overwrite the first backup).
if [ ! -f /etc/samba/smb.conf.provision.bak ]; then
  cp /etc/samba/smb.conf /etc/samba/smb.conf.provision.bak
fi

cat > /etc/samba/smb.conf << SMBCONF
# =============================================================================
# Samba configuration for Controle Share Videos
# Provisioned by scripts/provision/samba.sh — re-runnable.
# Edit manually only if you also update the provisioning script.
#
# Hardening (docs/operacional/SAMBA-SEGURANCA.md):
#   - SMB3 mínimo no servidor (bloqueia SMB1/EternalBlue)
#   - Criptografia SMB obrigatória e assinatura mandatory (anti-MITM)
#   - Veto ampliado de formatos de payload (.hta/.lnk/.iso/...)
#   - Auditoria de operações de arquivo via VFS full_audit
# =============================================================================

[global]
    workgroup        = WORKGROUP
    server role      = standalone server
    security         = user
    map to guest      = never
    guest ok          = no
    encrypt passwords = yes
    null passwords    = no

    # --- Protocolo: sem SMB1 (EternalBlue/WannaCry); exige Win8+ nas estações.
    server min protocol = SMB3
    server max protocol = SMB3_11
    client min protocol = SMB2

    # --- Confidencialidade/integridade em trânsito (vídeos sensíveis na LAN).
    # Requer estações Windows 8+/10+ para negociar criptografia SMB3.
    server smb encrypt = required
    server signing     = mandatory

    # Restrict to private LAN ranges (RFC 1918). Public IP is never
    # allowed — UFW on port 445 also enforces this (see hardening.sh).
    hosts allow = 192.168.0.0/16 10.0.0.0/8 172.16.0.0/12 127.0.0.1
    hosts deny  = ALL

    # Logging for fail2ban / troubleshooting.
    log file        = /var/log/samba/log.%m
    max log size    = 1000
    logging         = file
    log level       = 1
    server string   = controle-share-videos

[${SHARE_NAME}]
    path            = ${SHARE_PATH}
    comment         = Uploads de videos (Controle Share Videos)
    browseable      = yes
    read only       = no
    guest ok        = no
    writable        = yes
    valid users     = ${UPLOADER_USER}

    # Force group = container GID so files dropped here are readable and
    # writable by the container (UID 1002) regardless of which Samba user
    # created them.
    force group     = ${CONTAINER_GID}
    force create mode = 0664
    create mask       = 0664
    force directory mode = 2775
    directory mask      = 2775

    # Higiene — veto de executáveis/payload perigosos (no-ops em video/mp4,
    # mas impede que uma estação comprometida drope payload na share).
    # Cobre droppers clássicos: HTA, atalhos LNK, ISO/IMG montáveis,
    # instaladores MSI/JAR, DLLs e applets CPL.
    veto files      = /*.bat/*.exe/*.scr/*.com/*.cmd/*.vbs/*.js/*.jse/*.wsf/*.ps1/*.hta/*.lnk/*.iso/*.img/*.msi/*.jar/*.dll/*.cpl*/

    # Auditoria de operações de arquivo (quem/quando/de onde) — complementa
    # a trilha WORM da aplicação. Enviada ao syslog facility local7;
    # o rsyslog abaixo direciona para /var/log/samba/audit.log.
    vfs objects              = full_audit
    full_audit:prefix        = %u|%I|%S|%T
    full_audit:success       = connect, disconnect, opendir, mkdir, rmdir, unlink, rename, pwrite
    full_audit:failure       = connect
    full_audit:facility      = local7
    full_audit:priority      = notice
SMBCONF

# Roteia o facility local7 do VFS full_audit para arquivo dedicado.
if [ ! -f /etc/rsyslog.d/30-samba-audit.conf ]; then
  echo 'local7.*    /var/log/samba/audit.log' > /etc/rsyslog.d/30-samba-audit.conf
  systemctl restart rsyslog || true
fi

# --- 6. Restart + verify ----------------------------------------------------
echo "[6/6] Restarting smbd/nmbd and verifying..."
testparm -s --suppress-prompt >/dev/null
systemctl restart smbd nmbd
systemctl enable smbd nmbd

echo ""
echo "=== Samba share ready ==="
echo "Share:   [${SHARE_NAME}] -> ${SHARE_PATH}"
echo "User:    ${UPLOADER_USER} (UID ${UPLOADER_UID})"
echo "Group:   ${CONTAINER_GROUP_NAME} (GID ${CONTAINER_GID}, shared with container)"
echo "Perms:   dirs 2775, files 0664, setgid"
echo "LAN:     192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12"
echo ""
echo "From a Windows station on the LAN:"
echo "  1. Win+R -> \\\\${HOSTNAME:-servidor}\\${SHARE_NAME}"
echo "  2. Authenticate as ${UPLOADER_USER} (<password set above>)"
echo "  3. Paste video files; they appear immediately inside the container"
echo "     at /opt/app/backend/data/uploads/shares/"
echo ""
echo "Rotate the uploader password with:"
echo "  smbpasswd ${UPLOADER_USER}"
