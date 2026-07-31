# Plano de Correções — Auditoria Hard

**Data:** 31/07/2026
**Escopo:** Correções pendentes identificadas na auditoria `docs/analise-hard.md`
**Base de referência:** `docs/Auditoria-pre-producao.md`, `docs/Padronizacao-04-usuarios-permissoes.md`

---

## Resumo

| Severidade | Quantidade |
|------------|------------|
| Alta (escalonamento de privilégio) | 1 |
| Média | 3 |
| Baixa | 3 |

---

## Ordem de Execução

Seguir estritamente a ordem abaixo. Cada item só é considerado concluído após verificação
(seção "Verificação" do item).

---

## P0 — Criticidade Alta

### 1. Bloquear escrita de auditor em usuários e configuração (A01 Broken Access Control)

**Problema:** O perfil `auditor` (somente-leitura por decisão formal em `Padronizacao-04` §3.5)
tem acesso de escrita no backend, permitindo escalonamento de privilégio:

- `backend/src/user/user.controller.ts:94-117` — `POST/PATCH/DELETE /api/users*` com
  `@Roles("admin", "auditor")`.
  - Auditor pode auto-promover-se: `PATCH /api/users/{id} {"role": "admin"}`. Como
    `JwtStrategy` recarrega o usuário do banco a cada request (`jwt.strategy.ts:26-32`),
    o efeito é imediato, sem re-login.
  - Auditor pode criar usuário admin, editar/excluir qualquer usuário.
- `backend/src/config/config.controller.ts:56,64,70,148,162` — `PATCH /api/configs/admin`,
  `POST /api/configs/admin/testEmail`, `testRedis`, `uploadLogo`, `uploadLogoDark` com
  `@Roles("admin", "auditor")`.
  - Auditor pode alterar flags de segurança (`allowUnauthenticatedShares`, `secureCookies`,
    `includePasswordInShareLink`, limites de tamanho), trocar `smtp.password` e ler
    `smtp.password` em texto claro via `GET /api/configs/admin/smtp`
    (`config.service.ts:120-133` expõe `value` sem mascarar), e enviar e-mails como o SMTP
    da organização via `testEmail`.
- Frontend também expõe tudo para auditor: `frontend/src/pages/admin/index.tsx:35-53`,
  `frontend/src/middleware.ts:113`.

**Correção:**
- [x] `user.controller.ts`: `@Roles("admin")` em `POST /users`, `PATCH /users/:id`,
      `DELETE /users/:id`. `GET /users` volta a `@Roles("admin")` (auditor não vê lista de
      usuários — privacidade).
- [x] `config.controller.ts`: `@Roles("admin")` em todas as rotas de escrita
      (`PATCH admin`, `testEmail`, `testRedis`, `uploadLogo*`). Manter leitura
      (`GET admin/:category`) apenas em `@Roles("admin")` — auditor não acessa config
      (para não ler segredos e nem alterar flags de segurança).
- [x] `user.controller.ts` `GET /users/check-availability` e `GET /users` (se mantiver
      acesso) — confirmar perfil alvo conforme decisão.
- [x] `frontend/src/pages/admin/index.tsx`: menu "Usuários" e "Configurações" visíveis
      somente para `admin`; "Logs" e "Shares de todos" para `admin + auditor`.
- [x] `frontend/src/middleware.ts`: restringir rota `/admin/users` e `/admin/config/*`
      para `role === "admin"`.

> **Executado em 31/07/2026.** Pendente apenas verificação em runtime (403 com conta auditor).

**Verificação:**
- [ ] Com conta `auditor`: `PATCH /api/users/{id} {"role":"admin"}` retorna 403.
- [ ] Com conta `auditor`: `POST /api/users`, `PATCH /api/configs/admin`,
      `GET /api/configs/admin/smtp` retornam 403.
- [ ] Com conta `admin`: fluxos anteriores continuam funcionando (criar/editar usuário,
      editar config).
- [ ] `npm run lint && npm run build` no backend passam.

---

## P1 — Criticidade Média

### 2. Trocar `Math.random()` por `crypto.randomBytes` na geração de senha temporária

**Problema:** `backend/src/user/user.service.ts:34-41` (`generateSecurePassword`) usa
`Math.random()`, gerando senhas de convite previsíveis. `share.service.ts:698` já usa
`crypto.randomBytes` corretamente — replicar o mesmo padrão.

**Correção:**
- [x] Reescrever `generateSecurePassword` usando `crypto.randomBytes` (mesma abordagem de
      `ShareService.generateRandomPassword`), com charset sem caracteres ambíguos.

**Verificação:**
- [ ] Gerar N senhas temporárias via `POST /api/users` e confirmar distribuição e
      imprevisibilidade (sem padrão `Math.random`).
- [ ] `npm run lint` no backend.

---

### 3. Conectar secrets Docker ao bootstrap em produção

**Problema:** `docker-compose.prod.yml:42-47` monta `jwt_secret`, `admin_password`,
`smtp_password` em `/run/secrets/*`, mas nenhum código lê esses arquivos.
`backend/prisma/seed/user.seed.ts:14-16` espera env vars `ADMIN_EMAIL/ADMIN_USERNAME/
ADMIN_PASSWORD` que o compose não define — em deploy prod limpo o usuário admin não é criado.

**Correção:**
- [x] No `docker-compose.prod.yml`, mapear os secrets para env de arquivo:
      `ADMIN_PASSWORD_FILE=/run/secrets/admin_password`,
      `ADMIN_EMAIL_FILE=/run/secrets/admin_email`, `ADMIN_USERNAME_FILE=/run/secrets/admin_username`
      (novos secrets `admin_email` e `admin_username` declarados como `external: true`).
- [x] No `user.seed.ts`, ler `process.env.ADMIN_PASSWORD_FILE` (fallback para
      `ADMIN_PASSWORD`) via `fs.readFileSync`. Aplicado aos três (`ADMIN_EMAIL/ADMIN_USERNAME/ADMIN_PASSWORD`).
- [x] Decidir e documentar a origem do `jwtSecret` de produção (seed randômico do DB vs.
      secret Docker). Se mantido no DB, remover o secret morto `jwt_secret` do compose e
      documentar; se usado, ler o arquivo no bootstrap.
      **Decisão:** mantido o seed randômico do DB (`internal.jwtSecret`, locked). O secret
      morto `jwt_secret` foi removido do `docker-compose.prod.yml` e documentado.

**Verificação:**
- [ ] Deploy prod limpo com `docker secret create` cria o admin automaticamente.
- [ ] `docker compose config` não mostra segredos sem consumidor.

---

### 4. `general.secureCookies` default `true` em produção

**Problema:** `backend/prisma/seed/config.seed.ts:25-28` define `secureCookies: "false"`.
Mesmo atrás de TLS, cookies (`access_token`, `refresh_token`, `share_*_token`,
`csrf_token`) não recebem atributo `Secure` sem configuração manual pós-deploy.

**Correção:**
- [x] No seed, tornar o default dependente do ambiente (ex.: `secureCookies` default
      `"true"` quando `NODE_ENV === "production"`), mantendo `false` em dev.
- [x] Validar impacto em dev local (HTTP) — `secure` só deve ser `true` sob HTTPS.
      (default `false` em dev; installs existentes preservam o valor armazenado no DB.)

**Verificação:**
- [ ] Em ambiente de produção, `Set-Cookie` inclui `Secure` em todos os cookies.
- [ ] Em dev local HTTP, login continua funcionando.

---

## P2 — Criticidade Baixa

### 5. Proteger contagem pública de views e volume do log de auditoria

**Problema:** `GET /api/shares/:id` é público e sem throttle (`share.controller.ts:67-83`);
cada hit de não-dono incrementa `views` e grava `DownloadLog`. Bot pode queimar slots de
`maxViews` e lotar a base de auditoria (`downloadLogRetentionDays` default 0 = sem limpeza).

**Correção:**
- [x] Adicionar `@Throttle` em `GET /api/shares/:id` (e `GET /api/shares/:id/metaData`)
      (30 req/min, usando o throttle global já registrado).
- [x] Avaliar deduplicação de views por IP/UA ou janela temporal curta.
      Implementada dedup por `share+IP+hash(UA)` com janela de 1h via cache.
- [x] Definir um `downloadLogRetentionDays` default não-zero e job de limpeza já existente
      (`jobs.service.ts`) cobrindo o log.
      Default `90` dias; novo cron `0 2 * * *` (`deleteExpiredDownloadLogs`) no `jobs.service.ts`.

**Verificação:**
- [ ] 60+ hits em 1 min retornam 429.
- [ ] Views não inflam com requisições repetidas de um mesmo IP em janela curta.

---

### 6. Comparação TOTP em tempo constante

**Problema:** `backend/src/auth/authTotp.service.ts:159,192` compara o código com `!==`
(timing attack teórico). Mitigado por exigir a senha da conta; `signInTotp` já usa
`otplib.verify` com guardrails.

**Correção:**
- [x] Usar `verify({ token: code, secret, ... })` com guardrails em `verifyTotp` e
      `disableTotp`, ou comparação via `crypto.timingSafeEqual`.
      Usado `otplib.verify` com guardrails (mesmo padrão do `signInTotp`).

**Verificação:**
- [ ] Fluxo de habilitar/verificar/desabilitar TOTP continua funcionando.

---

### 7. (Opcional) Senha admin de desenvolvimento

**Problema:** `.env.local` contém `ADMIN_PASSWORD=Admin@123` (gitignored, uso dev).

**Correção:**
- [x] Trocar por senha forte e documentar geração (`openssl rand -base64 32`).
      Rotacionada em `.env.local` (gitignored).

---

## Check-list Final

**Status em 31/07/2026:** itens 1–7 implementados no código. Verificações de runtime
(403/429/Set-Cookie/deploy/TOTP) ainda pendentes de execução manual.

- [ ] Item 1 concluído e verificado (código ok; falta teste runtime 403 com auditor).
- [ ] Item 2 concluído e verificado (código ok; falta teste distribuição de senhas).
- [ ] Item 3 concluído e verificado (código ok; falta deploy prod limpo com secrets).
- [ ] Item 4 concluído e verificado (código ok; falta checar Set-Cookie em prod e login dev).
- [ ] Item 5 concluído e verificado (código ok; falta teste 429 e dedup de views).
- [ ] Item 6 concluído e verificado (código ok; falta testar fluxo TOTP).
- [x] `npm audit` backend e frontend sem vulnerabilidades.
- [x] `npm run lint` e build backend/frontend passando.
- [ ] Revisão final de `docs/analise-hard.md` marcando itens tratados.
