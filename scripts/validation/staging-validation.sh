#!/usr/bin/env bash
# staging-validation.sh - Validacao completa de staging para security hardening
# Usage: ./staging-validation.sh [--full|--quick]

# Note: Intentionally NOT using 'set -e' to allow full validation even if individual checks fail
# We handle errors explicitly and track pass/fail/warn counts

MODE="${1:-full}"
LOG_FILE="${LOG_FILE:-./staging-validation.log}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
pass() { log "  [PASS] $*"; ((PASSED++)); }
fail() { log "  [FAIL] $*"; ((FAILED++)); return 1; }
warn() { log "  [WARN] $*"; ((WARNINGS++)); return 0; }
info() { log "  [INFO] $*"; return 0; }

PASSED=0
FAILED=0
WARNINGS=0

SCRIPTS_DIR="$PROJECT_ROOT/scripts"
BACKUP_DIR="$SCRIPTS_DIR/backup"
SECURITY_DIR="$SCRIPTS_DIR/security"
CI_DIR="$SCRIPTS_DIR/ci"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
info() { log "  [INFO] $*"; return 0; }
pass() { log "  [PASS] $*"; ((PASSED++)); return 0; }
fail() { log "  [FAIL] $*"; ((FAILED++)); return 1; }
warn() { log "  [WARN] $*"; ((WARNINGS++)); return 0; }

PASSED=0
FAILED=0
WARNINGS=0

SCRIPTS_DIR="$PROJECT_ROOT/scripts"
BACKUP_DIR="$SCRIPTS_DIR/backup"
SECURITY_DIR="$SCRIPTS_DIR/security"
CI_DIR="$SCRIPTS_DIR/ci"

# =============================================================================
# 1. BACKUP & RESTORE VALIDATION
# =============================================================================
validate_backup_restore() {
    log "=== 1. BACKUP & RESTORE VALIDATION ==="
    local rc=0
    
    info "Checking SQLite backup script..."
    if [[ -f "$BACKUP_DIR/backup-sqlite.sh" && -x "$BACKUP_DIR/backup-sqlite.sh" ]]; then
        pass "SQLite backup script exists and executable"
    else
        fail "SQLite backup script missing or not executable"; rc=1
    fi
    
    info "Checking files backup script..."
    if [[ -f "$BACKUP_DIR/backup-files.sh" && -x "$BACKUP_DIR/backup-files.sh" ]]; then
        pass "Files backup script exists and executable"
    else
        fail "Files backup script missing or not executable"; rc=1
    fi
    
    info "Checking restore script..."
    if [[ -f "$BACKUP_DIR/restore.sh" && -x "$BACKUP_DIR/restore.sh" ]]; then
        pass "Restore script exists and executable"
    else
        fail "Restore script missing or not executable"; rc=1
    fi
    
    info "Checking health check script..."
    if [[ -f "$BACKUP_DIR/health-check.sh" && -x "$BACKUP_DIR/health-check.sh" ]]; then
        pass "Health check script exists and executable"
    else
        fail "Health check script missing or not executable"; rc=1
    fi
    
    info "Checking encryption scripts..."
    if [[ -f "$BACKUP_DIR/backup-encrypt.sh" && -x "$BACKUP_DIR/backup-encrypt.sh" ]]; then
        pass "Backup encrypt script exists"
    else
        fail "Backup encrypt script missing"; rc=1
    fi
    
    if [[ -f "$BACKUP_DIR/backup-decrypt.sh" && -x "$BACKUP_DIR/backup-decrypt.sh" ]]; then
        pass "Backup decrypt script exists"
    else
        fail "Backup decrypt script missing"; rc=1
    fi
    
    return $rc
}

# =============================================================================
# 2. INCIDENT RESPONSE VALIDATION
# =============================================================================
validate_ir() {
    log "=== 2. INCIDENT RESPONSE VALIDATION ==="
    local rc=0
    
    local runbooks=(
        "docs/runbooks/incident-response.md"
        "docs/runbooks/postmortem-template.md"
        "docs/runbooks/secure-comms.md"
        "docs/runbooks/tabletop-exercise.md"
        "docs/rollback-runbook.md"
    )
    
    for runbook in "${runbooks[@]}"; do
        if [[ -f "$PROJECT_ROOT/$runbook" ]]; then
            pass "Runbook exists: $runbook"
        else
            fail "Runbook missing: $runbook"; rc=1
        fi
    done
    
    return $rc
}

# =============================================================================
# 3. SECURITY SCRIPTS VALIDATION
# =============================================================================
validate_security_scripts() {
    log "=== 3. SECURITY SCRIPTS VALIDATION ==="
    local rc=0
    
    local scripts=(
        "$SECURITY_DIR/rotate-jwt-secret.sh"
        "$SECURITY_DIR/secret-rotation-cron.sh"
        "$SECURITY_DIR/transitive-deps-review.sh"
        "$SECURITY_DIR/debug-prod-verify.sh"
        "$SECURITY_DIR/rotation-schedule.json"
        "$BACKUP_DIR/backup-encrypt.sh"
        "$BACKUP_DIR/backup-decrypt.sh"
        "$CI_DIR/prod-readiness-check.sh"
    )
    
    for script in "${scripts[@]}"; do
        if [[ ! -f "$script" ]]; then
            fail "Script missing: $script"; rc=1
        elif [[ ! -x "$script" && "$script" != *.json ]]; then
            warn "Script not executable: $script"
        else
            pass "Script exists and executable: $script"
        fi
    done
    
    return $rc
}

# =============================================================================
# 4. CI/CD PIPELINE VALIDATION
# =============================================================================
validate_cicd() {
    log "=== 4. CI/CD PIPELINE VALIDATION ==="
    local rc=0
    
    if [[ ! -f "$PROJECT_ROOT/.github/workflows/security-gate.yml" ]]; then
        fail "Security gate workflow missing"; rc=1
    else
        pass "Security gate workflow exists"
    fi
    
    if [[ ! -f "$PROJECT_ROOT/.hadolint.yaml" ]]; then
        fail "Hadolint config missing"; rc=1
    else
        pass "Hadolint config exists"
    fi
    
    if [[ ! -f "$CI_DIR/prod-readiness-check.sh" ]]; then
        fail "Prod readiness check script missing"; rc=1
    else
        pass "Prod readiness check script exists"
    fi
    
    return $rc
}

# =============================================================================
# 5. DOCUMENTATION VALIDATION
# =============================================================================
validate_documentation() {
    log "=== 5. DOCUMENTATION VALIDATION ==="
    local rc=0
    
    local required_docs=(
        "docs/SECURITY-ANALYSIS-PTBR.md"
        "docs/SECURITY-GAPS-IMPLEMENTATION-PLAN-PTBR.md"
        "docs/asset-inventory.csv"
        "docs/data-classification-lgpd.csv"
        "docs/lgpd-lawful-basis.md"
        "docs/ssrf-protection.md"
        "docs/hsts-preload.md"
        "docs/rls-evaluation.md"
        "docs/rollback-runbook.md"
    )
    
    for doc in "${required_docs[@]}"; do
        if [[ -f "$PROJECT_ROOT/$doc" ]]; then
            pass "Document exists: $doc"
        else
            fail "Document missing: $doc"; rc=1
        fi
    done
    
    if [[ -f "$PROJECT_ROOT/docs/data-classification-lgpd.csv" ]]; then
        local lines
        lines=$(wc -l < "$PROJECT_ROOT/docs/data-classification-lgpd.csv")
        if [[ $lines -gt 50 ]]; then
            pass "LGPD classification has substantial content ($lines lines)"
        else
            warn "LGPD classification seems sparse ($lines lines)"
        fi
    fi
    
    return $rc
}

# =============================================================================
# 6. MONITORING & ALERTING VALIDATION
# =============================================================================
validate_monitoring() {
    log "=== 6. MONITORING & ALERTING VALIDATION ==="
    local rc=0
    
    if [[ -f "$PROJECT_ROOT/scripts/monitoring/alerts.yml" ]]; then
        pass "Alerts config exists"
        
        local rule_count
        rule_count=$(grep -c "^\s*- alert:" "$PROJECT_ROOT/scripts/monitoring/alerts.yml" 2>/dev/null || echo 0)
        info "Total alert rules: $rule_count"
        
        if [[ $rule_count -ge 20 ]]; then
            pass "Substantial alert coverage ($rule_count rules)"
        else
            warn "Alert coverage may be low ($rule_count rules)"
        fi
        
        local groups=("security-critical" "availability-critical" "performance-warning" "infrastructure" "business-metrics")
        for group in "${groups[@]}"; do
            if grep -q "name: $group" "$PROJECT_ROOT/scripts/monitoring/alerts.yml"; then
                pass "Alert group exists: $group"
            else
                warn "Alert group missing: $group"
            fi
        done
    else
        fail "Alerts config missing"; rc=1
    fi
    
    return $rc
}

# =============================================================================
# 7. LGPD/COMPLIANCE VALIDATION
# =============================================================================
validate_lgpd() {
    log "=== 7. LGPD/COMPLIANCE VALIDATION ==="
    local rc=0
    
    if [[ -f "$PROJECT_ROOT/docs/data-classification-lgpd.csv" ]]; then
        local sensitive_count
        sensitive_count=$(grep -c "DADO_SENSIVEL" "$PROJECT_ROOT/docs/data-classification-lgpd.csv" 2>/dev/null || echo 0)
        info "Sensitive data fields classified: $sensitive_count"
        
        if [[ $sensitive_count -ge 5 ]]; then
            pass "Sensitive data properly classified ($sensitive_count fields)"
        else
            warn "Few sensitive fields classified ($sensitive_count)"
        fi
    else
        fail "Data classification matrix missing"; rc=1
    fi
    
    if [[ -f "$PROJECT_ROOT/docs/lgpd-lawful-basis.md" ]]; then
        local activities
        activities=$(grep -c "^| [0-9]" "$PROJECT_ROOT/docs/lgpd-lawful-basis.md" 2>/dev/null || echo 0)
        info "Mapped activities: $activities"
        
        if [[ $activities -ge 10 ]]; then
            pass "Lawful basis mapping comprehensive ($activities activities)"
        else
            warn "Lawful basis mapping may be incomplete ($activities activities)"
        fi
    else
        fail "Lawful basis mapping missing"; rc=1
    fi
    
    if [[ -f "$PROJECT_ROOT/docs/asset-inventory.csv" ]]; then
        local assets
        assets=$(wc -l < "$PROJECT_ROOT/docs/asset-inventory.csv")
        info "Assets inventoried: $((assets - 1))"
        
        if [[ $assets -ge 10 ]]; then
            pass "Asset inventory populated ($((assets - 1)) assets)"
        else
            warn "Asset inventory sparse ($((assets - 1)) assets)"
        fi
    else
        fail "Asset inventory missing"; rc=1
    fi
    
    return $rc
}

# =============================================================================
# MAIN
# =============================================================================
main() {
    local MODE="${1:-full}"
    local LOG_FILE="${LOG_FILE:-./staging-validation.log}"
    
    log "=== STAGING VALIDATION STARTED (mode: $MODE) ==="
    
    local overall_rc=0
    
    validate_backup_restore || overall_rc=1
    validate_ir || overall_rc=1
    validate_security_scripts || overall_rc=1
    validate_cicd || overall_rc=1
    validate_documentation || overall_rc=1
    validate_monitoring || overall_rc=1
    validate_lgpd || overall_rc=1
    
    log ""
    log "=== VALIDATION SUMMARY ==="
    log "Passed:  $PASSED"
    log "Warnings: $WARNINGS"
    log "Failed:  $FAILED"
    log ""
    
    if [[ $overall_rc -eq 0 ]]; then
        log "✅ ALL CRITICAL CHECKS PASSED"
        if [[ $WARNINGS -gt 0 ]]; then
            log "⚠️  $WARNINGS warnings - review recommended"
        fi
        return 0
    else
        log "❌ $FAILED CRITICAL FAILURES - MUST FIX BEFORE PRODUCTION"
        return 1
    fi
}

main "$@"
