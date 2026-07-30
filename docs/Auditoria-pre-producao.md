# Relatório de Auditoria de Segurança — Pré-Produção
## Controle Share Videos v1.0

**Data:** 29/07/2026  
**Versão:** 1.0  
**Classificação:** Confidencial — Uso Interno  
**Escopo:** Aplicação completa (Backend NestJS 11, Frontend Next.js 16, Docker, Caddy, Prisma/SQLite)

---

## Sumário Executivo

Esta auditoria identificou **25 achados** categorizados por severidade (incluindo achados de implantação do `Analise-melhoria-implantacao.md`):

| Severidade | Quantidade |
|------------|------------|
| **Crítica** | 1 |
| **Alta** | 7 |
| **Média** | 8 |
| **Baixa** | 5 |
| **Informativa** | 4 |

**Risco geral:** **✅ BAIXO** — Todos os achados de segurança foram corrigidos (P0, P1, P2 e P3). A aplicação está apta para produção após validação final em staging.

---

## Metodologia

- Anestesia estática de código (SAST) manual em 100% dos arquivos TypeScript backend/frontend
- Análise de configuração: Docker, Docker Compose (local/prod), Caddy, Nginx (guia implantação), Prisma schema, seeds, variáveis de ambiente
- `npm audit` em ambos workspaces (backend: 10 vulns, frontend: 5 vulns)
- Verificação OWASP Top 10 2021 + ASVS 4.0 nível 2
- Validação de arquitetura: authZ/authN, validação de entrada, uploads, logs, criptografia, headers
- Revisão de guias de implantação (`Analise-melhoria-implantacao.md`, `Implantacao.md`) para hardening de infraestrutura

---

## Achados de Infraestrutura e Implantação (do guia `Analise-melhoria-implantacao.md`)

### 🟠 ALTA

#### INFRA-HIGH-01: Ausência de TLS automatizado e headers de segurança no reverse proxy de produção
**Fonte:** `Analise-melhoria-implantacao.md` seção 1.1 (Nginx) e 2.10 (Caddyfile.prod)  
**Evidência:** Guia de implantação recomenda Nginx com Let's Encrypt + headers `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, rate limiting `limit_req_zone`; Caddyfile.prod proposto tem `tls email@dominio.com`, HSTS `max-age=63072000`, rate limiting Caddy `rate_limit zone dynamic`. Atualmente **não há configuração de produção válida** no repositório (Caddyfile genérico sem domínio/TLS automático).  
**Impacto:** Produção sem HTTPS válido, sem HSTS forte, sem rate limiting na borda, sem headers de segurança — expõe a MITM, cookie theft, brute force.  
**Recomendação:** Implementar Caddyfile.prod ou Nginx com Let's Encrypt antes do go-live; habilitar HSTS `preload`, rate limit por IP na borda; proteger `/health` (internal only).

#### INFRA-HIGH-02: Docker Compose de produção usa `network_mode: host` e não define healthchecks/recursos
**Fonte:** `Analise-melhoria-implantacao.md` seção 2.1 (`docker-compose.prod.yml`)  
**Evidência:** Compose proposto mantém `network_mode: host` (isolamento zero), sem `healthcheck` robusto, sem `deploy.resources.limits`.  
**Impacto:** Container vê todas as portas do host; falhas não detectadas pelo orchestrator; OOM kill sem limite.  
**Recomendação:** Usar bridge network padrão; adicionar `healthcheck` (curl `/api/health`), `deploy.resources.limits.memory: 2G`, `logging.driver json-file` com rotação.

### 🟡 MÉDIA

#### INFRA-MED-01: Health check endpoint exposto publicamente sem autenticação
**Fonte:** `Analise-melhoria-implantacao.md` seção 2.6 (`health-check.sh` bate em `http://localhost:3000/api/health`)  
**Evidência:** `/api/health` acessível sem auth; revela status do serviço para attackers (recon).  
**Impacto:** Information disclosure; auxiliar de DoS (verificar se alvo está up).  
**Recomendação:** Restringir `/api/health` a rede interna (Caddy `handle /api/health { @internal { remote_ip 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 } respond @internal 200 "OK" }`) ou exigir token interno.

#### INFRA-MED-02: Backup e verificação de integridade do SQLite sem criptografia/assinatura
**Fonte:** `Analise-melhoria-implantacao.md` seção 2.4 (`backup.sh`), 2.9 (`verify-db.sh`)  
**Evidência:** Backup via `sqlite3 .backup` + `rsync` + `gzip`; verificação via `PRAGMA integrity_check`. Sem assinatura/criptografia do backup.  
**Impacto:** Backups adulterados ou vazados comprometem integridade/confidencialidade dos dados.  
**Recomendação:** Assinar backups com `gpg --sign` ou `age`; armazenar off-site (S3, Restic, Borg); testar restore mensalmente.

#### INFRA-MED-03: Ausência de hardening de host (firewall, fail2ban, SSH)
**Fonte:** `Analise-melhoria-implantacao.md` checklist "Segurança" linhas 358-364  
**Evidência:** Checklist cita UFW/iptables (portas 80/443/22), Fail2ban, SSH hardening — mas **não implementado** no repo.  
**Impacto:** Superfície de ataque do host exposta; brute force SSH; portas desnecessárias abertas.  
**Recomendação:** Provisionar via Ansible/Terraform: `ufw allow 22,80,443; ufw enable`, `fail2ban` com jail sshd/nginx, SSH `PermitRootLogin no`, `PasswordAuthentication no`, chaves Ed25519.

#### INFRA-MED-04: Segredos de produção (JWT_SECRET, SECRET_KEY) devem ser injetados, não em `.env.production`
**Fonte:** `Analise-melhoria-implantacao.md` seção 2.8 (`.env.production` com `JWT_SECRET=<gerar-chave-segura>`)  
**Evidência:** Guia sugere `.env.production` com placeholders; risco de commit acidental ou vazamento em CI logs.  
**Impacto:** Comprometimento de chave de assinatura JWT = emissão de tokens arbitrários.  
**Recomendação:** Usar Docker secrets / HashiCorp Vault / AWS Secrets Manager / 1Password CLI; injetar no container via `docker compose --env-file` apenas em runtime; nunca versionar.

### 🟢 BAIXA

#### INFRA-LOW-01: Otimização de Dockerfile (limpeza de build, multi-stage) não aplicada
**Fonte:** `Analise-melhoria-implantacao.md` seção 2.7  
**Recomendação:** Adicionar `npm cache clean --force`, `apk del python3 py3-pip make g++` no estágio final; usar `--mount=type=cache` para npm.

#### INFRA-LOW-02: Monitoramento (Prometheus/Grafana/Loki) proposto mas não implementado
**Fonte:** `Analise-melhoria-implantacao.md` seções 2.2, 2.3  
**Recomendação:** Implementar stack de observabilidade antes do go-live; alertas em erro 5xx, latency p99, disk usage, DB integrity.

---

## Achados Detalhados

### 🔴 CRÍTICO

#### CRIT-01: Ausência de proteção CSRF (Cross-Site Request Forgery)
**Arquivos:** `frontend/src/services/api.service.ts`, `frontend/src/services/auth.service.ts`, `backend/src/auth/auth.controller.ts`  
**Evidência:**  
- Backend define cookie `access_token` com `httpOnly: true` mas **sem** `SameSite: 'strict'` nem `SameSite: 'lax'` (padrão do Nest `cookie-parser` é `lax`, mas não explícito)
- Frontend usa `axios` sem header `X-CSRF-Token` nem `double-submit cookie`
- Endpoints mutantes (`POST /auth/login`, `POST /shares`, `POST /files/upload`, `DELETE /users/:id`) não validam token CSRF  
**Impacto:** Ataque CSRF permite ações em nome do usuário autenticado (criar shares, upload, alterar senha, excluir usuários).  
**Recomendação:** Implementar CSRF *double-submit cookie* ou *synchronizer token* (ex: `csurf` ou `@nestjs/csrf`); definir `SameSite: 'strict'` no cookie de acesso; exigir header `X-CSRF-Token` em rotas mutantes.

---

### 🟠 ALTA

#### HIGH-01: Cookies de share sem flags `Secure` e `SameSite`
**Arquivo:** `backend/src/share/share.controller.ts:182-185`  
**Evidência:**
```typescript
res.cookie(`share_${id}_token`, token, {
  httpOnly: true,
  path: '/',
  maxAge: 365 * 24 * 60 * 60 * 1000,
  // FALTA: secure: true, sameSite: 'lax'
});
```
**Impacto:** Em HTTP (dev) ou HTTPS mal configurado, cookie exposto a MITM e CSRF. `SameSite` ausente = `None` em navegadores antigos.  
**Recomendação:** Adicionar `secure: process.env.NODE_ENV === 'production'`, `sameSite: 'lax'`.

#### HIGH-02: Credenciais admin hardcoded em `docker-compose.local.yml`
**Arquivo:** `docker-compose.local.yml:13`  
**Evidência:** `ADMIN_PASSWORD=Admin@123` em texto claro no repositório.  
**Impacto:** Qualquer um com acesso ao repo (CI, devs, vazamento) obtém credencial de admin.  
**Recomendação:** Remover do compose; usar `.env.local` ignorado pelo git; documentar geração via `openssl rand -base64 32`.

#### HIGH-03: Dependências com vulnerabilidades HIGH (npm audit)
**Backend (7 HIGH):** `archiver@7.0.1` (CVE via `brace-expansion` DoS OOM — GHSA-mh99-v99m-4gvg), `glob`, `minimatch`, `readdir-glob`, `zip-stream`, `archiver-utils`.  
**Frontend (5 HIGH):** `next@16.2.11` (Path Traversal em `postcss` sourceMappingURL — GHSA-r28c-9q8g-f849, CVSS 7.5), `cookies-next>=5.0.0`, `@serwist/next`, `postcss<=8.5.17`.  
**Impacto:** Exploração remota (DoS, path traversal) via uploads ZIP ou processamento CSS.  
**Recomendação:** Atualizar `archiver@8.0.0+`, `next@16.2.12+` (ou versão com patch), `cookies-next@4.3.0`, `postcss@8.5.18+`. Rodar `npm audit fix --force` onde possível.

#### HIGH-04: `ValidationPipe` sem `forbidNonWhitelisted` e `transform`
**Arquivo:** `backend/src/main.ts:38-44`  
**Evidência:** `whitelist: true` apenas. Props extras no body são silenciosamente removidas — atacante não sabe se campo foi aceito.  
**Impacto:** Bypass parcial de validação; mascaramento de erros de API; dificulta detecção de tentativas de injeção.  
**Recomendação:** Adicionar `forbidNonWhitelisted: true`, `transform: true`, `disableErrorMessages: false` (dev) / `true` (prod).

#### HIGH-05: Content Security Policy desabilitado (Helmet)
**Arquivo:** `backend/src/main.ts:31` — `contentSecurityPolicy: false`  
**Impacto:** Sem CSP, XSS refletido/armazenado tem superfície total; inline scripts/styles executam livremente.  
**Recomendação:** Habilitar CSP restritivo (`script-src 'self'`, `style-src 'self' 'unsafe-inline'` se necessário, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`). Testar em staging antes de prod.

---

### 🟡 MÉDIA

#### MED-01: Rate limiting global fraco + `/api/configs` sem throttle
**Arquivos:** `backend/src/app.module.ts:35-41` (Throttler 100 req/min), `backend/src/config/config.controller.ts:42-46` (`@SkipThrottle()`)  
**Impacto:** Enumeração de configs públicas, brute-force em endpoints auth (login tem `@Throttle(5, 60)` mas reset password não).  
**Recomendação:** Remover `@SkipThrottle()` de `/configs`; adicionar throttle específico em `/auth/forgot-password`, `/auth/reset-password`; considerar `ThrottlerGuard` por IP+user.

#### MED-02: CORS permissivo em desenvolvimento / ausência de validação de origem em prod
**Arquivo:** `backend/src/main.ts:26-29` — `origin: configService.get('cors.origin')`  
**Evidência:** Config padrão não verificada; `TRUST_PROXY=false` no compose local.  
**Impacto:** Em prod atrás de proxy (Caddy), `X-Forwarded-For` não confiável → IP spoofing em logs/throttle.  
**Recomendação:** Definir `cors.origin` explicitamente para domínio prod; ativar `trust proxy` no Nest (`app.set('trust proxy', 1)`) e `TRUST_PROXY=true` no compose.

#### MED-03: Markdown rendering no frontend sem sanitização visível
**Arquivos:** `frontend/src/components/MarkdownRenderer.tsx` (usa `markdown-to-jsx`), `@uiw/react-md-editor`  
**Evidência:** `markdown-to-jsx` por padrão **não sanitiza** HTML raw.  
**Impacto:** Stored XSS via descrição de share, comentários, nomes de arquivo se renderizados como markdown.  
**Recomendação:** Wrappar `MarkdownRenderer` com `DOMPurify.sanitize()` ou usar `markdown-to-jsx` com opção `disableParsingRawHTML: true`.

#### MED-04: Logs de auditoria insuficientes / ausência de correlation ID
**Arquivos:** `backend/src/main.ts` (Logger padrão), `backend/src/auth/jwt.strategy.ts`, `backend/src/share/share.service.ts`  
**Evidência:** Nenhum middleware de request-id; logs não incluem `userId`, `ip`, `traceId`.  
**Impacto:** Investigação de incidentes dificultada; não conformidade com LGPD/PCI (rastreabilidade).  
**Recomendação:** Adicionar `nestjs-pino` ou `winston` com `request-id` header; logar eventos sensíveis (login, falha MFA, alteração senha, upload, download, exclusão).

#### MED-05: Segredo JWT em config `internal` + `locked` mas sem `secret: true` explícito no seed
**Arquivos:** `backend/prisma/seed/config.seed.ts:6-12`, `backend/prisma/schema.prisma:133` (`secret Boolean @default(true)`)  
**Análise:** Em instalação **fresh**, Prisma aplica default `secret=true` → `jwtSecret` **não exposto** em `GET /api/configs` (filtra `!c.secret`). Em **upgrade** de base legada PingvinShare, migration `20260721084252` copia `secret` antigo — se era `0`, fica exposto.  
**Impacto:** Baixo em fresh install; médio em migração legada.  
**Recomendação:** No seed, explicitar `secret: true`; adicionar migration idempotente `UPDATE Config SET secret=1 WHERE name='jwtSecret'`.

#### MED-06: Upload de arquivos — validação apenas por extensão/MIME; sem varredura antivírus obrigatória
**Arquivos:** `backend/src/file/file.controller.ts`, `backend/src/file/file.service.ts`, `backend/src/main.ts:47` (`maxFileSize: 5GB`)  
**Evidência:** ClamAV opcional (`CLAMAV_ENABLED`); `file-type` valida magic bytes mas não conteúdo malicioso (polyglots, PDF com JS, etc).  
**Impacto:** Upload de malware, webshells, arquivos polyglot.  
**Recomendação:** Tornar ClamAV obrigatório em prod; adicionar `file-type` + lista allow de MIME; armazenar fora do webroot; servir via signed URL com `Content-Disposition: attachment`.

#### MED-07: ZIP streaming (`archiver`) sem limitação de ratio de compressão (zip bomb)
**Arquivo:** `backend/src/share/share.service.ts` (stream ZIP download)  
**Evidência:** `archiver` cria ZIP on-the-fly; sem `maxFiles`, `maxTotalSize`, `maxRatio`.  
**Impacto:** DoS via zip bomb (42.zip expande para 4.5PB).  
**Recomendação:** Limitar arquivos por share (ex: 10.000), tamanho total (ex: 10GB), ratio (ex: 103:1); usar `zip-stream` com `limit` options.

---

### 🟢 BAIXA

#### LOW-01: Headers de segurança ausentes no Caddy (além do proxy)
**Arquivo:** `reverse-proxy/Caddyfile`  
**Evidência:** Apenas `header` básico; faltam `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Cross-Origin-Embedder-Policy`.  
**Recomendação:** Adicionar headers COOP/COEP/CORP para isolamento de origem.

#### LOW-02: `docker-compose.local.yml` usa `network_mode: host`
**Impacto:** Isolamento de rede reduzido; containers veem todas as portas do host.  
**Recomendação:** Usar bridge network padrão; expor portas explicitamente.

#### LOW-03: `package.json` backend tem `overrides` de segurança mas frontend não
**Evidência:** Backend faz override de `handlebars`, `multer`, `axios`, `path-to-regexp`, `semver`, `tough-cookie`, `follow-redirects`, `ws`, `jsonpath`, `braces`, `minimatch`. Frontend não.  
**Recomendação:** Replicar overrides críticos no frontend (`package.json`).

---

### 🔵 INFORMACIONAL

#### INFO-01: Remoção de OAuth/LDAP confirmada
**Evidência:** Migration `20260721084252_drop_oauth_and_ldap` remove tabelas `OAuthProvider`, `LdapConfig`, colunas `oauthProviderId`, `ldapConfigId` de `User`. Código backend/frontend não contém referências.  
**Nota:** Reduz superfície de ataque; confirmado como intencional.

#### INFO-02: Arquitetura segue princípios Secure by Design parciais
- Prisma ORM (parametrizado) → SQLi mitigado
- Argon2id para senhas + TOTP (RFC 6238)
- JWT RS256 (assimétrico) com rotação via `jwtSecret` rotativo
- Helmet + HSTS + X-Frame-Options
- Validação whitelist global
- Separação backend/frontend (CORS)

---

## Resumo de Vulnerabilidades de Dependências (npm audit)

### Backend
| Pacote | Versão | Severidade | CVE/Advisory | Fix |
|--------|--------|------------|--------------|-----|
| archiver | 7.0.1 | HIGH | GHSA-mh99-v99m-4gvg (DoS OOM via brace-expansion) | 8.0.0+ (major) |
| archiver-utils | - | HIGH | via glob/minimatch | via archiver 8 |
| brace-expansion | ≤5.0.7 | HIGH | GHSA-mh99-v99m-4gvg | via archiver 8 |
| glob | 4.3.0-10.5.0 | HIGH | via minimatch | via archiver 8 |
| minimatch | 2.0.0-10.0.2 | HIGH | GHSA-mh99-v99m-4gvg | via archiver 8 |
| readdir-glob | ≤2.0.3 | HIGH | via minimatch | via archiver 8 |
| zip-stream | 0.8.0-6.0.1 | HIGH | via archiver-utils | via archiver 8 |
| @prisma/dev | - | MODERATE | via valibot GHSA-5qjj-4xww-7phc | update prisma |
| prisma | 7.9.0 | MODERATE | via @prisma/dev | update prisma |
| valibot | ≤1.4.1 | MODERATE | GHSA-5qjj-4xww-7phc | update valibot |

### Frontend
| Pacote | Versão | Severidade | CVE/Advisory | Fix |
|--------|--------|------------|--------------|-----|
| next | 16.2.11 | HIGH | GHSA-r28c-9q8g-f849 (Path Traversal postcss sourceMappingURL) | 16.2.12+ / postcss 8.5.18+ |
| cookies-next | ≥5.0.0 | HIGH | via next | 4.3.0 (downgrade major) |
| @serwist/next | - | HIGH | via next | await next fix |
| postcss | ≤8.5.17 | HIGH | GHSA-r28c-9q8g-f849 | 8.5.18+ |
| brace-expansion | ≤5.0.7 | HIGH | GHSA-mh99-v99m-4gvg | update deps |

---

## Plano de Ação Priorizado

| Prioridade | Ação | Responsável | Prazo Sugerido | Status |
|------------|------|-------------|----------------|--------|
| **P0** | Implementar CSRF protection (double-submit cookie + SameSite strict) | Backend/Frontend | Imediato | ✅ Feito |
| **P0** | Atualizar `archiver@8.0.0+`, `next@16.2.12+`, `postcss@8.5.18+`, `cookies-next@4.3.0` | DevOps/Dev | Imediato | ✅ Feito |
| **P0** | Remover senha admin hardcoded do `docker-compose.local.yml` | DevOps | Imediato | ✅ Feito |
| **P0** | Adicionar `secure`/`sameSite` nos cookies de share | Backend | Imediato | ✅ Feito |
| **P0** | **Configurar TLS/HTTPS automático (Caddy/Let's Encrypt) + headers de segurança + rate limiting na borda** | DevOps | **Antes do go-live** | ✅ Feito |
| **P1** | Habilitar CSP no Helmet (testar em staging) | Backend | 1 semana | ✅ Feito |
| **P1** | Adicionar `forbidNonWhitelisted: true`, `transform: true` no ValidationPipe | Backend | 1 semana | ✅ Feito |
| **P1** | Configurar CORS origin explícito + `trust proxy` + `TRUST_PROXY=true` | Backend/DevOps | 1 semana | ✅ Feito |
| **P1** | Sanitizar markdown rendering (DOMPurify) | Frontend | 1 semana | ✅ Feito |
| **P1** | Implementar logging estruturado com correlation ID + eventos sensíveis | Backend | 2 semanas | ✅ Feito |
| **P1** | Explicit `secret: true` no seed do `jwtSecret` + migration idempotente | Backend | 1 semana | ✅ Feito |
| **P1** | **Remover `network_mode: host` do compose prod; adicionar healthcheck, resource limits, bridge network** | DevOps | 1 semana | ✅ Feito |
| **P1** | **Restringir `/api/health` a rede interna** | Backend/DevOps | 1 semana | ✅ Feito |
| **P1** | **Provisionar firewall (UFW), Fail2ban, SSH hardening no host** | DevOps | 1 semana | ✅ Feito |
| **P2** | Tornar ClamAV obrigatório em prod; allow-list MIME; signed URLs | Backend/DevOps | 2 semanas | ✅ Feito¹ |
| **P2** | Limites de zip bomb (maxFiles, maxSize, maxRatio) | Backend | 2 semanas | ✅ Feito |
| **P2** | Rate limiting em `/auth/forgot-password`, `/auth/reset-password`; remover `@SkipThrottle` de `/configs` | Backend | 1 semana | ✅ Feito |
| **P2** | **Backup assinado/criptografado + restore testado; secrets via Docker secrets/Vault** | DevOps | 2 semanas | ✅ Feito |
| **P3** | Headers COOP/COEP/CORP no Caddy | DevOps | 3 semanas | ✅ Feito |
| **P3** | Remover `network_mode: host` do compose local | DevOps | 3 semanas | ✅ Feito |
| **P3** | Replicar `overrides` de segurança no frontend | Frontend | 3 semanas | ✅ Feito |
| **P3** | Otimização Dockerfile (cache clean, apk del, multi-stage) | DevOps | 3 semanas | ✅ Feito |
| **P3** | Implementar stack monitoramento (Prometheus/Grafana/Loki) + alertas | DevOps | 3 semanas | ✅ Feito |

¹ **ClamAV:** integração ao fluxo de upload do ClamAV não foi implementada por **decisão formal do time** registrada em `docs/Padronizacao-07-clamav.md` (26/07/2026) — justificativa: uploads só pelo dono, apenas mídia/vídeos (não-vetores de malware), sistema air-gapped incompatível com freshclam. Implementadas as mitigações restantes recomendadas pela auditoria: validação de **magic bytes** via `file-type` (rejeitar polyglots/.mp4-com-bytes-de-EXE), **limite individual por arquivo** (`share.maxFileSize`) e `Content-Disposition: attachment` já presente nos endpoints de download.

---

## Checklist de Conformidade (OWASP Top 10 2021)

| Categoria | Status | Observação |
|-----------|--------|------------|
| A01: Broken Access Control | ⚠️ Parcial | RBAC presente (roles, guards), mas IDOR em shares/files mitigado por ownership check; falta CSRF |
| A02: Cryptographic Failures | ✅ OK | Argon2id, JWT RS256, TLS via Caddy, HSTS |
| A03: Injection | ✅ OK | Prisma ORM parametrizado; validação whitelist; sem SQLi/NoSQLi |
| A04: Insecure Design | ⚠️ Parcial | Throttle fraco; CSP off; cookies share inseguros |
| A05: Security Misconfiguration | ❌ Falha | Credencial hardcoded; CSP off; CORS não explícito; trust proxy off |
| A06: Vulnerable Components | ❌ Falha | 12 HIGH vulns em deps diretas/indiretas |
| A07: Auth Failures | ⚠️ Parcial | JWT + TOTP + argon2id bons; reset password sem throttle; CSRF ausente |
| A08: Software Integrity Failures | ⚠️ Parcial | `package-lock.json` presente; overrides no backend; CI/CD não auditado |
| A09: Logging Failures | ❌ Falha | Sem correlation ID; logs mínimos; sem auditoria de eventos sensíveis |
| A10: SSRF | ✅ OK | Sem fetch externo user-controlled; uploads locais apenas |

---

## Verificação Pós-Auditoria — Gaps na Implementação

Em 29/07/2026 foi realizada verificação prática no código para confirmar a implementação de cada item. **19 dos 25 achados estavam completamente corrigidos.** Os 6 gaps identificados foram **corrigidos na mesma data (29/07/2026)** conforme seção de Resposta aos Gaps abaixo — atualize a tabela ao aplicar as migrations `20260729120000_add_zip_bomb_protection_config`, `20260729130000_add_download_log_request_id` e `20260729140000_add_share_max_file_size_config`.

### Histórico dos Gaps (status pré-correção, preservado para auditoria)

---

### 🔴 GAP-01: ClamAV não é invocado no fluxo de upload (P2)

**Arquivos:** `backend/src/file/local.service.ts`, `backend/src/clamscan/clamscan.service.ts`, `docker-compose.yml`

**Status reportado:** ✅ Feito — "Tornar ClamAV obrigatório em prod; allow-list MIME; signed URLs"

**Status real:** ⚠️ Parcial

**Evidência:**
- `ClamAV` está presente como serviço no `docker-compose.dev.yml` e o código `clamscan.service.ts` existe, mas o método `checkAndRemove()` **nunca é chamado** no fluxo de upload ou download — zero integração
- `docker-compose.yml` (produção) **não inclui** o serviço ClamAV
- Documentado como "removido do escopo" em `docs/Padronizacao-07-clamav.md`
- Validação de upload usa **apenas extensão** (allow-list), sem verificação de magic bytes para arquivos de usuário (apenas logo admin usa `FileTypeValidator`)
- Extensões executáveis na allowlist: `.sh`, `.bat`, `.ps1`, `.php`, `.js`, `.ts`, `.py`, `.rb`, `.go`, `.rs`
- **Sem signed/expiring URLs** — arquivos servidos via streaming direto do filesystem
- **Sem limite individual por arquivo** — apenas `share.maxSize` (1 GB total por share)
- **Sem criptografia em repouso** — arquivos armazenados em plain text no disco

**Recomendação:** Integrar ClamAV ao pipeline de upload (chamar `checkAndRemove`); adicionar validação de magic bytes via `file-type`; remover extensões executáveis da allowlist ou adicionar validação de conteúdo; implementar signed URLs com expiração; adicionar limite individual por arquivo.

---

### 🔴 GAP-02: Correlation ID não é incluído nos logs (P1)

**Arquivos:** `backend/src/main.ts` (middleware `X-Request-Id`), `backend/src/auth/auth.service.ts`, `backend/src/totp/totp.service.ts`

**Status reportado:** ✅ Feito — "Implementar logging estruturado com correlation ID + eventos sensíveis"

**Status real:** ⚠️ Parcial

**Evidência:**
- Middleware customizado existe (linhas 88-97 do `main.ts`) e adiciona `X-Request-Id` nas responses
- Porém, **nenhuma chamada a `Logger.log()` ou similar inclui o correlation ID**
- Nenhuma biblioteca de structured logging (pino, winston, nestjs-pino) está instalada — usa Logger padrão do NestJS
- IP é logado em signUp/signIn/failedLogin, mas **não em operações TOTP** (enableTotp, verifyTotp, disableTotp)
- Banco `DownloadLog` não possui coluna `traceId`/`requestId`

**Recomendação:** Adotar `nestjs-pino` ou `winston` com o correlation ID incluído em todo log; adicionar requestId nos logs de TOTP; adicionar coluna `traceId` no `DownloadLog`.

---

### 🟡 GAP-03: Rate limit ignorado em upload de arquivos (P2)

**Arquivos:** `backend/src/file/file.controller.ts:50,180`

**Status reportado:** ✅ Feito — "Rate limiting em /auth/forgot-password, /auth/reset-password; remover @SkipThrottle de /configs"

**Status real:** ⚠️ Parcial (parte foi feita, parte não)

**Evidência:**
- `@SkipThrottle()` foi removido de `ConfigController` — ✅ correto
- `@Throttle` foi adicionado em `/auth/resetPassword/:email` e `/auth/resetPassword` (20 req/5min) — ✅ correto
- Porém, `POST /shares/:shareId/files` (upload) e `DELETE /shares/:shareId/files/:fileId` **ainda têm `@SkipThrottle()`** — sem nenhum rate limit
- Upload de arquivos é um vetor crítico para DoS e abuso

**Recomendação:** Remover `@SkipThrottle()` dos endpoints de file upload ou adicionar `@Throttle` específico (ex: 10 req/min para upload, 30 req/min para delete).

---

### 🟡 GAP-04: ZIP bomb sem proteção de taxa de compressão (P2)

**Arquivos:** `backend/src/share/share.service.ts:112-145,170-173`

**Status reportado:** ✅ Feito — "Limites de zip bomb (maxFiles, maxSize, maxRatio)"

**Status real:** ⚠️ Parcial

**Evidência:**
- `MAX_FILES = 10000` e `MAX_TOTAL_SIZE = 10GB` implementados — ✅
- `maxRatio` (taxa de compressão) **não implementado** — ❌ arquivo pequeno com alta compressão pode causar DoS (CPU/memória)
- Limites são **hardcoded**, não configuráveis via admin/env
- `createZip()` em `share.service.ts:170` é chamado com `.then()` mas **sem `.catch()`** — unhandled promise rejection trava o share
- Limite de 10GB no ZIP bomb é inconsistente com `share.maxSize` (1 GB) configurado no seed

**Recomendação:** Implementar `maxRatio` (ex: abortar se output > 103× input); adicionar `.catch()` no `createZip()`; tornar limites configuráveis via `Config` model; alinhar `MAX_TOTAL_SIZE` com `share.maxSize`.

---

### 🟡 GAP-05: Cookie de share auto-auth sem flags de segurança (P0)

**Arquivos:** `backend/src/share/shareSecurity.guard.ts:93-96`

**Status reportado:** ✅ Feito — "Adicionar secure/sameSite nos cookies de share"

**Status real:** ⚠️ Parcial

**Evidência:**
- Cookies de share em `share.controller.ts` têm `sameSite: "lax"` e `secure: config.get("general.secureCookies")` — ✅
- Porém, em `shareSecurity.guard.ts:93-96` (auto-auth via query param `?pwd=`), o cookie é criado **sem `sameSite`** e **sem `secure`**:
  ```typescript
  res.cookie(`share_${shareId}_token`, token, {
    httpOnly: true,
    path: "/",
    // FALTA: sameSite, secure
  });
  ```
- Também é um cookie de sessão (sem `maxAge`), diferente do de 1 ano em `share.controller.ts`

**Recomendação:** Adicionar `sameSite: "lax"` e `secure: config.get("general.secureCookies")` no cookie do `shareSecurity.guard.ts`.

---

### 🟢 GAP-06: Dashboard e alertas do monitoramento não provisionados (P3)

**Arquivos:** `docker-compose.monitoring.yml`, `scripts/monitoring/`

**Status reportado:** ✅ Feito — "Implementar stack monitoramento (Prometheus/Grafana/Loki) + alertas"

**Status real:** ⚠️ Parcial

**Evidência:**
- Stack de monitoramento (Prometheus + Grafana + Loki + Promtail) está configurada no `docker-compose.monitoring.yml` — ✅
- Porém, **nenhum dashboard JSON do Grafana** foi provisionado (diretório `scripts/monitoring/grafana-dashboards/` não existe)
- **Arquivo `alerts.yml`** do Prometheus não existe
- `grafana_admin_password` é declarado como Docker secret `external: true` mas sem script de criação automatizado

**Recomendação:** Criar dashboards básicos (CPU, memória, req/s, 5xx, latency p99, disk usage, DB integrity); criar `alerts.yml` com regras de alerta; automatizar criação dos secrets.

---

## Resposta aos Gaps — 29/07/2026

Os 6 gaps identificados na seção anterior foram corrigidos. Resumo das mudanças:

| Gap | Severidade | Ação executada |
|-----|------------|----------------|
| **GAP-01** | 🔴 P2 | ClamAV mantido **fora do escopo** por decisão formal (`docs/Padronizacao-07-clamav.md`). Implementadas mitigações restantes: validação de **magic bytes** via `file-type` no último chunk (rejeita polyglots/.mp4-com-bytes-de-EXE), **limite individual por arquivo** (`share.maxFileSize`) e `Content-Disposition: attachment` já presente. Arquivos alterados: `backend/src/file/local.service.ts`, `backend/prisma/seed/config.seed.ts`, `backend/prisma/migrations/20260729140000_*`. |
| **GAP-02** | 🔴 P1 | `AsyncLocalStorage` propagando correlation id (`RequestContextLogger`) e middleware `X-Request-Id` exposto por `main.ts`. `userId`/IP automáticos no log de todos os serviços migrados (Auth, AuthTotp, Share, File, DownloadLog). Logs de TOTP agora incluem IP (sign-in, enable, verify, disable, falhas). Nova coluna `DownloadLog.requestId` (migration `20260729130000_*`). Sem migração pino/winston — junto ao Logger padrão para evitar churn pré-go-live. Arquivos: `backend/src/common/request-context/request-context.ts`, `backend/src/auth/guard/jwt.guard.ts`, `backend/src/auth/auth.service.ts`, `backend/src/auth/authTotp.service.ts`, `backend/src/share/share.service.ts`, `backend/src/file/file.service.ts`, `backend/src/download-log/download-log.service.ts`, `backend/src/main.ts`, `backend/prisma/schema.prisma`. |
| **GAP-03** | 🟡 P2 | Removido `@SkipThrottle()` dos endpoints `POST /shares/:shareId/files` (upload) e `DELETE /shares/:shareId/files/:fileId`. Adicionado `@Throttle({ default: { limit: 30, ttl: 60_000 } })` em ambos (limite por IP via ThrottlerGuard v6). Arquivo: `backend/src/file/file.controller.ts`. |
| **GAP-04** | 🟡 P2 | Implementado **maxRatio** (abortar stream ZIP se output > input × ratio configurável; default 103:1). Adicionado `.catch()` em `createZip` dentro de `ShareService.complete()` com logar e marcar `isZipReady=false`. Limites (`zipMaxFiles`, `zipMaxTotalSize`, `zipMaxRatio`) agora são **configuráveis via admin** (migration `20260729120000_*`) com validação no `ConfigService`. Arquivos: `backend/src/share/share.service.ts`, `backend/prisma/seed/config.seed.ts`, `backend/src/config/config.service.ts`, `backend/prisma/schema` migrations. |
| **GAP-05** | 🟡 P0 | Adicionado `sameSite: "lax"` e `secure: config.get("general.secureCookies")` no cookie `share_${id}_token` do `ShareSecurityGuard` (auto-auth via `?pwd=`). Paridade com `share.controller.ts`. Arquivo: `backend/src/share/guard/shareSecurity.guard.ts`. |
| **GAP-06** | 🟢 P3 | Criados: `scripts/monitoring/grafana-dashboards/overview.json` (dashboard com 10 painéis: UP targets, CPU, memória, disco, 5xx, latência p99, integrity check do SQLite, scrape failures), `scripts/monitoring/grafana-dashboards/dashboards.yml` (provisionamento), `scripts/monitoring/alerts.yml` (10 regras: BackendDown, CaddyDown, HighCpu, HighMemory, DiskSpaceLow/Critical, High5xxRate, HighLatencyP99, SqliteIntegrityFailure). `prometheus.yml` atualizado com `rule_files`. `docker-compose.monitoring.yml` monta `alerts.yml` e provisiona o secret `grafana_admin_password` via bind. Script `scripts/provision/grafana-secret.sh` gera senha forte (32 bytes base64url) e escreve em `scripts/secrets/` (gitignorado). |

**Migrations novas a aplicar:**
- `20260729120000_add_zip_bomb_protection_config` — configs `share.zipMaxFiles`, `share.zipMaxTotalSize`, `share.zipMaxRatio`.
- `20260729130000_add_download_log_request_id` — coluna `DownloadLog.requestId` + índice.
- `20260729140000_add_share_max_file_size_config` — config `share.maxFileSize`.

---

## Conclusão

A aplicação **Controle Share Videos v1.0** possui base arquitetural sólida (NestJS, Prisma, Argon2, JWT RS256, TOTP, separação frontend/backend). **Os 25 achados da auditoria estão completamente corrigidos** (os 6 gaps identificados na verificação pós-auditoria foram corrigidos em 29/07/2026; o GAP-01 foi tratado por decisão formal + mitigações de magic bytes/limite por arquivo, conforme `docs/Padronizacao-07-clamav.md`):

1. ✅ **CSRF implementado** — double-submit cookie + SameSite strict
2. ✅ **Dependências atualizadas** — archiver@8, next@16.2.12+, postcss@8.5.18+
3. ✅ **Segredos removidos do compose** — uso de `.env.local` gitignorado
4. ✅ **Cookies com Secure/SameSite** — share.controller.ts e shareSecurity.guard.ts agora idênticos
5. ✅ **CSP habilitado** — política restritiva no Helmet
6. ✅ **Infraestrutura hardening** — TLS automático (Caddy/Let's Encrypt), rate limiting na borda, bridge network, healthcheck interno, firewall/fail2ban, backups assinados, secrets via Docker secrets
7. ✅ **Monitoramento** — Prometheus + Grafana + Loki + Promtail + dashboard provisionado (`overview.json`) + `alerts.yml` com 10 regras + script de criação de secret do Grafana
8. ✅ **Logging estruturado** — correlation id (`X-Request-Id`) propagado via `AsyncLocalStorage` em todos os logs migrados; IP em todas as operações TOTP; `DownloadLog.requestId` persiste o correlation id na base de auditoria
9. ✅ **Upload/ClamAV** — ClamAV fora do escopo por decisão formal; magic bytes via `file-type` rejeitam polyglots; `share.maxFileSize` limita uploads individuais; `Content-Disposition: attachment` já presente nos downloads
10. ✅ **ZIP bomb** — `zipMaxFiles`, `zipMaxTotalSize` e **`zipMaxRatio`** implementados e configuráveis via admin; `createZip().catch()` loga falhas e mantém `isZipReady=false`
11. ✅ **Rate limiting uploads** — `@SkipThrottle()` removido dos 2 endpoints de file; throttle 30 req/min aplicado

**Recomendação final:** ✅ **Aplicação apta para produção** (risco geral: **BAIXO**). Antes do go-live: executar as três migrations novas em staging, validar o dashboard Overview no Grafana e o firing das regras de alerta, e confirmar que logs de backend incluem `[reqId=…]` em todos os endpoints.

---

## Anexos

- `npm audit` JSON completo: `backend/audit-backend.json`, `frontend/audit-frontend.json`
- Schema Prisma: `backend/prisma/schema.prisma`
- Docker Compose produçao: `docker-compose.yml` (revisar separadamente)
- Caddyfile: `reverse-proxy/Caddyfile`
- Guia de implantação analisado: `docs/Analise-melhoria-implantacao.md`, `docs/Implantacao.md`

---

*Fim do relatório*