# SECURITY REPORT — Controle Share Videos v1.0

> **Fase 4**: Auditoria de segurança (OWASP Top 10)
> **Data**: 2026-08-10
> **Auditor**: Opencode (agente automatizado)
> **Escopo**: Backend guards, JWT, argon2, Docker, Caddy, segredos

---

## 1. Resumo Executivo

| Dimensão | Status |
|---|---|
| OWASP A01 — Broken Access Control | ✅ |
| OWASP A02 — Cryptographic Failures | ✅ |
| OWASP A03 — Injection | ✅ (Prisma parametrizado) |
| OWASP A04 — Insecure Design | ✅ |
| OWASP A05 — Security Misconfiguration | ⚠️ (pequenos ajustes) |
| OWASP A06 — Vulnerable Components | ✅ (npm audit limpo) |
| OWASP A07 — Auth Failures | ✅ (argon2, JWT rotação) |
| OWASP A08 — Data Integrity Failures | ✅ |
| OWASP A09 — Logging Failures | ✅ (AuditLog + Loki) |
| OWASP A10 — SSRF | ✅ |

**Nota geral de segurança**: 8.5/10

---

## 2. Autenticação e Autorização

### 2.1 Guards Globais
- **JwtGuard (fail-closed)** — `backend/src/auth/guard/jwt.guard.ts`
  - Token inválido/ausente → **negação por padrão** (não fail-open)
  - Erro de parsing → bloqueio
- **ThrottlerGuard** — rate limiting global contra brute-force
- **RolesGuard** — RBAC com 4 papéis: ADMIN, AUDITOR, OPERATOR, USER
- **PasswordMustChangeGuard** — força troca de senha no primeiro acesso

### 2.2 Decorators de Papel
- `@Public()` — bypassa JWT para rotas públicas (`/login`, `/share/[:id]/public`)
- `@Authenticated()` — qualquer usuário autenticado
- `@AdminOnly()` — somente ADMIN
- `@AdminOrAuditor()` — auditoria administrativa
- `@OperatorOrAbove()` — operações operacionais

### 2.3 Senhas
- **argon2** para hashing (resistente a GPU/ASIC)
- Senha aleatória por share: `generateRandomPassword()` em `frontend/src/utils/shareId.util.ts`

---

## 3. Rotação JWT Híbrida

**Arquivo**: `backend/src/config/jwt-secret.service.ts`

### Implementação
- **Estratégia híbrida**: `kid` (key id) + timeline
- Cada token inclui `kid` no header
- Backend mantém `Map<kid, secret>` em cache (busca O(1))
- **Mutex** protege estado durante rotação (evita race condition)
- Segredos armazenados com **AES-256-GCM** (authenticated encryption)
- Rotação por timeline (sem interromper tokens em circulação)

### Veredito
Implementação defensável e madura. Permite descontinuar chaves sem invalidar tokens legítimos ativos. Mutex previne condition races durante rotação.

---

## 4. Frontend

### 4.1 Middleware JWT
- `frontend/src/middleware.ts` usa **`jose`** (JOSE spec) para verificação JWT no edge
- Rotas públicas mapeadas explicitamente — tudo else exige token

### 4.2 QAL-06 ✅
- Sem `useRef(language)` em `_app.tsx` (evita stale closure de locale)
- Modais decompostos em componentes isolados

---

## 5. Infraestrutura

### 5.1 Docker
**Arquivo**: `Dockerfile`
- Multi-stage (8 stages) — reduz superficie no bundle final
- Base: `node:24-alpine`
- **Non-root user**: `controle-user` com **UID 1002** ✅
- Sem secrets embutidas em imagem

### 5.2 Docker Compose
**Arquivo**: `docker-compose.prod.yml`
- **Secrets** parabackend/db ✅
- Volumes isolados por serviço
- Networks isoladas (`backend-net`, `frontend-net`)

### 5.3 Caddy Reverse Proxy
**Arquivo**: `reverse-proxy/Caddyfile.prod`
- TLS automático (Let's Encrypt)
- **HSTS** habilitado
- **Filtro `pwd=`** — remove parâmetro de senha da query string/logs
- Headers de segurança (X-Content-Type-Options, X-Frame-Options)

---

## 6. Achados de Segurança

### S-05: Sem CSP Header (MÉDIO)
- **Problema**: Caddy não configura `Content-Security-Policy`
- **Evidência**: `reverse-proxy/Caddyfile.prod` não contém CSP
- **Causa**: Omissão
- **Risco**: XSS não mitigado por CSP (defense in depth incompleta)
- **Prioridade**: **Média**
- **Recomendação**: Adicionar diretiva CSP no Caddyfile permitindo apenas fontes conhecidas (self + Mantine CSS)
- **Implementação sugerida**:
  ```
  header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self';"
  ```

### S-06: Sem rate limiting no Caddy ingress (BAIXO)
- **Problema**: ThrottlerGuard protege a aplicação mas Caddy não aplica rate limit no edge
- **Evidência**: `reverse-proxy/Caddyfile.prod` sem `rate_limit`
- **Risco**: DDoS volumétrico não barrado no edge antes de chegar ao app
- **Prioridade**: **Baixa** — NestJS throttler protege a aplicação
- **Recomendação**: Avaliar `caddy-ratelimit` plugin para proteção edge

### S-01: Segredos via env_file em serviços secundários (BAIXO)
- **Problema**: `docker-compose.prod.yml` usa `env_file` para Caddy/monitoring (não Docker Secrets)
- **Evidência**: `docker-compose.prod.yml` serviços caddy/prometheus
- **Risco**: Segredos em arquivo .env no host (não criptografados em trânsito)
- **Prioridade**: **Baixa** — serviço principal (backend) já usa secrets
- **Recomendação**: Para estágio de hardening avançado, migrar configs de Caddy/monitoring para Docker Secrets

---

## 7. Verificações Executadas

| Verificação | Comando | Resultado |
|---|---|---|
| Prisma validate | `pnpm --filter backend exec prisma validate` | ✅ |
| Lint backend | `pnpm --filter backend lint` | ✅ |
| Testes backend | `pnpm --filter backend test` | ✅ |
| npm audit | `pnpm audit` | ✅ (sem vulnerabilidades) |
| Docker non-root | `grep UID Dockerfile` | ✅ UID 1002 |
| JWT fail-closed | `read jwt.guard.ts` | ✅ |
| Rotas públicas | `grep @Public backend` | ✅ mapeadas |

---

## 8. Conclusão de Segurança

Sistema com postura de segurança **acima da média** para projeto open source fork:
- Fail-closed em todos os guards
- Argon2 + JWT com rotação híbrida AES-256-GCM + mutex
- RBAC fino com 4 papéis e decorators semânticos
- Docker non-root + secrets + networks isoladas
- Caddy com TLS, HSTS, filtro de senha

**Pendências aceitáveis**: CSP no Caddy (S-05) e rate limit edge (S-06) — ambas recomendadas para hardening futuro, não bloqueantes.

**Nota**: 8.5/10

---

*Fim do SECURITY_REPORT.md*
