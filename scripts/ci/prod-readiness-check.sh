#!/usr/bin/env bash
# prod-readiness-check.sh - Final production readiness verification
# Runs as final gate in CI/CD before production deployment
# Exit code: 0 = ready, 1 = not ready

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================
LOG_FILE="${LOG_FILE:-/var/log/prod-readiness.log}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
pass() { log "${GREEN}[PASS]${NC} $*"; ((CHECKS_PASSED++)); }
fail() { log "${RED}[FAIL]${NC} $*"; ((CHECKS_FAILED++)); }
warn() { log "${YELLOW}[WARN]${NC} $*"; ((CHECKS_WARNING++)); }
info() { log "${BLUE}[INFO]${NC} $*"; }

send_slack() {
    [[ -z "$SLACK_WEBHOOK" ]] && return 0
    local text="$1"
    local color="${2:-#ff0000}"
    curl -s -X POST -H 'Content-type: application/json' \
        --data "{\"attachments\":[{\"color\":\"$color\",\"text\":\"$text\"}]}" \
        "$SLACK_WEBHOOK" >/dev/null || true
}

# =============================================================================
# CHECK 1: Environment Variables
# =============================================================================
check_env_vars() {
    info "Checking required environment variables..."
    
    local required_vars=(
        "DATABASE_URL"
        "JWT_SECRET"
        "SMTP_HOST"
        "SMTP_PORT"
        "SMTP_USER"
        "SMTP_PASS"
        "ADMIN_EMAIL"
        "CORS_ORIGIN"
    )
    
    local missing=()
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            missing+=("$var")
        fi
    done
    
    if [[ ${#missing[@]} -eq 0 ]]; then
        pass "All required environment variables set"
    else
        fail "Missing environment variables: ${missing[*]}"
    fi
}

# =============================================================================
# CHECK 2: Secrets Not in Code
# =============================================================================
check_secrets_in_code() {
    info "Checking for secrets in code..."
    
    local patterns=(
        "password\s*=\s*['\"][^'\"]+['\"]"
        "secret\s*=\s*['\"][^'\"]+['\"]"
        "api[_-]?key\s*=\s*['\"][^'\"]+['\"]"
        "token\s*=\s*['\"][^'\"]+['\"]"
        "private[_-]?key\s*=\s*['\"][^'\"]+['\"]"
        "BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY"
        "AKIA[0-9A-Z]{16}"  # AWS Access Key
        "ghp_[a-zA-Z0-9]{36}"  # GitHub PAT
        "sk_live_[a-zA-Z0-9]{24}"  # Stripe
    )
    
    local found=0
    for pattern in "${patterns[@]}"; do
        if grep -r -i -E "$pattern" --exclude-dir=.git --exclude="*.log" --exclude="*.md" . 2>/dev/null | grep -v ".example" | grep -v "test" | head -5; then
            found=1
        fi
    done
    
    if [[ $found -eq 0 ]]; then
        pass "No secrets found in code"
    else
        fail "Potential secrets found in code (see output above)"
    fi
}

# =============================================================================
# CHECK 3: Debug Disabled
# =============================================================================
check_debug_disabled() {
    info "Checking debug mode disabled..."
    
    local debug_indicators=(
        "NODE_ENV=development"
        "DEBUG=*"
        "NEST_DEBUG=true"
        "SWAGGER_ENABLED=true"
    )
    
    local found=0
    for indicator in "${debug_indicators[@]}"; do
        if grep -r "$indicator" --exclude-dir=.git . 2>/dev/null | grep -v ".example" | head -1; then
            found=1
        fi
    done
    
    # Check package.json scripts
    if grep -q '"dev".*nest start --watch' backend/package.json; then
        warn "Dev script found in package.json (OK if not used in prod)"
    fi
    
    if [[ $found -eq 0 ]]; then
        pass "Debug mode appears disabled"
    else
        fail "Debug indicators found in configuration"
    fi
}

# =============================================================================
# CHECK 4: HTTPS Enforced
# =============================================================================
check_https_enforced() {
    info "Checking HTTPS enforcement..."
    
    # Check Caddyfile for HTTPS
    if [[ -f "reverse-proxy/Caddyfile.prod" ]]; then
        if grep -q "https://" reverse-proxy/Caddyfile.prod && \
           grep -q "tls" reverse-proxy/Caddyfile.prod; then
            pass "Caddyfile.prod enforces HTTPS with TLS"
        else
            fail "Caddyfile.prod missing HTTPS/TLS configuration"
        fi
    else
        warn "Caddyfile.prod not found (using default?)"
    fi
    
    # Check for HSTS in Helmet config
    if grep -q "strictTransportSecurity" backend/src/main.ts; then
        pass "HSTS configured in Helmet"
    else
        fail "HSTS not configured in Helmet (backend/src/main.ts)"
    fi
}

# =============================================================================
# CHECK 5: Security Headers
# =============================================================================
check_security_headers() {
    info "Checking security headers configuration..."
    
    local required_headers=(
        "contentSecurityPolicy"
        "crossOriginEmbedderPolicy"
        "crossOriginOpenerPolicy"
        "crossOriginResourcePolicy"
        "referrerPolicy"
        "strictTransportSecurity"
    )
    
    local missing=()
    for header in "${required_headers[@]}"; do
        if ! grep -q "$header" backend/src/main.ts; then
            missing+=("$header")
        fi
    done
    
    if [[ ${#missing[@]} -eq 0 ]]; then
        pass "All security headers configured in Helmet"
    else
        fail "Missing security headers: ${missing[*]}"
    fi
    
    # Check CSP specifically
    if grep -q "defaultSrc.*self" backend/src/main.ts; then
        pass "CSP default-src set to 'self'"
    else
        warn "CSP default-src may not be restrictive enough"
    fi
}

# =============================================================================
# CHECK 6: CORS Configured
# =============================================================================
check_cors() {
    info "Checking CORS configuration..."
    
    if grep -q "cors(" backend/src/main.ts; then
        if grep -q "origin.*CORS_ORIGIN" backend/src/main.ts; then
            pass "CORS configured with explicit origin from env"
        else
            fail "CORS origin not using environment variable"
        fi
    else
        fail "CORS middleware not found in main.ts"
    fi
    
    # Check no wildcard with credentials
    if grep -q "origin.*\*" backend/src/main.ts && grep -q "credentials.*true" backend/src/main.ts; then
        fail "CORS wildcard (*) used with credentials=true (security risk)"
    else
        pass "No wildcard origin with credentials"
    fi
}

# =============================================================================
# CHECK 7: Rate Limiting
# =============================================================================
check_rate_limiting() {
    info "Checking rate limiting..."
    
    if grep -q "ThrottlerModule" backend/src/app.module.ts; then
        pass "ThrottlerModule imported in app.module.ts"
    else
        fail "ThrottlerModule not configured"
    fi
    
    if grep -q "RequestThrottlerGuard" backend/src/app.module.ts; then
        pass "RequestThrottlerGuard registered as global guard"
    else
        fail "RequestThrottlerGuard not registered globally"
    fi
}

# =============================================================================
# CHECK 8: Authentication & Authorization
# =============================================================================
check_auth_authz() {
    info "Checking authentication & authorization..."
    
    # JWT Guard global
    if grep -q "JwtGuard" backend/src/app.module.ts; then
        pass "JwtGuard registered globally"
    else
        fail "JwtGuard not registered globally"
    fi
    
    # Roles Guard global
    if grep -q "RolesGuard" backend/src/app.module.ts; then
        pass "RolesGuard registered globally"
    else
        fail "RolesGuard not registered globally"
    fi
    
    # PasswordMustChangeGuard
    if grep -q "PasswordMustChangeGuard" backend/src/app.module.ts; then
        pass "PasswordMustChangeGuard registered globally"
    else
        fail "PasswordMustChangeGuard not registered globally"
    fi
    
    # CSRF protection
    if grep -q "csrf" backend/src/main.ts; then
        pass "CSRF protection configured"
    else
        fail "CSRF protection not found in main.ts"
    fi
}

# =============================================================================
# CHECK 9: Audit Logging
# =============================================================================
check_audit_logging() {
    info "Checking audit logging..."
    
    if grep -q "AuditModule" backend/src/app.module.ts; then
        pass "AuditModule imported"
    else
        fail "AuditModule not imported"
    fi
    
    if grep -q "AuditService" backend/src/audit/audit.service.ts; then
        pass "AuditService implemented"
    else
        fail "AuditService not found"
    fi
    
    # Check for sensitive data exclusion
    if grep -q "Never log passwords" backend/src/audit/audit.service.ts; then
        pass "Audit service documents no-secrets policy"
    else
        warn "Audit service should explicitly document no-secrets policy"
    fi
}

# =============================================================================
# CHECK 10: Database Security
# =============================================================================
check_database() {
    info "Checking database security..."
    
    # Not using root
    if grep -q "datasource.*sqlite" backend/src/prisma/prisma.module.ts; then
        pass "Using SQLite (file-based, no network exposure)"
    else
        info "Database type: check manually"
    fi
    
    # Parameterized queries (Prisma)
    if grep -q "@prisma/client" backend/package.json; then
        pass "Using Prisma ORM (parameterized queries)"
    else
        warn "Verify parameterized queries used"
    fi
    
    # Encryption at rest (file level)
    if [[ -f "docker-compose.yml" ]] && grep -q "volumes:" docker-compose.yml; then
        pass "Volumes configured (check host-level encryption)"
    fi
}

# =============================================================================
# CHECK 11: File Upload Security
# =============================================================================
check_file_upload() {
    info "Checking file upload security..."
    
    if [[ -f "backend/src/file/local.service.ts" ]]; then
        if grep -q "ALLOWED_EXTENSIONS" backend/src/file/local.service.ts; then
            pass "File extension allowlist implemented"
        else
            fail "File extension allowlist not found"
        fi
        
        if grep -q "fileTypeFromBuffer" backend/src/file/local.service.ts; then
            pass "Magic bytes validation implemented"
        else
            fail "Magic bytes validation not found"
        fi
        
        if grep -q "maxFileSize" backend/src/file/local.service.ts; then
            pass "Per-file size limit configured"
        else
            warn "Per-file size limit not explicitly configured"
        fi
    else
        fail "File upload service not found"
    fi
}

# =============================================================================
# CHECK 12: Backup Configured
# =============================================================================
check_backup() {
    info "Checking backup configuration..."
    
    if [[ -f "scripts/backup/backup-sqlite.sh" ]] && [[ -f "scripts/backup/backup-files.sh" ]]; then
        pass "Backup scripts exist"
    else
        fail "Backup scripts missing"
    fi
    
    if [[ -f "scripts/backup/health-check.sh" ]]; then
        pass "Backup health check script exists"
    else
        fail "Backup health check script missing"
    fi
    
    if [[ -f "scripts/backup/restore.sh" ]]; then
        pass "Restore script exists"
    else
        fail "Restore script missing"
    fi
}

# =============================================================================
# CHECK 13: Monitoring & Alerting
# =============================================================================
check_monitoring() {
    info "Checking monitoring & alerting..."
    
    if [[ -f "backend/src/metrics/metrics.module.ts" ]]; then
        pass "Metrics module implemented"
    else
        fail "Metrics module not found"
    fi
    
    if grep -q "prom-client" backend/package.json; then
        pass "Prometheus client installed"
    else
        fail "Prometheus client not installed"
    fi
    
    if [[ -f "scripts/monitoring/alerts.yml" ]] || [[ -f "scripts/monitoring/rules.yml" ]]; then
        pass "Alert rules defined"
    else
        warn "Prometheus alert rules not found (create scripts/monitoring/alerts.yml)"
    fi
}

# =============================================================================
# CHECK 14: Incident Response
# =============================================================================
check_incident_response() {
    info "Checking incident response readiness..."
    
    if [[ -f "docs/runbooks/incident-response.md" ]]; then
        pass "Incident response runbook exists"
    else
        fail "Incident response runbook missing"
    fi
    
    if [[ -f "docs/runbooks/postmortem-template.md" ]]; then
        pass "Postmortem template exists"
    else
        fail "Postmortem template missing"
    fi
    
    if [[ -f "docs/runbooks/secure-comms.md" ]]; then
        pass "Secure comms protocol exists"
    else
        fail "Secure comms protocol missing"
    fi
}

# =============================================================================
# CHECK 15: LGPD Compliance
# =============================================================================
check_lgpd() {
    info "Checking LGPD compliance artifacts..."
    
    if [[ -f "docs/data-classification-lgpd.csv" ]]; then
        pass "Data classification matrix exists"
    else
        fail "Data classification matrix missing"
    fi
    
    if [[ -f "docs/lgpd-lawful-basis.md" ]]; then
        pass "Lawful basis mapping exists"
    else
        fail "Lawful basis mapping missing"
    fi
    
    if [[ -f "docs/asset-inventory.csv" ]]; then
        pass "Asset inventory exists"
    else
        fail "Asset inventory missing"
    fi
}

# =============================================================================
# CHECK 16: Dependency Security
# =============================================================================
check_dependencies() {
    info "Checking dependency security..."
    
    if [[ -f "audit-backend.json" ]] && [[ -f "audit-frontend.json" ]]; then
        pass "Dependency audit files exist"
    else
        warn "Dependency audit files not found (run npm audit)"
    fi
    
    # Check for overrides
    if grep -q "overrides" backend/package.json; then
        pass "Dependency overrides configured in backend"
    else
        warn "No dependency overrides in backend"
    fi
    
    if grep -q "overrides" frontend/package.json; then
        pass "Dependency overrides configured in frontend"
    else
        warn "No dependency overrides in frontend"
    fi
}

# =============================================================================
# CHECK 17: Container Security
# =============================================================================
check_containers() {
    info "Checking container security..."
    
    if [[ -f "Dockerfile" ]]; then
        if grep -q "USER " Dockerfile && ! grep -q "USER root" Dockerfile; then
            pass "Dockerfile uses non-root user"
        else
            fail "Dockerfile runs as root"
        fi
        
        if grep -q "read-only" Dockerfile; then
            pass "Dockerfile uses read-only filesystem"
        else
            warn "Dockerfile not read-only"
        fi
        
        if grep -q "cap_drop" Dockerfile; then
            pass "Dockerfile drops capabilities"
        else
            warn "Dockerfile doesn't drop capabilities"
        fi
    fi
    
    if [[ -f ".hadolint.yaml" ]]; then
        pass "Hadolint configuration exists"
    else
        fail "Hadolint configuration missing"
    fi
}

# =============================================================================
# CHECK 18: Rollback Procedure
# =============================================================================
check_rollback() {
    info "Checking rollback procedure..."
    
    if [[ -f "docs/runbooks/rollback-runbook.md" ]] || [[ -f "scripts/backup/restore.sh" ]]; then
        pass "Rollback procedure documented"
    else
        fail "Rollback procedure not documented"
    fi
}

# =============================================================================
# MAIN
# =============================================================================
main() {
    log "=== PRODUCTION READINESS CHECK STARTED ==="
    
    check_env_vars
    check_secrets_in_code
    check_debug_disabled
    check_https_enforced
    check_security_headers
    check_cors
    check_rate_limiting
    check_auth_authz
    check_audit_logging
    check_database
    check_file_upload
    check_backup
    check_monitoring
    check_incident_response
    check_lgpd
    check_dependencies
    check_containers
    check_rollback
    
    log ""
    log "=== SUMMARY ==="
    log "Passed:  $CHECKS_PASSED"
    log "Warnings: $CHECKS_WARNING"
    log "Failed:  $CHECKS_FAILED"
    log ""
    
    if [[ $CHECKS_FAILED -eq 0 ]]; then
        log "${GREEN}✅ PRODUCTION READY${NC}"
        send_slack "✅ *PRODUCTION READINESS CHECK PASSED* - All gates clear for deployment" "#36a64f"
        exit 0
    else
        log "${RED}❌ NOT READY FOR PRODUCTION${NC} - $CHECKS_FAILED critical failures"
        send_slack "🚨 *PRODUCTION READINESS CHECK FAILED* - $CHECKS_FAILED critical issues found. Review before deployment." "#ff0000"
        exit 1
    fi
}

main "$@"