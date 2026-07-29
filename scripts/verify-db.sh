#!/bin/bash
# =============================================================================
# Database integrity verification script
# INFRA-MED-02: PRAGMA integrity_check
# =============================================================================
set -euo pipefail

DB_FILE="${DB_FILE:-/opt/app/backend/data/controle-videos.db}"

echo "=== Database integrity check ==="
echo "Database: ${DB_FILE}"

if [ ! -f "${DB_FILE}" ]; then
  echo "ERROR: Database file not found at ${DB_FILE}"
  exit 1
fi

# Perform integrity check
RESULT=$(sqlite3 "${DB_FILE}" "PRAGMA integrity_check;")

if [ "${RESULT}" = "ok" ]; then
  echo "Result: ✅ INTEGRITY CHECK PASSED"
  exit 0
else
  echo "Result: ❌ INTEGRITY CHECK FAILED"
  echo "${RESULT}"
  exit 1
fi
