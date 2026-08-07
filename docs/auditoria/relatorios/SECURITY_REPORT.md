# SECURITY_REPORT.md — Controle Share Videos v1.0

| Campo | Valor |
|---|---|
| Fase de origem | 5 (Segurança) + achados correlatos de 2, 4, 8, 9, 10, 11 |
| Data | 2026-08-04 |
| Status | ✅ Consolidação entregue (correções pendentes de execução — Fase 13) |
| Objeto | Backend NestJS 11 + Prisma 7/SQLite; frontend Next.js 16 + Mantine 9; Docker Compose |

## 1. Introdução

Relatório dedicado de segurança consolidando os achados da Fase 5 (`SEC-01` a `SEC-08`) e os pontos de segurança identificados em outras fases (Fase 2 `BKD-01`, Fase 4 `BDB-01`, Fase 8 `INF-01`, Fase 9 `DOP-02/DOP-07`, Fase 10 `QTS-05`, Fase 11 `DOC-02`). Objetivo: dar ao time um panorama único da superfície de risco, com priorização e correções acionáveis.

## 2. Metodologia

- Revisão de código manual com foco nos caminhos de autenticação/autorização (guards e decorators), upload/scan de arquivos, geração/validação de tokens, e-mails e segurança de cabeçalhos.
- Análise estática: `npm audit` (backend e frontend), override de `postcss` inspecionado.
- Verificação de consistência entre código, documentação e decisões registradas (ex.: ClamAV).
- Classificação de severidade: 🔴 Alto, 🟠 Médio, 🟡 Baixo — conforme evidência e exploração prática (não apenas CVSS).

## 3. Evidências e Achados

### 3.1 Autenticação e Autorização

| ID | Achado | Sev. | Localização | CWE |
|----|--------|------|-------------|-----|
| SEC-01 | `JwtGuard` global com **fail-open**: qualquer erro de auth retorna `allowUnauthenticatedShares`, liberando rotas protegidas sem token | 🔴 | `backend/src/auth/guard/jwt.guard.ts:36-38` | CWE-863 |
| SEC-07 | Rotação de refresh token **não atômica** e sem detecção de reuso | 🟡 | ~~`backend/src/auth/`~~ ✅ pago — `$transaction` + reuse-detection com revogação | CWE-308 |
| SEC-06 | Enumeração de contas via `resendVerification` (oráculo de e-mail) | 🟡 | ~~`backend/src/auth/`~~ ✅ pago — resposta uniforme | CWE-204 |
| SEC-08 | Fail-open documentado na detecção de magic bytes (mime) | 🟡 | ~~`backend/src/file/`~~ ✅ pago — fail-closed + unlink | CWE-434 |

### 3.2 Tokens e Credenciais

| ID | Achado | Sev. | Localização |
|----|--------|------|-------------|
| SEC-03 | Token de redefinição de senha **não expira** (amplia `BKD-01`) | 🟠 | `backend/src/auth/` (reset password) |
| SEC-05 | `includePasswordInShareLink=true` coloca **senha de share na query string** (vazamento em logs/histórico) | 🟠 | `backend/src/share/`; config |
| QTS-05 | Credenciais/URL hardcoded na coleção Newman (`system2@test.org`, senha, `API_URL`) | 🟡 | `backend/test/newman-system-tests.json` |
| DOP-07 | `.dockerignore` **não exclui** `secrets/` nem `.env*` (contexto completo vai ao daemon) | 🟠 | raiz `.dockerignore` |

### 3.3 Upload / Antivírus / Limites

| ID | Achado | Sev. | Localização |
|----|--------|------|-------------|
| SEC-02 | Integração com ClamAV **nunca executada** | 🟠 | ⚪ **Encerrado por decisão formal** (26/07/2026) — `docs/Padronizacao-07-clamav.md`; código, dep e daemon removidos |
| QAL-02 | `ClamScanService` é código morto (consolida SEC-02) | 🟠 | ✅ Resolvido — módulo `backend/src/clamscan/` removido do repositório |
| BDB-01 | `File.size`/`shareSizeLimit` como `String` → `parseInt` gera `NaN` e **ignora cotas** | 🔴 | `schema.prisma:106,21`; `local.service.ts:121-130` |

### 3.4 E-mail e Injeção

| ID | Achado | Sev. | Localização |
|----|--------|------|-------------|
| SEC-04 | Injeção de HTML em e-mails de share quando `email.sendHtmlEmails=true` | 🟠 | ~~`backend/src/mail/`~~ ✅ pago — `common/sanitize.ts` + `email.service.ts` |
| BKD-01 | `resetPassword()` reutilizado em fluxos (amplia SEC-03) | 🟠 | ~~`backend/src/auth/`~~ ✅ pago — TTL 1h validado na redenção |

### 3.5 Dependências e Política

| ID | Achado | Sev. | Localização |
|----|--------|------|-------------|
| INF-01 | `postcss 8.5.18` fixado em `overrides` **dentro da faixa vulnerável**, bloqueando `npm audit fix` (2 moderate) | 🟠 | `frontend/package.json:13` |
| DOC-02 | `SECURITY.md` é stub vazio (sem versões suportadas / canal de disclosure) | 🟠 | `SECURITY.md` (74 bytes) |

## 4. Conclusões

- **1 vulnerabilidade crítica de design (fail-open)**, 6 achados médios e 3 baixos. Não há evidência de exploração ativa, mas o `JwtGuard` fail-open é um bypass de autenticação latente: qualquer falha transitória (token inválido, exceção de service) libera a rota.
- A superfície de tokens (reset sem expiração, senha em query string, refresh sem reuse-detection) concentra o risco de sessão.
- ClamAV existia como "decisão" conflitante (README × `Visao-geral` × código). **Resolvido em 26/07/2026 por decisão formal** (`docs/Padronizacao-07-clamav.md`): integração **rejeitada** — uploads só do owner/operador autenticado, somente mídia de vídeo (não-vetor de execução), destinatários só baixam, overhead de ~1-2 GB RAM + cold start 5-15 min do daemon, incompatível com deploy air-gapped. Código `clamscan`, dependência `clamscan@2.4.0` e daemon `clamav/clamav` **removidos** do repositório e dos compose files.
- A correção de `postcss` está **bloqueada por config própria** (override pinado em versão vulnerável).

## 5. Recomendações (prioridade de execução)

1. **P0 — SEC-01**: fail-closed no `JwtGuard` (relançar `UnauthorizedException`; marcar rotas públicas com `@Public()`). Baixo esforço, elimina bypass.
2. **P0 — BDB-01**: migrar tamanhos para `BigInt` (fecha `NaN` de cota). Requer deploy coordenado.
3. **P1 — SEC-03**: expirar token de reset (TTL + `expiresAt`); corrigir `BKD-01`. ✅ **pago** — TTL 1h validado na redenção.
4. **P1 — SEC-05**: política de compartilhamento sem senha em query string (usar campo POST / header). ✅ **pago** — token via POST `/shares/:id/token` com senha no body.
5. **P1 — INF-01**: remover override de `postcss` para 8.5.22+ e rodar `npm audit fix`. ✅ **pago** — `postcss ^8.5.22`.
6. **P1 — DOC-02**: preencher `SECURITY.md` (versões suportadas + canal de report). ✅ **pago**.
7. **P2 — SEC-04**: sanitizar HTML em e-mails (`sanitize-html` ou só texto). ✅ **pago (2026-08-07)** — `escapeHtml` + `escapeUserInput`.
8. **P2 — SEC-02/QAL-02**: ~~decidir ClamAV (implementar scan real no upload ou remover deps e docs)~~ — **ENCERRADO por decisão formal** (26/07/2026) que rejeita a integração; código, dep `clamscan` e daemon removidos. Alinhamento documental feito. Nenhuma ação técnica restante.
9. **P3 — SEC-06/07/08, QTS-05, DOP-07**: rate-limit de `resendVerification`, transação+reuse-detection no refresh, validar magic bytes de forma fail-closed, mover credenciais Newman para env, excluir `secrets/`/`.env*` do docker context. — *SEC-06, SEC-07 e SEC-08 pagos em 2026-08-07; resta QTS-05 e DOP-07.*

**Próximo passo:** executar itens P0/P1 conforme `REFACTORING_PLAN.md` (R02, R01, R08) e validar com `TEST_PLAN.md`.
