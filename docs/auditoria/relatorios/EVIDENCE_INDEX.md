# EVIDENCE INDEX — Controle Share Videos v1.0

> **Fase 16b**: Índice reproduzível de evidências
> **Data**: 2026-08-10
> **Auditor**: Opencode (agente automatizado)
> **Objetivo**: Cada verificação da auditoria deve ser reproduzível a partir deste índice.

---

## Evidências por Comando

### E-01: Prisma schema válido
- **Comando**: `pnpm --filter backend exec prisma validate`
- **Resultado**: ✅ Schema valid
- **Arquivo**: `backend/prisma/schema.prisma`

### E-02: Backend lint passing
- **Comando**: `pnpm --filter backend lint`
- **Resultado**: ✅ No errors
- **Arquivo**: `backend/eslint.config.*`

### E-03: Backend test passing
- **Comando**: `pnpm --filter backend test`
- **Resultado**: ✅ All tests passed
- **Runner**: Vitest

### E-04: Frontend test passing
- **Comando**: `pnpm --filter frontend test`
- **Resultado**: ✅ All tests passed
- **Runner**: Vitest

### E-05: npm/pnpm audit limpo
- **Comando**: `pnpm audit --prod`
- **Resultado**: ✅ 0 vulnerabilidades

### E-06: Docker non-root user
- **Comando**: `grep -E "USER|UID" Dockerfile`
- **Resultado**: ✅ `USER controle-user` com `UID 1002`
- **Arquivo**: `Dockerfile`

### E-07: Multi-stage build (8 stages)
- **Comando**: `grep -c "^FROM" Dockerfile`
- **Resultado**: ✅ 8 stages
- **Base**: `node:24-alpine`

### E-08: JwtGuard fail-closed
- **Comando**: `read backend/src/auth/guard/jwt.guard.ts`
- **Resultado**: ✅ `canActivate` retorna `false` em erro (não true)
- **Verificação**: token inválido/ausente → 401/403

### E-09: Rotação JWT híbrida
- **Comando**: `read backend/src/config/jwt-secret.service.ts`
- **Resultado**: ✅ kid + timeline + Map<kid,secret> + mutex + AES-256-GCM
- **Evidência**: rotação não interrompe tokens em circulação

### E-10: RBAC fino com decorators
- **Comando**: `grep -rE "@(Public|Authenticated|AdminOnly|AdminOrAuditor|OperatorOrAbove)\(" backend/src`
- **Resultado**: ✅ Decorators aplicados em controllers

### E-11: ThrottlerGuard global
- **Comando**: `grep -rE "ThrottlerGuard|@Throttle" backend/src`
- **Resultado**: ✅ Guard global + overrides por rota

### E-12: Middleware frontend jose
- **Comando**: `read frontend/src/middleware.ts`
- **Resultado**: ✅ `jose.jwtVerify` com rotas públicas mapeadas

### E-13: Upload concorrente limitado (QAL-06)
- **Comando**: `read frontend/src/utils/concurrency.ts`
- **Resultado**: ✅ `UPLOAD_CONCURRENCY = 3`, `createUploadLimiter()`

### E-14: ShareId utilities
- **Comando**: `read frontend/src/utils/shareId.util.ts`
- **Resultado**: ✅ `generateShareId`, `generateAvailableLink`, `generateRandomPassword`

### E-15: `_app.tsx` sem useRef(language)
- **Comando**: `grep "useRef\|language" frontend/src/pages/_app.tsx`
- **Resultado**: ✅ `pageProps.language` consumido direto

### E-16: ShareService decomposto (R05)
- **Comando**: `ls backend/src/share/`
- **Resultado**: ✅ `ShareMapper`, `ShareArchiveService`, `FileStorageService` extraídos

### E-17: ConfigService tipado (R06)
- **Comando**: `read backend/src/config/config.service.ts`
- **Resultado**: ✅ `ConfigTypeMap` elimina `any`

### E-18: Jobs batching (R04)
- **Comando**: `read backend/src/jobs/jobs.service.ts`
- **Resultado**: ✅ Processamento em batch

### E-19: Caddy TLS + HSTS + filtro pwd
- **Comando**: `read reverse-proxy/Caddyfile.prod`
- **Resultado**: ✅ TLS auto, HSTS header, filtro `pwd=`

### E-20: CI/CD deploy SSH
- **Comando**: `read .github/workflows/ci.yml`
- **Resultado**: ✅ Workflow com ssh deploy + smoke check

### E-21: Monitoring stack
- **Comando**: `read docker-compose.monitoring.yml`
- **Resultado**: ✅ Prometheus + Grafana + Loki

### E-22: 10 models Prisma
- **Comando**: `grep "^model " backend/prisma/schema.prisma`
- **Resultado**: ✅ 10 models (User, Share, ShareSecurity, File, AuditLog, Job, RefreshToken, JwtKid, Config, SystemSetting)

### E-23: Bash scripts de deploy/backup/hardening
- **Comando**: `ls scripts/`
- **Resultado**: ✅ diretórios deploy/, backup/, hardening/

---

## Evidências de Pendências

### E-P01: AuthService decomposto (R01 ✅)
- **Comando**: `ls backend/src/auth/service/`
- **Resultado**: ✅ `login.service.ts`, `token.service.ts`, `refresh.service.ts`, `verification.service.ts` (AuthService orquestrador em `auth.service.ts`)

### E-P02: UploadRepository não extraído (R02)
- **Comando**: `ls backend/src/upload/`
- **Resultado**: ⚠️ Sem diretório `repository/`

### E-P03: Caddy sem CSP
- **Comando**: `grep -i "content-security" reverse-proxy/Caddyfile.prod`
- **Resultado**: ⚠️ Nenhum match

### E-P04: Sem testes E2E
- **Comando**: `ls e2e/ 2>/dev/null || ls tests/e2e/ 2>/dev/null`
- **Resultado**: ⚠️ Não existe

### E-P05: Branch divergente
- **Comando**: `git branch -a | grep fix/producao`
- **Resultado**: ⚠️ `remotes/origin/fix/producao-v1.1.0` existe

---

## Evidências de Limitações Aceitas

### E-L01: SQLite produção
- **Evidência**: `docker-compose.prod.yml` usa SQLite volume
- **Limitação**: Single-writer, sem replica
- **Mitigação**: WAL mode + batching R04 + monitoramento Prometheus
- **Aceito**: Com documentação em ROADMAP v1.3

---

*Fim do EVIDENCE_INDEX.md*
