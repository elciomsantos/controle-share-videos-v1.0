#!/usr/bin/env bash
# debug-prod-verify.sh - Verificacao de configuracoes de debug/producao
# Usage: ./debug-prod-verify.sh

set -euo pipefail

LOG_FILE="${LOG_FILE:-/var/log/debug-prod-verify.log}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
pass() { log "  [PASS] $*"; }
fail() { log "  [FAIL] $*"; }
warn() { log "  [WARN] $*"; }

check_swagger_disabled() {
    log "Checking Swagger disabled in production..."
    
    # Check main.ts for Swagger conditional
    if grep -q "SWAGGER_ENABLED.*===.*true" backend/src/main.ts; then
        if grep -q "NODE_ENV.*!==.*production" backend/src/main.ts; then
            pass "Swagger condicional: so habilitado se NODE_ENV!=production e SWAGGER_ENABLED=true"
        else
            fail "Swagger pode estar habilitado em producao (falta check NODE_ENV)"
        fi
    else
        fail "Swagger nao encontrado ou configuracao invalida em main.ts"
    fi
    
    # Check package.json for swagger dependencies
    if grep -q "@nestjs/swagger" backend/package.json; then
        warn "@nestjs/swagger presente em dependencies (OK se so dev)"
    fi
}

check_error_sanitization() {
    log "Checking error message sanitization..."
    
    # Check for I18nValidationExceptionFilter
    if grep -q "I18nValidationExceptionFilter" backend/src/main.ts; then
        pass "I18nValidationExceptionFilter registrado globalmente"
    else
        fail "I18nValidationExceptionFilter nao encontrado"
    fi
    
    # Check disableErrorMessages in production
    if grep -q "disableErrorMessages.*NODE_ENV.*production" backend/src/main.ts; then
        pass "disableErrorMessages condicional para producao"
    else
        warn "disableErrorMessages nao condicional (verificar manualmente)"
    fi
    
    # Check for stack traces in error responses
    if grep -r "stack" backend/src/ --include="*.ts" | grep -v test | grep -v ".spec.ts" | head -5; then
        warn "Referencias a 'stack' encontradas no codigo (verificar se nao vazam em prod)"
    else
        pass "Nenhuma referencia direta a stack traces no codigo de producao"
    fi
}

check_health_endpoint() {
    log "Checking health endpoint configuration..."
    
    # Check for health controller
    if [[ -f "backend/src/health/health.controller.ts" ]] || grep -q "/api/health" backend/src/main.ts; then
        pass "Health endpoint configurado"
    else
        warn "Health endpoint nao encontrado explicitamente"
    fi
    
    # Check for Terminus or custom health
    if grep -q "@nestjs/terminus" backend/package.json; then
        pass "@nestjs/terminus instalado"
    elif grep -q "HealthCheck" backend/src/app.module.ts; then
        pass "HealthCheck module configurado"
    else
        warn "Health check implementation nao padronizada"
    fi
}

check_debug_flags() {
    log "Checking debug flags..."
    
    # Check for debug logs in production
    if grep -r "console.log\|console.debug\|console.info" backend/src/ --include="*.ts" | grep -v test | grep -v ".spec.ts" | head -3; then
        warn "console.log/debug/info encontrados no codigo (devem usar Logger do NestJS)"
    else
        pass "Nenhum console.log direto no codigo de producao"
    fi
    
    # Check for DEBUG env usage
    if grep -r "DEBUG=" backend/ --include="*.ts" --include="*.js" | grep -v test | head -3; then
        warn "Variavel DEBUG usada diretamente (preferir Logger do NestJS)"
    fi
}

check_source_maps() {
    log "Checking source maps in production build..."
    
    if grep -q "sourceMap.*true" backend/tsconfig.build.json; then
        warn "sourceMap: true em tsconfig.build.json (deve ser false em prod)"
    else
        pass "Source maps desabilitados em build de producao"
    fi
}

check_env_separation() {
    log "Checking environment separation..."
    
    # Check for .env.production or similar
    if [[ -f ".env.production" ]] || [[ -f "backend/.env.production" ]]; then
        pass "Arquivo .env.production existe"
    else
        warn "Nenhum .env.production encontrado (verificar variaveis de ambiente no deploy)"
    fi
    
    # Check NODE_ENV usage
    if grep -r "process.env.NODE_ENV" backend/src/ --include="*.ts" | head -3; then
        pass "NODE_ENV usado para condicionais de ambiente"
    fi
}

main() {
    log "=== Debug/Production Config Verification Started ==="
    
    check_swagger_disabled
    check_error_sanitization
    check_health_endpoint
    check_debug_flags
    check_source_maps
    check_env_separation
    
    log "=== Verification Completed ==="
}

main "$@"