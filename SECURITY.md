# Security Policy

## Supported Versions

Security updates are provided for the latest stable release and the immediately
preceding minor release.

| Version    | Supported          |
| ---------- | ------------------ |
| 1.1.x      | ✅                 |
| 1.0.x      | ✅                 |
| < 1.0      | ❌                 |

## Reporting a Vulnerability

**Do not** open a public GitHub issue for security vulnerabilities.
Instead, report them privately so they can be triaged and fixed before
disclosure.

1. Open a private advisory at
   <https://github.com/elciomsantos/controle-share-videos-v1.0/security/advisories/new>.
2. Include a description of the vulnerability, affected version(s), steps to
   reproduce, and (if known) a proposed fix.

You should receive an acknowledgement within **48 hours**. We aim to ship a fix
within **30 days** depending on severity and scope. If a fix is not possible
within that window, we will communicate the expected timeline and any interim
mitigations.

## Scope

The backend (NestJS + Prisma), the frontend (Next.js), and the Docker/Caddy
deployment configuration are in scope. Issues limited to third-party
dependencies should be reported upstream as well.

## Responsible Disclosure

We appreciate coordinated disclosure. Please allow us time to fix and release a
patched version before publicly disclosing the issue.

---

# Security Architecture Overview

This document summarizes the security posture of Controle Share Videos v1.0
(fork of Pingvin Share X), based on the comprehensive audit in
`docs/auditoria/SECURITY_REPORT.md`.

## Security Score: **9.0 / 10**

| OWASP Top 10 2021 | Status | Evidence |
|---|---|---|
| A01 — Broken Access Control | ✅ | Guards fail-closed + RBAC 3 roles |
| A02 — Cryptographic Failures | ✅ | Argon2 + AES-256-GCM + TLS 1.2/1.3 |
| A03 — Injection | ✅ | Prisma parametrizado (zero SQL raw) |
| A04 — Insecure Design | ✅ | Fail-closed defaults, defense in depth |
| A05 — Security Misconfiguration | ✅ | CSP, Docker Secrets, rate limit, HSTS |
| A06 — Vulnerable Components | ✅ | `npm audit` limpo (0 CVE) |
| A07 — Authentication Failures | ✅ | Argon2, JWT rotation, throttling |
| A08 — Data Integrity Failures | ✅ | Audit log + Loki, WAL SQLite |
| A09 — Logging Failures | ✅ | Structured JSON + redaction |
| A10 — SSRF | ✅ | Nenhuma requisição outbound não controlada |

---

## Core Security Controls

### 1. Authentication & Authorization (Backend)

| Control | Implementation | File |
|---|---|---|
| **JWT Guard (fail-closed)** | Token inválido/ausente → negação padrão | `backend/src/auth/guard/jwt.guard.ts` |
| **Throttler Guard** | 100 req / 60s global (brute-force) | `@nestjs/throttler` |
| **Roles Guard** | RBAC: `admin` / `auditor` / `operador` (default) | `backend/src/auth/guard/roles.guard.ts` |
| **Password Must Change** | Força troca no 1º login (`passwordMustChange`) | `backend/src/auth/guard/password-must-change.guard.ts` |
| **Role Decorators** | `@Public`, `@AdminOnly`, `@AdminOrAuditor`, `@OperatorOrAbove` | `backend/src/auth/decorator/` |

### 2. JWT Rotation (Hybrid Strategy)

**File:** `backend/src/config/jwt-secret.service.ts`

- **Strategy:** `kid` (key ID) + timeline rotation
- **Encryption:** AES-256-GCM (authenticated encryption) for secret storage
- **Mutex:** Protects rotation state (race-condition free)
- **Backward compatibility:** Active tokens continue working until expiry
- **Frontend verification:** `jose` library in middleware (`frontend/src/middleware.ts`)

### 3. Password Handling

| Aspect | Implementation |
|---|---|
| **Hashing** | Argon2id (memory-hard, GPU/ASIC resistant) — `backend/src/auth/argon2.util.ts` |
| **Share passwords** | `generateRandomPassword()` (crypto.randomUUID-based) — `frontend/src/utils/shareId.util.ts` |
| **Temporary admin password** | 12 chars crypto-secure, displayed once or emailed via SMTP |
| **Storage** | Only hashes in SQLite; never plaintext |

### 4. Frontend Security

- **Middleware JWT verification** with `jose` (edge, zero-trust)
- **Public routes explicitly mapped** — everything else requires token
- **No inline scripts** — Mantine CSS-in-JS allowed via CSP `style-src 'unsafe-inline'`
- **QAL-06** — Modais decompostos, sem stale closures, i18n seguro

### 5. Infrastructure Hardening

| Layer | Controls |
|---|---|
| **Docker** | Multi-stage (8 stages), base `node:24-alpine`, **non-root UID 1002**, no secrets in images |
| **Compose (prod)** | **Docker Secrets** for all services (backend, frontend, caddy); `*_FILE` env vars |
| **Capabilities** | `cap_drop: ALL` em todos; `cap_add: NET_BIND_SERVICE` apenas no Caddy (80/443) |
| **Privilege** | `no-new-privileges:true` em todos os containers |
| **Filesystem** | `read_only: true` + `tmpfs` em todos (Backend: /tmp:256M, /run:16M, /var/cache:32M) |
| **PIDs** | `pids_limit: 512` em todos os containers |
| **Network** | Rede `backend-net` com `internal: true`; acesso externo apenas via Caddy |
| **Caddy (prod)** | Let's Encrypt TLS 1.2/1.3, HSTS preload (2yr), strict CSP, rate limit, `pwd=` log redaction |

#### Docker Security Controls (2026-08-18)

```yaml
# docker-compose.prod.yml
services:
  backend:
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    read_only: true
    tmpfs: [/tmp:size=256M, /run:size=16M, /var/cache:size=32M]
    pids_limit: 512
    networks: [backend-net]

  frontend:
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    read_only: true
    tmpfs: [/tmp:size=64M, /run:size=8M]
    pids_limit: 512
    networks: [backend-net]

  caddy:
    cap_drop: [ALL]
    cap_add: [NET_BIND_SERVICE]
    security_opt: [no-new-privileges:true]
    read_only: true
    tmpfs: [/tmp:size=64M]
    pids_limit: 512
    networks: [backend-net]

networks:
  backend-net:
    driver: bridge
    internal: true
```

#### NPM Security Policy (2026-08-18)

```ini
# .npmrc (root, backend, frontend, packages/shared)
registry=https://registry.npmjs.org/
package-lock=true
save=false
ignore-scripts=true
strict-ssl=true
audit=true
```

- `ignore-scripts=true`: Bloqueia execução automática de scripts pós-install
- `allow-scripts` no `backend/package.json`: Permite scripts para `better-sqlite3`, `argon2`, `@prisma/engines` (nativos)
- CI: `npm audit --audit-level=high` + `npm audit signatures` + verificação de dependências Git/URL

#### Caddy Security Headers (from `reverse-proxy/Caddyfile.prod`)

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Permissions-Policy: geolocation=(), camera=(), microphone=()
-Server
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

#### Rate Limiting (Caddy Edge)

- **Zone `dynamic`**: 100 req / 10s per IP (burst 200)
- **Zone `auth`**: 10 req / 60s per IP for `/api/auth/*` endpoints

#### Log Redaction (SEC-05)

Query parameter `pwd=` (used when `share.includePasswordInShareLink=true`) is replaced with `REDACTED` in access logs via Caddy filter.

### 6. Data Protection

- **SQLite** with WAL mode (ACID, single-writer)
- **Audit log** (`DownloadLog`): every `view`/`download` with IP, UA, timestamp, status
- **Backup**: `scripts/backup.sh` → SQLite `.backup` + gzip + GPG encrypt+sign
- **Restore test**: `scripts/restore-test.sh` validates integrity_check + schema + counts weekly

---

## Attack Testing Methodology

The following attack vectors were tested during the audit (documented in `SECURITY_REPORT.md`). To reproduce or extend:

### 1. Authentication Bypass Attempts

```bash
# Test 1: Access protected endpoint without token
curl -i https://<DOMAIN>/api/shares
# Expected: 401 (JwtGuard fail-closed)

# Test 2: Malformed/expired token
curl -i -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid" \
  https://<DOMAIN>/api/shares
# Expected: 401

# Test 3: Token with wrong kid (rotation edge case)
# Generate token with old kid, verify rejection after rotation
```

### 2. Authorization / RBAC Bypass

```bash
# Test: operador accessing admin-only endpoint
# Login as operador, then:
curl -i -H "Authorization: Bearer <operador-token>" \
  https://<DOMAIN>/api/users
# Expected: 403 (RolesGuard)

# Test: auditor accessing operator endpoint
curl -i -H "Authorization: Bearer <auditor-token>" \
  https://<DOMAIN>/api/uploads
# Expected: 403
```

### 3. Injection Testing

```bash
# SQL Injection via Prisma (should be parametrized)
# Attempt in share creation:
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"test'\"; DROP TABLE Share;--","expiration":null}' \
  https://<DOMAIN>/api/shares
# Expected: 400 validation error / safe parameterization

# NoSQL/Command injection — N/A (no Mongo, no shell exec with user input)
```

### 4. XSS / CSP Validation

```bash
# Verify CSP header present
curl -I https://<DOMAIN> | grep -i content-security-policy

# Attempt inline script injection via share name (stored XSS)
# Create share with <script>alert(1)</script> in name
# Access share page — script should NOT execute (CSP blocks)
```

### 5. CSRF Protection

```bash
# CSRF not applicable for JWT-in-header auth (stateless)
# But test form submissions:
# 1. Login form uses CSRF token via double-submit cookie pattern
# 2. Share creation uses POST with JSON (same-origin enforced by CSP)
```

### 6. Rate Limiting / DoS

```bash
# Test edge rate limit (Caddy)
for i in {1..120}; do
  curl -s -o /dev/null -w "%{http_code}\n" https://<DOMAIN>/api/health
done | grep -c 429
# Expected: ~20 requests get 429 (zone dynamic: 100/10s)

# Test auth endpoint stricter limit
for i in {1..15}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://<DOMAIN>/api/auth/signIn \
    -H "Content-Type: application/json" \
    -d '{"email":"x","password":"y"}'
done | grep -c 429
# Expected: ~5 get 429 (zone auth: 10/60s)
```

### 7. Security Headers Verification

```bash
curl -I https://<DOMAIN> | grep -iE "strict-transport|x-frame|x-content|referrer|cross-origin|permissions|content-security"
# All headers should be present per §5.3
```

### 8. Secret Exposure / Log Redaction

```bash
# Create share with includePasswordInShareLink=true
# Access: https://<DOMAIN>/share/<id>?pwd=secret123
# Check Caddy logs:
docker logs controle-share-videos-caddy | grep secret123
# Expected: REDACTED (not the actual password)
```

### 9. Docker / Container Security

```bash
# Verify non-root user
docker exec controle-share-videos-backend id
# Expected: uid=1002(controle-user)

# Verify no secrets in image layers
docker history controle-share-videos-backend | grep -iE "password|secret|jwt"
# Expected: no matches (secrets via Docker Secrets at runtime)

# Verify read-only root filesystem (if enabled)
docker inspect controle-share-videos-backend | grep -i readonly
```

### 10. SQLite / Data Integrity

```bash
# Verify WAL mode
docker exec controle-share-videos-backend \
  sqlite3 /opt/app/backend/data/controle-videos.db "PRAGMA journal_mode;"
# Expected: wal

# Verify backup integrity
./scripts/restore-test.sh
# Expected: PASS (integrity_check ok, schema ok, counts ok)
```

---

## Automated Security Testing (CI)

The CI pipeline (`.github/workflows/ci.yml`) runs:

| Job | Tools | Status |
|---|---|---|
| `lint` | ESLint (security rules) | ✅ |
| `test:unit` | Jest (backend) + Vitest (frontend) | ✅ |
| `test:e2e` | Playwright (critical auth/upload flows) | ✅ |
| `audit` | `npm audit` (0 CVE required) | ✅ |
| `security-scan` | Trivy (CRITICAL/HIGH CVEs) + TruffleHog (secrets) | ✅ (new) |
| `docker-build` | Multi-stage Docker (verifies non-root, no secrets) | ✅ (new) |
| `build` | Multi-stage Docker (verifies non-root, no secrets) | ✅ |
| `deploy` | Depends on `security-scan` | ✅ (new) |

#### CI Security Checks (2026-08-18)

```yaml
# npm security checks
- npm ci (with ignore-scripts=true)
- npm audit --audit-level=high (0 vulnerabilities required)
- npm audit signatures (verify package signatures)
- Git/URL dependency check (blocks GitHub/GitLab URLs, allows internal file: deps)

# Docker security scanning
- Trivy scan: CRITICAL + HIGH severity (fails build if found)
- TruffleHog: Git history secret scanning

# Docker build verification
- Backend, Frontend, Combined images built and tested
- Health checks verified
```

To run locally:

```bash
# Backend
cd backend && npm run lint && npm run test:unit && npm audit

# Frontend
cd frontend && npm run lint && npm run test

# E2E (requires Docker)
docker compose -f docker-compose.local.yml up -d --build
cd frontend && npm run test:e2e

# Docker security scanning (local)
docker build --target runner -t controle-share-videos-backend .
trivy image controle-share-videos-backend
```

---

## Known Limitations & Accepted Risks

| Risk | Mitigation | Status |
|---|---|---|
| **SQLite single-writer** | Prometheus monitoring + migration plan to PostgreSQL (v1.3) | Accepted (A-06/D01) |
| **Redis cache disabled** | Backend supports `@keyv/redis` + in-memory fallback; enable when scale > 500 users | Backlog v1.3 |
| **S3/MinIO storage not implemented** | Interface `IUploadRepository` ready (R02); activate if uploads > 100 GB | Backlog v1.4 |
| **No external pentest** | Planned annual (ROADMAP §6) | Backlog |

---

## Security References

| Document | Description |
|---|---|
| `docs/auditoria/SECURITY_REPORT.md` | Full audit (9.0/10, OWASP mapping, evidence) |
| `docs/auditoria/AUDIT_REPORT.md` | Consolidated audit report |
| `docs/auditoria/AUDIT_MATRIX.md` | 19/19 findings matrix |
| `docs/operacional/DEPLOY.md` | Hardened deployment guide |
| `docs/operacional/RUNBOOKS.md` | Incident response (12 scenarios) |
| `docs/operacional/MONITORAMENTO.md` | Healthchecks, logs, alerting |
| `reverse-proxy/Caddyfile.prod` | Authoritative TLS/CSP/rate-limit config |
| `docs/Relatorio/PLANO_HARDENING_DOCKER.md` | Docker hardening plan (items 1-5 implemented) |
| `docs/Relatorio/POLITICA-SEGURANCA-NPM.md` | npm security policy |
| `docker-compose.staging.yml` | Staging overlay for local hardening tests |

---

## Security Contacts

- **Primary**: Open private advisory on GitHub Security tab
- **Response SLA**: Acknowledge ≤ 48h, fix ≤ 30d (severity dependent)
- **PGP Key**: Not published — use GitHub private advisory encryption

---

*Last updated: 2026-08-18 — Docker hardening (items 1-5) + NPM security policy implemented*