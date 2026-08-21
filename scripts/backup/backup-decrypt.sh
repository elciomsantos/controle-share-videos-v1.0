#!/usr/bin/env bash
# backup-decrypt.sh - Decrypt backup files encrypted with backup-encrypt.sh
# Usage: ./backup-decrypt.sh <encrypted_file.enc> [output_file]

set -euo pipefail

INPUT_FILE="${1:-}"
OUTPUT_FILE="${2:-${INPUT_FILE%.enc}}"
DEK_FILE="${INPUT_FILE}.dek"

if [[ -z "$INPUT_FILE" ]] || [[ ! -f "$INPUT_FILE" ]]; then
    echo "Usage: $0 <encrypted_file.enc> [output_file]"
    echo "  encrypted_file.enc: File encrypted with backup-encrypt.sh"
    echo "  output_file:        Decrypted output (default: remove .enc extension)"
    exit 1
fi

if [[ ! -f "$DEK_FILE" ]]; then
    echo "ERROR: DEK file not found: $DEK_FILE"
    echo "       Expected alongside encrypted file: ${INPUT_FILE}.dek"
    exit 1
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Decrypt DEK using KMS
log "Decrypting DEK with KMS..."
DEK=$(aws kms decrypt \
    --ciphertext-blob fileb://"$DEK_FILE" \
    --output text \
    --query Plaintext 2>/dev/null | base64 -d)

if [[ -z "$DEK" ]]; then
    echo "ERROR: Failed to decrypt DEK with KMS"
    exit 1
fi
log "DEK decrypted successfully"

# Decrypt file
log "Decrypting $INPUT_FILE -> $OUTPUT_FILE"
if openssl enc -d -aes-256-gcm -in "$INPUT_FILE" -out "$OUTPUT_FILE" -pass pass:"$DEK" 2>/dev/null; then
    log "✅ Decryption successful"
    log "Output: $OUTPUT_FILE ($(stat -c%s "$OUTPUT_FILE" 2>/dev/null || stat -f%z "$OUTPUT_FILE") bytes)"
else
    echo "ERROR: Decryption failed - wrong key or corrupted file"
    rm -f "$OUTPUT_FILE"
    exit 1
fi

log "=== Decryption Complete ==="