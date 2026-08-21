#!/usr/bin/env bash
# transitive-deps-review.sh - Auditoria de dependencias transitivas
# Usage: ./transitive-deps-review.sh [backend|frontend|all]

set -euo pipefail

TARGET="${1:-all}"
LOG_FILE="${LOG_FILE:-/var/log/transitive-deps-review.log}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
success() { log "  [OK] $*"; }
warn() { log "  [WARN] $*"; }
error() { log "  [ERROR] $*"; }

# Audit a single package.json
audit_package() {
    local dir="$1"
    local name="$2"
    
    log "=== Auditing $name ($dir) ==="
    
    cd "$dir"
    
    # 1. Full dependency tree
    log "Generating full dependency tree..."
    npm ls --all --depth=999 --json > "/tmp/${name}-deps-tree.json" 2>/dev/null || true
    
    local total_deps
    total_deps=$(jq '[.dependencies // {}, .devDependencies // {} | keys[]] | length' "/tmp/${name}-deps-tree.json" 2>/dev/null || echo "0")
    log "Total direct dependencies: $total_deps"
    
    # 2. Audit with npm audit
    log "Running npm audit (moderate)..."
    npm audit --audit-level=moderate --json > "/tmp/${name}-audit.json" 2>/dev/null || true
    
    local vuln_count
    vuln_count=$(jq '.metadata.vulnerabilities | length' "/tmp/${name}-audit.json" 2>/dev/null || echo "0")
    
    if [[ "$vuln_count" -gt 0 ]]; then
        warn "Found $vuln_count vulnerabilities"
        jq -r '.vulnerabilities[] | "\(.severity): \(.name)@\(.version) - \(.title)"' "/tmp/${name}-audit.json" 2>/dev/null | head -20 | while read line; do
            warn "  $line"
        done
    else
        success "No vulnerabilities found"
    fi
    
    # 3. Check for outdated packages
    log "Checking for outdated packages..."
    npm outdated --json > "/tmp/${name}-outdated.json" 2>/dev/null || true
    
    local outdated_count
    outdated_count=$(jq 'length' "/tmp/${name}-outdated.json" 2>/dev/null || echo "0")
    
    if [[ "$outdated_count" -gt 0 ]]; then
        warn "$outdated_count packages outdated"
        jq -r '.[] | "\(.name): current=\(.current) wanted=\(.wanted) latest=\(.latest)"' "/tmp/${name}-outdated.json" 2>/dev/null | head -10 | while read line; do
            warn "  $line"
        done
    else
        success "All packages up to date"
    fi
    
    # 4. Generate dependency tree report
    log "Generating report..."
    cat > "/tmp/${name}-deps-report.md" <<EOF
# Dependency Audit Report - $name
**Date:** $(date)
**Directory:** $dir

## Summary
- Direct dependencies: $total_deps
- Vulnerabilities found: $vuln_count
- Outdated packages: $outdated_count

## Vulnerabilities
EOF
    
    if [[ "$vuln_count" -gt 0 ]]; then
        jq -r '.vulnerabilities[] | "- **\(.severity)**: \(.name)@\(.version) - \(.title) (CWE: \(.cwe // "N/A"))"' "/tmp/${name}-audit.json" 2>/dev/null >> "/tmp/${name}-deps-report.md"
    else
        echo "No vulnerabilities found." >> "/tmp/${name}-deps-report.md"
    fi
    
    cat >> "/tmp/${name}-deps-report.md" <<EOF

## Outdated Packages
EOF
    
    if [[ "$outdated_count" -gt 0 ]]; then
        jq -r '.[] | "- \(.name): \(.current) -> \(.wanted) (latest: \(.latest))"' "/tmp/${name}-outdated.json" 2>/dev/null >> "/tmp/${name}-deps-report.md"
    else
        echo "All packages up to date." >> "/tmp/${name}-deps-report.md"
    fi
    
    # Copy to docs
    cp "/tmp/${name}-deps-report.md" "../../docs/deps-audit-${name}-$(date +%Y%m%d).md"
    
    success "Report saved to docs/deps-audit-${name}-$(date +%Y%m%d).md"
    
    cd - >/dev/null
}

# Check for transitive vulnerabilities in overrides
check_overrides() {
    local dir="$1"
    local name="$2"
    
    log "Checking overrides in $name..."
    
    cd "$dir"
    
    if jq -e '.overrides' package.json >/dev/null 2>&1; then
        success "Overrides section found"
        jq '.overrides' package.json | jq -r 'to_entries[] | "  \(.key): \(.value)"'
    else
        warn "No overrides section in package.json"
    fi
    
    cd - >/dev/null
}

main() {
    log "=== Transitive Dependency Review Started ==="
    
    case "$TARGET" in
        backend)
            audit_package "backend" "backend"
            check_overrides "backend" "backend"
            ;;
        frontend)
            audit_package "frontend" "frontend"
            check_overrides "frontend" "frontend"
            ;;
        all)
            audit_package "backend" "backend"
            check_overrides "backend" "backend"
            audit_package "frontend" "frontend"
            check_overrides "frontend" "frontend"
            # Root package.json
            if [[ -f "package.json" ]]; then
                audit_package "." "root"
                check_overrides "." "root"
            fi
            ;;
        *)
            error "Usage: $0 [backend|frontend|all]"
            exit 1
            ;;
    esac
    
    log "=== Transitive Dependency Review Completed ==="
    log "Reports saved to docs/deps-audit-*-$(date +%Y%m%d).md"
}

main "$@"