# Checklist Final de Segurança — Verificação por Item

**Data:** 2026-08-22
**Método:** verificação direta no código-fonte + evidências acumuladas da sessão de auditoria
(pentest de shares #40, triagem CodeQL #41, hardening Samba e revisão de SQL injection).
**Veredito:** 13 ✅ · 2 🟡 · 0 🔴 — os dois amarelos são dependências de infraestrutura
(host/rede), já cobertos pelo `docs/GOLIVE-CHECKLIST.md` (Fases 1–2).

| # | Item | Status | Evidência |
|---|---|---|---|
| 1 | Hash de senha | ✅ | Argon2id (`backend/src/constants.ts:25`, memoryCost=128MB/timeCost=4/parallelism=2); access/refresh/share tokens opacos com apenas SHA-256 persistido |
| 2 | Criptografia em repouso | 🟡 | **Segredos sensíveis**: AES-256-GCM (`backend/src/config/jwt-secret-crypto.ts`) ✅ · **Vídeos/DB em disco**: texto claro → exigir LUKS/RAID6 no host (provisionamento) |
| 3 | Criptografia em trânsito | ✅ | TLS via Caddy (Let's Encrypt ou internal CA) + HSTS preload; cookies Secure+httpOnly+sameSite=strict; SMB3 `server smb encrypt = required` (2026-08-22) |
| 4 | Mascaramento de dados | ✅ | Caddy mascara `pwd=` em query string dos logs (SEC-05); `tokenHash` nunca exposto na API; respostas públicas omitem campos de segurança (provado no pentest #40); auditoria não registra senhas |
| 5 | Validação & Sanitização | ✅ | `I18nValidationPipe` global com DTOs class-validator; `safeRedirectPath` blindado contra protocol-relative/control chars (+9 testes — commit c90567c) |
| 6 | Prevenção de SQL Injection | ✅ | Acesso ao banco 100% Prisma parametrizado; 0 ocorrências de `$queryRawUnsafe`/`$executeRawUnsafe`; único SQL raw é health-check estático (`SELECT 1`) e PRAGMA read-only — auditado 2026-08-22 |
| 7 | Prevenção de XSS | ✅ | Escaping nativo do React; único `dangerouslySetInnerHTML` é CSS global estático sem input do usuário (`frontend/src/styles/global.style.tsx`); CSP `default-src 'self'`; alerta CodeQL xss resolvido na triagem #41 |
| 8 | Validação de Upload | ✅ | Allowlist `ALLOWED_EXTENSIONS` (`local.service.ts:54`) + validação de magic bytes (`fileTypeFromBuffer`) + `maxFileSize` por arquivo + upload restrito ao dono autenticado |
| 9 | Gerenciamento de Secrets | ✅ | Docker Secrets (`*_FILE`) no compose prod; `.env*` gitignored + scan anti-segredo no CI (readiness check); segredos GitHub p/ deploy opt-in; senha Samba via smbpasswd prompt/arquivo |
| 10 | Vulnerabilidade de Dependências | ✅ | Gates no CI: `npm audit --audit-level=high` (backend+frontend), osv-scanner com gate jq HIGH/CRITICAL, Trivy na imagem, bloqueio de deps git+/URL |
| 11 | Proteção contra DDoS | 🟡 | **Camada aplicação**: throttler global 100 req/min/IP + limites por rota (share token 20/5min etc.) + fail2ban + rate limit edge Caddy · **Volumétrica**: requer mitigação upstream (ISP/proxy) — decisão de rede on-premise |
| 12 | Firewall & Whitelist | ✅ | UFW default-deny (80/443 abertos, SSH limitado, 445 só RFC1918); Samba `hosts allow` interno + `deny ALL`; CORS origem explícita sem wildcard+credentials; CSP estrito |
| 13 | Logging | ✅ | Logs estruturados com requestId; stack Loki+promtail (`docker-compose.monitoring.yml`); download/view logs (IP, UA, sucesso/falha); `/var/log/samba/audit.log`; Caddy com máscara de senha |
| 14 | Alertas de Atividade Suspeita | ✅ | **33 regras Prometheus** promtool-clean — incl. `AuthFailureSpike`, `AuthFromNewGeo`, `JwtSecretRotationOverdue`, `AdminWithoutMFA`, `AuditLogHashChainBroken`, `AccessReviewOverdue` — roteadas Slack/PagerDuty (#24) + bans fail2ban |
| 15 | Trilhas de Auditoria | ✅ | WORM append-only com hash chain SHA-256 + job diário de integridade fail-closed (#10) + atestações HMAC da revisão de acesso (#11) + view/download logs + VFS full_audit do Samba |

## Itens amarelos — plano de fechamento

1. **#2 Criptografia de disco**: aplicar LUKS sobre a RAID6 no provisionamento do host
   (guia `docs/operacional/HOST-PROVISIONING-ONPREMISE.md` §1) ou validar criptografia
   do volume gerenciado. Verificar na Fase 1 do go-live.
2. **#11 DDoS volumétrico**: como o sistema é **acesso somente interno**, a superfície
   é a LAN da GML — risco residual baixo. Se houver exposição futura via internet,
   colocar proxy/CDN com mitigação à frente antes de abrir portas.
