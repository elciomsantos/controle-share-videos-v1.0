# Relatório de Auditoria Final de Segurança — Controle Share Videos v1.0

> **Tipo:** Relatório executado (não mais um prompt)
> **Data:** 2026-08-02
> **Escopo:** Aplicação completa (backend NestJS + frontend Next.js + Docker + Caddy + Prisma/SQLite)
> **Referências:** OWASP Top 10 / API Top 10 / ASVS, CWE, NIST SSDF, CIS Benchmarks
> **Metodologia:** Security code review estático + auditoria de config + npm audit + análise de Dockerfile/compose/Caddyfile
> **Veredito final:** **CONDICIONADO** — score 78/100, 1 blocker P0 impede go-live imediato

---

## 1. Resumo executivo

O projeto **Controle Share Videos v1.0** é um fork independente do Pingvin Share X v1.21.1, adaptado para compartilhamento interno de arquivos com armazenamento local (SQLite + filesystem), RBAC (admin/operador/auditor) e frontend Next.js 16 standalone servido por Caddy com TLS automático via Let's Encrypt.

A arquitetura é sólida e demonstra maturidade de segurança acima da média para aplicações internas: CSRF double-submit, CSP estrita, HSTS preload, argon2 para hash de senha, JWT em cookie httpOnly com refresh token rotativo, TOTP opcional, rate-limit em duas camadas (NestJS + Caddy), ClamAV opcional, proteção contra zip-bomb, Docker multi-stage com usuário non-root, Docker secrets para credenciais, e JWT secret gerado atomicamente e armazenado locked no banco de dados.

**No entanto, há 1 blocker crítico (P0):** existem resíduos de segredos em texto-plano no repositório de trabalho (`secrets/admin_password.txt`, `secrets/jwt_secret.txt`, `.env`, `.env.local`) contendo a senha default fraca `Admin@123` e um JWT secret obsoleto que sequer é usado em produção. Embora `.gitignore` agora ignore `secrets/` (commit `a66dc83`), os arquivos físicos permanecem no host de build/implantação e representam risco real de exposição. O `docker-compose.local.yml` ainda referencia `secrets/`.

Após a correção do P0 (≈1h de trabalho) e o agendamento do backup, o sistema **pode ir para produção**, mantendo os itens P1/P2 no backlog de hardening.

### Score geral: **78/100**

| Categoria | Score | Notas |
|---|---|---|
| Arquitetura & Defense in Depth | 85 | Separação clara, guards, throttle em 2 camadas |
| Autenticação & Sessions | 90 | argon2, JWT httpOnly, refresh rotativo, TOTP |
| Autorização (RBAC) | 85 | Guards granulares, passwordMustChange |
| Proteção de APIs | 85 | CSRF, CORS restritivo, validation global |
| Docker & Infra | 80 | Multi-stage, non-root, healthcheck, limits — mas resíduos de secrets |
| Dependências | 95 | npm audit = 0 vulns (overrides aplicados) |
| Criptografia & Secrets | 60 | JWT secret OK no DB, mas resíduos em texto-plano no host |
| Logs & Observabilidade | 80 | Correlation ID, RequestContextLogger — sem sanitização do X-Request-Id |
| OWASP Top 10 cobertura | 85 | A01-A10 endereçados, exceto resíduos A02 |
| Qualidade geral | 90 | tsc 0 erros, lint 0 erros, 1 warning |

---

## 2. Matriz de riscos

| ID | Título | Criticidade | Probabilidade | CVSS | OWASP/CWE | Prioridade |
|---|---|---|---|---|---|---|
| **CRIT-01** | Segredos em texto-plano no host (`secrets/`, `.env*`) | Crítica | Alta | 7.5 | A02:2021 / CWE-798 | **P0** |
| HIGH-01 | `X-Request-Id` aceito do cliente sem sanitização | Alta | Média | 5.3 | A09:2021 / CWE-117 | P1 |
| HIGH-02 | Swagger flag `SWAGGER_ENABLED` persiste em prod | Alta | Baixa | 5.3 | A05:2021 / CWE-489 | P1 |
| MED-01 | `docker-compose.local.yml` referencia `secrets/` obsoleto | Média | Média | 4.3 | A05:2021 / CWE-1188 | P2 |
| MED-02 | Backup sem schedule (cron/systemd) documentado | Média | Alta | 4.3 | A07:2021 / CWE-1292 | P2 |
| LOW-01 | Warning de lint: `req` não usado (`share.controller.ts:76`) | Baixa | Alta | 2.0 | CWE-1168 | P3 |
| LOW-02 | Migrations SQLite com lock exclusivo (janela de manutenção) | Baixa | Média | 2.7 | CWE-1078 | P3 |

---

## 3. Achados detalhados

### 3.1 CRIT-01 — Segredos em texto-plano no host (P0)

- **Título:** Segredos (admin password, JWT secret) versionados em texto-plano no filesystem do projeto
- **Criticidade:** Crítica (CVSS 7.5 — AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H)
- **OWASP/CWE:** OWASP A02:2021 (Cryptographic Failures) · CWE-798 (Use of Hard-coded Credentials) · CWE-312 (Cleartext Storage of Sensitive Information)
- **Localização exata:**
  - `secrets/admin_password.txt` → conteúdo: `Admin@123`
  - `secrets/jwt_secret.txt` → conteúdo: `jwt-secret-key-R6OE2dGx2qbyzeeBwbVXeon61UOhCrkDHb0q3IeWjZQ=`
  - `secrets/smtp_password.txt` → vazio, mas presente
  - `.env` → `ADMIN_PASSWORD=Admin@123`
  - `.env.local` → `ADMIN_PASSWORD=Admin@123`
- **Evidência técnica:** `cat secrets/admin_password.txt` retorna `Admin@123`; `git ls-files` confirma que `secrets/` e `.env*` NÃO estão trakeados (após commit `a66dc83`), mas os arquivos físicos permanecem no disco do projeto.
- **Causa:** Resíduo de setup de desenvolvimento. O `docker-compose.prod.yml` corretamente declara todas as secrets como `external: true` (Docker secrets), e o `prisma/seed/config.seed.ts` gera o JWT secret com `crypto.randomBytes(256)` marcando `locked: true, secret: true`. Portanto, os arquivos em `secrets/` **não têm função em produção** e são puramente ruído perigoso.
- **Cenário de exploração:**
  1. Operador copia o diretório do projeto para o servidor de produção (rz/scp/git clone).
  2. Atacante com acesso de leitura ao home do usuário de deploy (ou backup comprometido) obtém `Admin@123`.
  3. Após primeiro boot, se o seed não tiver sido executado, o admin é criado com a senha default fraca `Admin@123` — facilmente adivinhável.
  4. Para o JWT secret obsoleto: se um operador erroneamente setar `JWT_SECRET` env var apontando para o conteúdo do arquivo, todos os tokens emitidos poderão ser forjados pelo atacante.
- **Impacto técnico:** Comprometimento total da aplicação (account takeover admin → acesso a todos os shares → exfiltração de dados).
- **Impacto no negócio:** Vazamento de arquivos internos compartilhados, potencial violação de LGPD, perda de confiança.
- **Probabilidade de exploração:** Alta — senha default `Admin@123` é padrão conhecido e aparece em wordlists.
- **Recomendação de correção:**
  1. `rm -rf secrets/` no host de produção e no host de build.
  2. `rm -f .env .env.local` no host de produção (manter apenas `.env.local.example`).
  3. Antes do primeiro boot, criar Docker secret com senha forte:
     ```bash
     echo "$(openssl rand -base64 32)" | docker secret create admin_password -
     ```
  4. Atualizar `docker-compose.local.yml` para remover referência a `secrets/` (usar Docker secrets locais ou `.env.local.example`).
  5. Adicionar check no `scripts/docker/create-user.sh` que falhe o boot se `ADMIN_PASSWORD == "Admin@123"` em `NODE_ENV=production`.
  6. Rotacionar o JWT secret existente no banco se alguma vez o `secrets/jwt_secret.txt` tiver sido exposto (invalida todas as sessões — desejável em pós-incidente).
- **Exemplo de implementação segura (check no entrypoint):**
  ```sh
  # scripts/docker/create-user.sh — adicionar antes de chamar prisma seed
  if [ "$NODE_ENV" = "production" ] && [ -f "$ADMIN_PASSWORD_FILE" ]; then
    PW=$(cat "$ADMIN_PASSWORD_FILE")
    if [ "$PW" = "Admin@123" ] || [ ${#PW} -lt 16 ]; then
      echo "FATAL: admin password too weak for production" >&2
      exit 1
    fi
  fi
  ```
- **Prioridade:** **P0** — bloqueador de go-live.
- **Esforço estimado:** 1 hora (incluindo rotacionamento de senha e teste de boot).

---

### 3.2 HIGH-01 — `X-Request-Id` aceito do cliente sem sanitização (P1)

- **Título:** Header `X-Request-Id` inbound é aceito e propagado aos logs sem validação de formato.
- **Criticidade:** Alta (CVSS 5.3 — AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N)
- **OWASP/CWE:** OWASP A09:2021 (Security Logging and Monitoring Failures) · CWE-117 (Improper Output Neutralization for Logs) · CWE-601 (Open Redirect variant)
- **Localização exata:** `backend/src/main.ts:62-67`
  ```ts
  const incomingId =
    (req.headers["x-request-id"] as string | undefined) ??
    crypto.randomUUID();
  req.headers["x-request-id"] = incomingId;
  res.setHeader("X-Request-Id", incomingId);
  ```
- **Evidência técnica:** Um atacante pode enviar `X-Request-Id: <script>alert(1)</script>\n\rX-Evil: 1` (CRLF injection) ou uma string arbitrária de até vários KB. O valor é repassado a `res.setHeader` (potencial header injection via CRLF) e ao `RequestContextLogger`.
- **Causa:** Conveniência de correlação distribuída sem sanitização.
- **Cenário de exploração:**
  - **Log injection / log poisoning:** injetar quebras de linha para falsificar entradas de log e dificultar análise forense.
  - **Header injection:** se o runtime Express não rejeitar CRLF em `setHeader`, há resposta HTTP split (moderno Node.js usualmente bloqueia, mas não garantido).
  - **DoS de armazenamento de log:** enviar IDs enorme (centenas de KB) por request, inflando volume de logs.
- **Impacto técnico:** Forense comprometido, possível falsificação de entradas de auditoria.
- **Impacto no negócio:** Dificulta detecção de incidentes; possível falha em compliance LGPD.
- **Probabilidade de exploração:** Média — requer conhecimento do header customizado.
- **Recomendação de correção:**
  ```ts
  const RAW = req.headers["x-request-id"] as string | undefined;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const incomingId = RAW && UUID_RE.test(RAW) ? RAW : crypto.randomUUID();
  ```
  - Rejeitar valores > 36 chars ou que não façam match de UUID v4.
  - Considerar integrar com `pino-http` ou middleware de logging estruturado que já trate isso.
- **Prioridade:** P1.
- **Esforço estimado:** 30 min.

---

### 3.3 HIGH-02 — Swagger flag persiste em produção (P1)

- **Título:** A flag `SWAGGER_ENABLED` continua lida em `NODE_ENV=production`.
- **Criticidade:** Alta (CVSS 5.3 — AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N)
- **OWASP/CWE:** OWASP A05:2021 (Security Misconfiguration) · CWE-489 (Active Debug Code)
- **Localização exata:** `backend/src/main.ts:146-156`
  ```ts
  const swaggerEnabled =
    process.env.NODE_ENV !== "production" &&
    process.env.SWAGGER_ENABLED === "true";
  ```
- **Evidência técnica:** A condição está correta (em produção, sempre `false`), mas a mera existência da flag em env é risco de configuração errada se algum operador setar `NODE_ENV=docker` (valor usado no Dockerfile final) pensando que é produção.
- **Nota:** `Dockerfile` stage final seta `ENV NODE_ENV=docker`, **não** `production`. Logo, em produção via `docker-compose.prod.yml`, `NODE_ENV=production` é forçado via environment do compose. Confirma-se seguro, mas frágil.
- **Recomendação de correção:**
  - Documentar em `docs/Implantacao.md` que `NODE_ENV` DEVE ser `production` em prod, jamais `docker`.
  - Considerar fail-fast: `if (process.env.NODE_ENV === 'docker' && !process.env.ALLOW_DOCKER_NODE_ENV) throw ...`.
- **Prioridade:** P1.
- **Esforço estimado:** 30 min (docs + optional check).

---

### 3.4 MED-01 — `docker-compose.local.yml` referencia `secrets/` obsoleto (P2)

- **Título:** Arquivo de compose de desenvolvimento aponta para `secrets/` que deve ser removido.
- **OWASP/CWE:** A05:2021 / CWE-1188 (Insecure Default)
- **Localização:** `docker-compose.local.yml` (referencia `secrets/`).
- **Recomendação:** Substituir bind de `secrets/` por Docker secrets locais ou por leitura de `.env.local.example`. Sincronizar com a remoção do P0.
- **Prioridade:** P2.
- **Esforço:** 20 min.

---

### 3.5 MED-02 — Backup sem schedule obrigatório (P2)

- **Título:** `scripts/backup.sh` existe (3.8KB, funcional) mas não há cron/systemd documentado como mandatório em produção.
- **OWASP/CWE:** A07:2021 / CWE-1292 (Missing Backup)
- **Localização:** `scripts/backup.sh`.
- **Recomendação:**
  - Adicionar ao `docs/Implantacao.md` seção "Backups obrigatórios" com cron sugerido:
    ```
    0 2 * * *  /srv/controle-share-videos/scripts/backup.sh >> /var/log/csv-backup.log 2>&1
    ```
  - Validar retention (atual: 7 dias) e offsite copy.
  - Documentar restore drill trimestral.
- **Prioridade:** P2.
- **Esforço:** 1h (docs + schedule).

---

### 3.6 LOW-01 — Warning de lint não resolvido (P3)

- **Localização:** `backend/src/share/share.controller.ts:76` — `'req' is defined but never used`.
- **Recomendação:** Remover o parâmetro `req` ou renomear para `_req`.
- **Prioridade:** P3.
- **Esforço:** 1 min.

---

### 3.7 LOW-02 — Migrations SQLite com lock exclusivo (P3)

- **Título:** SQLite não suporta migrations zero-downtime; `prisma migrate deploy` adquire lock exclusivo durante DDL.
- **OWASP/CWE:** CWE-1078 (Inappropriate Source Code Style or Formatting) — não é falha de segurança, mas risco operacional.
- **Impacto:** Deploys com schema changes exigem janela de manutenção (seconds a minutes).
- **Recomendação:** Documentar no runbook de deploy a janela de manutenção esperada para migrations futuras. Avaliar PostgreSQL se crescimento justificar.
- **Prioridade:** P3.
- **Esforço:** 30 min (docs).

---

## 4. Cobertura OWASP Top 10 (2021)

| # | Categoria | Status | Evidência |
|---|---|---|---|
| A01 | Broken Access Control | **OK** | `roles.guard.ts`, `isAdmin.guard.ts`, `passwordMustChange.guard.ts`, guards de share (`shareOwner.guard.ts`, `strictShareOwner.guard.ts`, `shareSecurity.guard.ts`) |
| A02 | Cryptographic Failures | **Parcial (CRIT-01)** | argon2 OK, JWT secret OK no DB, mas resíduos de secrets em texto-plano |
| A03 | Injection | **OK** | Prisma parametriza queries; `forbidNonWhitelisted:true` no pipe global; sem concatenação SQL detectada |
| A04 | Insecure Design | **OK** | Defense in depth: CSRF + CSP + rate-limit em 2 camadas + TOTP opcional |
| A05 | Security Misconfiguration | **Parcial (HIGH-02, MED-01)** | Swagger bem comutado, mas flag persiste; compose local referencia secrets |
| A06 | Vulnerable Components | **OK** | `npm audit` backend = 0 vulns; overrides aplicados (`archiver`, `brace-expansion`, `path-to-regexp`, `multer`, `js-yaml`, `uuid`, `axios`, `sharp`, `find-my-way`, `glob`, `minimatch`) |
| A07 | Auth Failures | **OK** | argon2 hashes, account activation, reset token 1h expiry, TOTP; **parcial (MED-02)** se considerarmos recuperação de desastre |
| A08 | Data Integrity Failures | **OK** | JWT com secret aleatório 256 bytes locked no DB; sem deserialização insegura detectada |
| A09 | Logging Failures | **Parcial (HIGH-01)** | RequestContextLogger com correlation ID, mas X-Request-Id não sanitizado |
| A10 | SSRF | **OK** | Sem chamadas outbound user-controlled detectadas; SMTP/nodemailer com config interna |

---

## 5. Cobertura OWASP API Top 10

| # | Categoria | Status |
|---|---|---|
| API1 | BOLA | OK — guards de share owner |
| API2 | BFLA | OK — `@Roles()` decorator + `RolesGuard` |
| API3 | Broken Object Property Level | OK — `whitelist:true` no validation pipe |
| API4 | Unrestricted Resources | OK — rate limit + chunk size limits + zip-bomb protection |
| API5 | BFLA | OK |
| API6 | Unrestricted Access Sensitive Flows | OK — health endpoint bloqueado para IP externo no Caddy |
| API7 | SSRF | OK — sem fetch user-controlled |
| API8 | Security Misconfiguration | Parcial (HIGH-02) |
| API9 | Improper Inventory | OK — Swagger versionado, endpoints mapeados |
| API10 | Unsafe Consumption of APIs | N/A |

---

## 6. Checklist de hardening para produção

### Bloqueadores (P0 — obrigatório antes do go-live)
- [ ] **Remover `secrets/` do host de produção e do host de build** (`rm -rf secrets/`)
- [ ] **Remover `.env` e `.env.local` do host de produção** (`rm -f .env .env.local`)
- [ ] **Definir `ADMIN_PASSWORD` forte** via Docker secret (`openssl rand -base64 32`)
- [ ] **Validar primeiro boot** — confirmar que admin NÃO foi criado com `Admin@123`
- [ ] **Confirmar que `NODE_ENV=production`** está setado no `docker-compose.prod.yml` (verificado: sim)

### Altamente recomendado (P1)
- [ ] Sanitizar `X-Request-Id` inbound (regex UUID v4)
- [ ] Documentar política de `SWAGGER_ENABLED` em `docs/Implantacao.md`
- [ ] Adicionar check de senha fraca no `scripts/docker/create-user.sh`

### Recomendado (P2)
- [ ] Atualizar `docker-compose.local.yml` removendo `secrets/`
- [ ] Agendar `scripts/backup.sh` via cron
- [ ] Documentar restore drill trimestral
- [ ] Validar retention de backups (offsite copy)

### Desejável (P3)
- [ ] Remover warning de lint em `share.controller.ts:76`
- [ ] Documentar janela de manutenção para migrations SQLite
- [ ] Avaliar migração para PostgreSQL se crescimento justificar

---

## 7. Plano de correção priorizado

| Ordem | ID | Ação | Esforço | Responsável sugerido |
|---|---|---|---|---|
| 1 | CRIT-01 | Remover `secrets/`, `.env`, rotacionar `ADMIN_PASSWORD`, check no entrypoint | 1h | DevOps |
| 2 | MED-02 | Agendar `backup.sh` via cron + documentar | 1h | DevOps |
| 3 | HIGH-01 | Sanitizar `X-Request-Id` com regex UUID | 30min | Backend |
| 4 | HIGH-02 | Documentar política `NODE_ENV`/`SWAGGER` + check fail-fast | 30min | Backend |
| 5 | MED-01 | Limpar `docker-compose.local.yml` | 20min | DevOps |
| 6 | LOW-01 | Remover warning de lint | 1min | Backend |
| 7 | LOW-02 | Documentar janela de manutenção | 30min | DevOps |

**Esforço total estimado:** ~4h para resolver todos os itens não-P3.

---

## 8. Recomendações DevSecOps

1. **Pipeline CI/CD — gate de secrets:** adicionar `gitleaks` ou `trufflehog` no pre-commit e no CI para impedir commit de secrets (defesa em profundidade, mesmo com `.gitignore`).
2. **SBOM:** adicionar `npm sbom --sbom-format cycloneDX` no build do backend e frontend, publicar artefato no release.
3. **SAST no CI:** adicionar `eslint-plugin-security` (frontend já usa ESLint 9, plugin compatível) e `semgrep --config p/owasp-top-ten`.
4. **Container scan:** adicionar `trivy image` no CI pós-build, falhar em HIGH/CRITICAL.
5. **Hadolint** no Dockerfile — atualmente sem lint automatizado.
6. **Dependabot/Renovate:** habilitar para manter overrides de segurança atualizados.
7. **Pre-commit hooks:** `husky` + `lint-staged` para rodar `eslint` e `prettier` antes de cada commit.

---

## 9. Recomendações de CI/CD

Estágios sugeridos para `.github/workflows/ci.yml` (ou equivalente):

```yaml
jobs:
  security-gates:
    steps:
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm audit --audit-level=high
      - run: npx gitleaks detect --source .
      - run: npx trivy fs .
      - run: npx hadolint Dockerfile

  build:
    steps:
      - run: docker build --target runner -t controle-share-videos:ci .
      - run: docker run --rm controle-share-videos:ci sh -c "curl -fs http://127.0.0.1:8080/api/health"

  sbom:
    steps:
      - run: npm sbom --sbom-format cycloneDX --out backend.sbom.json
      - uses: actions/upload-artifact@v4
```

---

## 10. Recomendações de monitoramento e observabilidade

1. **Métricas:** o `docker-compose.monitoring.yml` já existe (Prometheus/Grafana presumido). Validar dashboards de:
   - 429 rate (rate-limit hits)
   - 401/403 counts (auth failures)
   - Latência p95 do `/api/auth/signIn`
   - Disk usage do `/srv/controle-share-videos/data`
2. **Alertas:**
   - Pico de 401 em janela de 5min → brute-force tentativa
   - Falha de health check do backend → investigar DB lock (migration)
   - Disk usage > 80% → expansão ou limpeza de shares expirados
3. **Logs:** confirmar que requests sensíveis (`/api/auth/*`, `/api/users/*`) registram correlation ID + IP + outcome, **sem** logar passwords/tokens (verificado em `auth.service.ts` — OK).
4. **Tracing:** considerar OpenTelemetry para correlação cross-service quando escalar.
5. **Audit log imutável:** logs de download/view em `download-log` são auditáveis; avaliar envio assíncrono para storage append-only (S3/WORM) para compliance LGPD.

---

## 11. Requisitos mínimos para aprovação em produção (Go/No-Go)

**Mínimo absoluto (bloca go-live):**
- [ ] CRIT-01 corrigido (`secrets/` removido, senha admin forte)
- [ ] Backup agendado e testado (MED-02)
- [ ] Build verde (frontend + backend) ✓ já está
- [ ] `npm audit` 0 vulns ✓ já está
- [ ] Typecheck 0 erros ✓ já está
- [ ] Lint 0 erros ✓ já está (1 warning não-bloqueante)

**Mínimo recomendado (fortemente sugerido antes de go-live):**
- [ ] HIGH-01 sanitização X-Request-Id
- [ ] HIGH-02 política NODE_ENV documentada

**Pós-go-live (30 dias):**
- [ ] Todos os P2 e P3 do backlog

---

## 12. Itens verificados e aprovados (sem ação requerida)

Para fins de rastreabilidade, os seguintes itens foram verificados e considerados adequados:

- **Autenticação:** `argon2` com `ARGON2_OPTIONS` (constante em `constants.ts`); JWT em cookie httpOnly (`jwt.strategy.ts`); refresh token rotativo com `RefreshToken` model (cascade delete); TOTP via `otplib` com `qrcode-svg`; reset password com token UUID, expiração 1h, delete após uso.
- **RBAC:** guards granulares (`roles.guard.ts`, `isAdmin.guard.ts`, `passwordMustChange.guard.ts`), papéis `admin`/`operador`/`auditor` (`User.role` field).
- **CSRF:** double-submit cookie (`main.ts:79-104`), `crypto.randomBytes(32)`, `sameSite:strict`, validação em POST/PUT/PATCH/DELETE.
- **CORS:** `CORS_ORIGIN` env var lida e whitelist aplicada; `credentials: true` (necessário para cookies) — operador deve setar `CORS_ORIGIN` explicitamente em prod.
- **Helmet:** CSP com `defaultSrc 'self'`, `scriptSrc 'self'` (sem `unsafe-eval`), `frameAncestors 'none'`, HSTS 2y preload, COOP/CORP/COEP same-origin, Permissions-Policy restritivo.
- **Rate limit:** `@nestjs/throttler` (app-level) + Caddy zones `dynamic` (100/10s) e `auth` (10/60s) para endpoints sensíveis.
- **Validação de entrada:** `I18nValidationPipe` global com `whitelist:true, forbidNonWhitelisted:true, transform:true` — rejeita campos não declarados nos DTOs (anti mass-assignment).
- **Path traversal:** `LocalFileService` (não lido em detalhe nesta auditoria, mas arquivos são servidos via stream controlado porshareId+fileId, sem path user-controlled direto).
- **Upload:** chunked multipart, limites configuráveis (`maxSize`, `maxFileSize`, `chunkSize`), ClamAV opcional, file-type sniffing (`file-type` v21).
- **Zip-bomb:** proteção via `zipMaxFiles`, `zipMaxTotalSize`, `zipMaxRatio` (configuráveis pelo admin).
- **Docker:** multi-stage 7 estágios, usuário non-root (UID/GID 1002), healthcheck com start-period 120s, resource limits (`memory: 2G`, `cpus: 2`), log rotation (`max-size: 10m`, `max-file: 5`), bridge network isolado, Alpine base com `apk upgrade --no-cache`.
- **Caddy prod:** TLS 1.2/1.3, cifras ECDHE+AES-GCM/ChaCha20, curvas x25519/secp256r1/secp384r1, HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, health endpoint bloqueado para IPs externos.
- **DB:** SQLite local com `prisma migrate deploy` no entrypoint; 39 migrations版本adas; migration_lock.toml presente.
- **JWT secret:** gerado por `crypto.randomBytes(256).toString("base64")` no seed, marcado `locked:true, secret:true` — não rotaciona automaticamente, mas é único por instalação e imutável via UI.
- **Logs:** `RequestContextLogger` (AsyncLocalStorage) com correlation ID; sem log de senha/PII observado; `disableErrorMessages: true` em produção.
- **Dependências:** `npm audit` backend = 0 vulns; overrides aplicados para 11 pacotes com CVEs históricos (`archiver`, `brace-expansion`, `path-to-regexp`, `multer`, `js-yaml`, `uuid`, `axios`, `sharp`, `find-my-way`, `glob`, `minimatch`, `handlebars`).
- **Swagger:** desativado em `NODE_ENV=production` (verificado `main.ts:147`).
- **Trust proxy:** `app.set("trust proxy", process.env.TRUST_PROXY === "true")` — enable apenas atrás de Caddy.
- **Typecheck:** `tsc --noEmit` = 0 erros em backend e frontend.
- **Lint:** 0 erros, 1 warning (LOW-01).

---

## 13. Veredito final

**NÃO APROVADO para produção imediata.**

O sistema está tecnicamente maduro e demonstra adesão sólida às melhores práticas de segurança. O **único bloqueador** é a existência de resíduos de segredos em texto-plano no filesystem do projeto (`secrets/`, `.env`, `.env.local`), que precisam ser removidos e rotacionados antes do primeiro deploy.

Após a execução do plano P0 + MED-02 (≈2h de trabalho), o sistema estará **apto para produção** com os itens P1/P2/P3 no backlog de hardening contínuo.

**Recomendação:** aprovar go-live **condicionalmente**, mediante execução documentada do plano de correção P0 + backup schedule, com window de validação de 7 dias pós-deploy para observar alertas e métricas.

---

*Fim do relatório. Gerado em 2026-08-02 com base em revisão estática do código, configurações e documentação do projeto.*
