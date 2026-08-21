#!/usr/bin/env bash
# secret-rotation-cron.sh - Cron job for automated secret rotation
# Runs via systemd timer or cron: 0 3 * * 0 (weekly) for JWT, monthly for others
# Usage: ./secret-rotation-cron.sh [jwt|smtp|db|all]

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================
ROTATION_SCHEDULE_FILE="${ROTATION_SCHEDULE_FILE:-/etc/controle-share/rotation-schedule.json}"
LOG_FILE="${LOG_FILE:-/var/log/secret-rotation.log}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
success() { log "${GREEN}[OK]${NC} $*"; }
warn() { log "${YELLOW}[WARN]${NC} $*"; }
error() { log "${RED}[ERROR]${NC} $*"; }

send_slack() {
    [[ -z "$SLACK_WEBHOOK" ]] && return 0
    local text="$1"
    local color="${2:-#ff0000}"
    curl -s -X POST -H 'Content-type: application/json' \
        --data "{\"attachments\":[{\"color\":\"$color\",\"text\":\"$text\"}]}" \
        "$SLACK_WEBHOOK" >/dev/null || true
}

# Load rotation schedule
load_schedule() {
    if [[ -f "$ROTATION_SCHEDULE_FILE" ]]; then
        cat "$ROTATION_SCHEDULE_FILE"
    else
        # Default schedule
        cat <<'EOF'
{
  "jwt": { "interval_days": 90, "last_rotated": null, "script": "/opt/scripts/security/rotate-jwt-secret.sh" },
  "smtp": { "interval_days": 180, "last_rotated": null, "manual": true },
  "db": { "interval_days": 365, "last_rotated": null, "manual": true },
  "tls": { "interval_days": 90, "last_rotated": null, "auto": true }
}
EOF
    fi
}

# Save rotation schedule
save_schedule() {
    local schedule="$1"
    echo "$schedule" | jq . > "$ROTATION_SCHEDULE_FILE"
}

# Check if rotation is due
is_rotation_due() {
    local secret_name="$1"
    local interval_days="$2"
    local last_rotated="$3"
    
    if [[ -z "$last_rotated" || "$last_rotated" == "null" ]]; then
        return 0  # Never rotated, due now
    fi
    
    local last_epoch
    last_epoch=$(date -d "$last_rotated" +%s 2>/dev/null || echo 0)
    local now_epoch
    now_epoch=$(date +%s)
    local days_since=$(( (now_epoch - last_epoch) / 86400 ))
    
    [[ $days_since -ge $interval_days ]]
}

# Rotate JWT secret (automated)
rotate_jwt() {
    log "Rotating JWT secret..."
    
    if /opt/scripts/security/rotate-jwt-secret.sh; then
        success "JWT secret rotated successfully"
        
        # Update schedule
        local schedule
        schedule=$(load_schedule)
        local updated
        updated=$(echo "$schedule" | jq --arg now "$(date -Iseconds)" '.jwt.last_rotated = $now')
        save_schedule "$updated"
        
        send_slack "✅ *JWT Secret Rotated* - Automatic rotation completed" "#36a64f"
        return 0
    else
        error "JWT secret rotation failed"
        send_slack "🚨 *JWT Rotation FAILED* - Manual intervention required" "#ff0000"
        return 1
    fi
}

# Check SMTP credentials (manual)
check_smtp() {
    log "Checking SMTP credential rotation..."
    local schedule
    schedule=$(load_schedule)
    local interval
    interval=$(echo "$schedule" | jq -r '.smtp.interval_days')
    local last
    last=$(echo "$schedule" | jq -r '.smtp.last_rotated')
    
    if is_rotation_due "smtp" "$interval" "$last"; then
        warn "SMTP credentials rotation due (manual process required)"
        send_slack "⚠️ *SMTP Rotation Due* - Manual rotation required per schedule" "#ffaa00"
        return 1
    fi
    success "SMTP credentials not due for rotation"
    return 0
}

# Check DB password (manual)
check_db() {
    log "Checking DB password rotation..."
    local schedule
    schedule=$(load_schedule)
    local interval
    interval=$(echo "$schedule" | jq -r '.db.interval_days')
    local last
    last=$(echo "$schedule" | jq -r '.db.last_rotated')
    
    if is_rotation_due "db" "$interval" "$last"; then
        warn "DB password rotation due (manual process required)"
        send_slack "⚠️ *DB Password Rotation Due* - Manual rotation required per schedule" "#ffaa00"
        return 1
    fi
    success "DB password not due for rotation"
    return 0
}

# Check TLS cert (auto via Caddy/Let's Encrypt)
check_tls() {
    log "Checking TLS certificate rotation..."
    local schedule
    schedule=$(load_schedule)
    local interval
    interval=$(echo "$schedule" | jq -r '.tls.interval_days')
    local last
    last=$(echo "$schedule" | jq -r '.tls.last_rotated')
    
    # Caddy auto-renews, just check expiry
    if command -v caddy &>/dev/null; then
        local expiry
        expiry=$(caddy list-certificates 2>/dev/null | grep -oE 'notAfter=[^ ]+' | cut -d= -f2 | head -1)
        if [[ -n "$expiry" ]]; then
            local expiry_epoch
            expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || echo 0)
            local now_epoch
            now_epoch=$(date +%s)
            local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
            
            if [[ $days_left -lt 30 ]]; then
                warn "TLS certificate expires in $days_left days"
                send_slack "⚠️ *TLS Cert Expiring* - $days_left days remaining" "#ffaa00"
            else
                success "TLS certificate valid for $days_left days"
            fi
        fi
    fi
    return 0
}

# Main rotation check
main() {
    local target="${1:-all}"
    log "=== Secret Rotation Check Started (target: $target) ==="
    
    local schedule
    schedule=$(load_schedule)
    
    case "$target" in
        jwt)
            rotate_jwt
            ;;
        smtp)
            check_smtp
            ;;
        db)
            check_db
            ;;
        tls)
            check_tls
            ;;
        all)
            rotate_jwt || true
            check_smtp || true
            check_db || true
            check_tls || true
            ;;
        *)
            error "Usage: $0 [jwt|smtp|db|tls|all]"
            exit 1
            ;;
    esac
    
    log "=== Secret Rotation Check Completed ==="
}

main "$@"