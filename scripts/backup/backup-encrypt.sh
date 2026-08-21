#!/usr/bin/env bash
# backup-encrypt.sh - Encrypt backup files with AES-256-GCM + KMS envelope encryption
# Usage: ./backup-encrypt.sh <input_file> [output_file]
# Output: <input_file>.enc + <input_file>.enc.dek (encrypted DEK)

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================
KMS_KEY_ID="${KMS_KEY_ID:-arn:aws:kms:us-east-1:123456789012:key/abcd-efgh-1234}"
# =============================================================================

INPUT_FILE="${1:-}"
OUTPUT_FILE="${2:-${INPUT_FILE}.enc}"

if [[ -z "$INPUT_FILE" ]] || [[ ! -f "$INPUT_FILE" ]]; then
    echo "Usage: $0 <input_file> [output_file]"
    echo "  input_file:  File to encrypt"
    echo "  output_file: Encrypted output (default: input_file.enc)"
    exit 1
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Generate Data Encryption Key (DEK) - 256 bits
DEK=$(openssl rand -base64 32)
log "Generated DEK"

# Encrypt file with DEK using AES-256-GCM
log "Encrypting $INPUT_FILE -> $OUTPUT_FILE"
if openssl enc -aes-256-gcm -salt -in "$INPUT_FILE" -out "$OUTPUT_FILE" -pass pass:"$DEK" 2>/dev/null; then
    log "File encrypted successfully"
else
    echo "ERROR: Encryption failed"
    exit 1
fi

# Encrypt DEK with KMS (envelope encryption)
log "Encrypting DEK with KMS key: $KMS_KEY_ID"
ENCRYPTED_DEK=$(aws kms encrypt \
    --key-id "$KMS_KEY_ID" \
    --plaintext "$DEK" \
    --output text \
    --query CiphertextBlob 2>/dev/null)

if [[ -z "$ENCRYPTED_DEK" ]]; then
    echo "ERROR: KMS encryption failed"
    rm -f "$OUTPUT_FILE"
    exit 1
fi

# Save encrypted DEK alongside encrypted file
DEK_FILE="${OUTPUT_FILE}.dek"
echo "$ENCRYPTED_DEK" > "$DEK_FILE"
log "Encrypted DEK saved to: $DEK_FILE"

# Verify encryption by decrypting DEK and testing first 1KB
log "Verifying encryption..."
VERIFIED_DEK=$(aws kms decrypt \
    --ciphertext-blob fileb://"$DEK_FILE" \
    --output text \
    --query Plaintext 2>/dev/null | base64 -d)

if openssl enc -d -aes-256-gcm -in "$OUTPUT_FILE" -pass pass:"$VERIFIED_DEK" | head -c 1024 >/dev/null 2>&1; then
    log "✅ Encryption verified successfully"
else
    echo "ERROR: Verification failed - encrypted file may be corrupted"
    exit 1
fi

log "=== Encryption Complete ==="
log "Encrypted file: $OUTPUT_FILE"
log "Encrypted DEK:  $DEK_FILE"
log "Original size:  $(stat -c%s "$INPUT_FILE" 2>/dev/null || stat -f%z "$INPUT_FILE") bytes"
log "Encrypted size: $(stat -c%s "$OUTPUT_FILE" 2>/dev/null || stat -f%z "$OUTPUT_FILE") bytes"