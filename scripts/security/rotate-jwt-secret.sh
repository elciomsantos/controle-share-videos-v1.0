#!/usr/bin/env bash
# rotate-jwt-secret.sh - Rotaciona segredo JWT com histórico
# Usage: ./rotate-jwt-secret.sh [--dry-run]
# Requer: Prisma Client, Node.js, acesso ao banco

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================
DATABASE_URL="${DATABASE_URL:-file:/opt/app/backend/data/controle-videos.db}"
SECRET_LENGTH="${SECRET_LENGTH:-64}"  # 512 bits para HS512
DRY_RUN="${1:-}"
LOG_FILE="${LOG_FILE:-/var/log/jwt-rotation.log}"
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
error() { log "${RED}[ERROR]${NC} $*"; }
success() { log "${GREEN}[OK]${NC} $*"; }
warn() { log "${YELLOW}[WARN]${NC} $*"; }

# Gerar novo segredo criptograficamente seguro
generate_secret() {
    openssl rand -base64 "$SECRET_LENGTH" | tr -d '\n'
}

# Rotacionar via Prisma (Node script)
rotate_via_prisma() {
    local new_secret="$1"
    local dry_run="$2"
    
    cat <<'NODE_SCRIPT' > /tmp/rotate-jwt.mjs
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();
const newSecret = process.argv[2];
const dryRun = process.argv[3] === 'true';

async function rotate() {
    try {
        // Buscar config atual
        const current = await prisma.config.findUnique({
            where: { name_category: { name: 'jwtSecret', category: 'internal' } }
        });
        
        const currentSecret = current?.value || '';
        const history = await prisma.config.findUnique({
            where: { name_category: { name: 'jwtSecretHistory', category: 'internal' } }
        });
        const historyArray = history?.value ? JSON.parse(history.value) : [];
        
        // Adicionar segredo atual ao histórico (manter últimos 5)
        const newHistory = [currentSecret, ...historyArray].slice(0, 5);
        
        console.log(`Segredo atual: ${currentSecret.substring(0, 8)}...`);
        console.log(`Novo segredo: ${newSecret.substring(0, 8)}...`);
        console.log(`Histórico terá ${newHistory.length} entradas`);
        
        if (dryRun) {
            console.log('DRY RUN - Nenhuma alteração persistida');
            return;
        }
        
        // Transação atômica
        await prisma.$transaction(async (tx) => {
            // Atualizar segredo atual
            await tx.config.upsert({
                where: { name_category: { name: 'jwtSecret', category: 'internal' } },
                create: { name: 'jwtSecret', category: 'internal', type: 'string', value: newSecret, secret: true, locked: false, order: 10 },
                update: { value: newSecret }
            });
            
            // Atualizar histórico
            await tx.config.upsert({
                where: { name_category: { name: 'jwtSecretHistory', category: 'internal' } },
                create: { name: 'jwtSecretHistory', category: 'internal', type: 'text', value: JSON.stringify(newHistory), secret: true, locked: false, order: 11 },
                update: { value: JSON.stringify(newHistory) }
            });
            
            // Atualizar source (rotação manual)
            await tx.config.upsert({
                where: { name_category: { name: 'jwtSecretSource', category: 'internal' } },
                create: { name: 'jwtSecretSource', category: 'internal', type: 'string', value: 'manual-rotation', secret: false, locked: false, order: 12 },
                update: { value: 'manual-rotation' }
            });
        });
        
        console.log('✅ Rotação concluída com sucesso');
        
    } catch (e) {
        console.error('❌ Erro:', e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

rotate();
NODE_SCRIPT
    
    if [[ "$DRY_RUN" == "--dry-run" ]]; then
        node /tmp/rotate-jwt.mjs "$new_secret" "true"
    else
        node /tmp/rotate-jwt.mjs "$new_secret" "false"
    fi
}

main() {
    log "=== Iniciando rotação de segredo JWT ==="
    
    if [[ "$DRY_RUN" == "--dry-run" ]]; then
        warn "MODO DRY-RUN - Nenhuma alteração será persistida"
    fi
    
    local new_secret
    new_secret=$(generate_secret)
    log "Novo segredo gerado (${#new_secret} chars)"
    
    if rotate_via_prisma "$new_secret" "$DRY_RUN"; then
        success "Rotação de segredo JWT concluída"
        
        if [[ "$DRY_RUN" != "--dry-run" ]]; then
            warn "IMPORTANTE: Reiniciar backend para carregar novo segredo!"
            warn "Sessões existentes permanecerão válidas até expirarem (histórico mantém compatibilidade)"
        fi
        exit 0
    else
        error "Falha na rotação"
        exit 1
    fi
}

main "$@"