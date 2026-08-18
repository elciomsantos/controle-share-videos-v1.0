# CHANGELOG — Controle Share Videos v1.0

> **Fase 17**: Registro de mudanças
> **Data**: 2026-08-10
> **Auditor**: Opencode (agente automatizado)
> **Comparação**: Conforme decisão do usuário, **não comparar com baseline anterior**. Foco em estado atual para go-live.

---

## v1.2.15 — Botão "Fechar" no modal de editar usuário (/admin/users) (2026-08-18)

### Resumo
Após a troca de senha de outro usuário o modal permanece aberto (com o `Alert` de confirmação); o usuário pediu um botão para fechá-lo. Adicionado o botão **"Fechar"** ao lado do "Salvar" no rodapé do modal, que apenas fecha o modal (`modals.closeAll()`). O "Salvar" (dados de conta) foi mantido.

### Correção aplicada
- **`frontend/src/components/admin/users/showUpdateUserModal.tsx`**: botão "Fechar" (`variant="subtle"`, `type="button"`, `onClick={() => modals.closeAll()}`) junto ao "Salvar".
- **`frontend/src/i18n/translations/pt-BR.ts`**: chave `common.button.close` = "Fechar".

### Validado
- `tsc --noEmit`/`eslint` frontend limpos; rebuild da imagem frontend no Docker.
- Navegador: rodapé do modal exibe "Salvar nova senha", "Fechar" e "Salvar"; "Fechar" fecha o modal.

---

## v1.2.14 — Admin não altera a própria senha via /admin/users + mensagem de sucesso visível (2026-08-18)

### Resumo
Após o v1.2.13, o usuário pediu 3 ajustes no painel `/admin/users`: (1) impedir que o admin troque a **própria** senha por esse canal; (2) manter habilitada a troca/reset de senha de **outros** usuários (senha esquecida); (3) consertar a mensagem de confirmação que não aparecia (a mesma reclamação do v1.2.13 tinha outra camada: o toast de sucesso existia no DOM mas ficava **invisível**).

### Causa raiz da mensagem invisível
`_app.tsx` importava `@mantine/core/styles.css` mas **não** `@mantine/notifications/styles.css`. Sem o CSS, o container de notificações renderizava `position: static` no rodapé do fluxo da página — **atrás do overlay do modal** (z-index 201) — em vez de `position: fixed` (z-index 400) no canto da tela. O CSS existe no pacote (`node_modules/@mantine/notifications/styles.css`). Isso também afetava os toasts em `/account/change-password`.

### Correções aplicadas
- **`frontend/src/pages/_app.tsx`**: importa `@mantine/notifications/styles.css` (corrige a posição/visibilidade dos toasts).
- **`frontend/src/components/admin/users/showUpdateUserModal.tsx`**: quando `currentUser?.id === user.id` (admin editando a si mesmo), o acordeão "Alterar senha" é **substituído** por um texto informativo apontando para a página "Trocar senha" da própria conta. Para outros usuários o acordeão permanece (reset de senha esquecida). Adicionado `Alert` verde inline de sucesso dentro do painel (além do toast) após a troca.
- **`frontend/src/i18n/translations/pt-BR.ts`**: chave `admin.users.edit.update.change-password.self` (texto de bloqueio).
- **`backend/src/user/user.controller.ts`**: guarda de defesa em profundidade no `PATCH /users/:id` — se `id === currentUser.id && user.password`, lança `ForbiddenException` (`i18n auth.cannotChangeOwnPassword`). O bloco da UI já impede o fluxo; o guard protege o endpoint diretamente.
- **`backend/src/i18n/pt-BR/auth.json`**: chave `cannotChangeOwnPassword`.

### Validado
- `tsc --noEmit`/`eslint` frontend limpos; vitest **14/14**; `eslint` backend limpo (sem testes unitários do `UserController` no repositório).
- Navegador (Docker, rebuild backend+frontend): modal de edição do **próprio** admin sem acordeão e com texto "Para alterar a sua própria senha, use a página Trocar senha"; modal de **outro** usuário com acordeão presente e troca de senha OK (`PATCH` 200); toast agora `position: fixed` (z-index 400) com "Senha alterada com sucesso" **e** `Alert` inline verde no modal; chamada direta `PATCH /api/users/{id-do-admin}` com senha → **403** "Não é possível alterar a própria senha por este canal. Use \"Trocar senha\" na sua conta.".
- **Observação**: o seed do backend reaplica a senha do admin a partir de `.env.local` a cada start do container — comportamento pré-existente (a senha pessoal configurada pelo usuário é sobrescrita no restart).

---

## v1.2.13 — Feedback de troca de senha em /admin/users (reauth com TOTP em modal) (2026-08-18)

### Resumo
Relato do usuário: em `/admin/users`, o acordeão "Alterar senha" (modal de editar usuário) não mostrava mensagem de confirmação. Reproduzido com sessão de admin: com reautenticação recente o toast de sucesso aparecia, mas **com a janela de reauth expirada (SEC-1.2/15.4, padrão 5 min)** o fluxo quebrava: o `PATCH /users/:id` retornava 403 e o modal "Confirme sua identidade" abria **sem o campo TOTP** — mesmo com TOTP ativo no admin — fazendo o `reauthenticate` retornar 500 ("Token must be 6 digits, got 0"). Resultado: o modal de reauth ficava preso, a senha nunca era alterada e nenhuma confirmação aparecia.

### Causa raiz
No Mantine v9, `ModalsProvider` renderiza o conteúdo do modal como **irmão** dos `children` (o app): `<ModalsContext><Modal>{content}</Modal>{children}</ModalsContext>`. Como `UserContext.Provider` fica **dentro** de `children`, `useUser()` executado **dentro do conteúdo de um modal** retorna o default `{ user: null }`. Em `showUpdateUserModal.tsx` o `hasTotp` do modal de reauth era calculado com esse contexto (`!!currentUser?.totpVerified` → `false`), então o `PinInput` de TOTP nunca era renderizado. Em `/account/change-password` o mesmo cálculo ocorre no escopo da **página** (contexto correto) — por isso funcionava lá e quebrava no admin.

### Correções aplicadas
- **`frontend/src/pages/admin/users.tsx`**: página lê o `currentUser` no escopo correto (`useUser()`) e o repassa como prop.
- **`frontend/src/components/admin/users/ManageUserTable.tsx`**: aceita `currentUser` e o passa a `showUpdateUserModal`.
- **`frontend/src/components/admin/users/showUpdateUserModal.tsx`**: remove o `useUser()` de dentro do modal e usa o `currentUser` recebido por prop para `hasTotp` do modal de reauth (`!!currentUser?.totpVerified`).

### Validado
- `tsc --noEmit` e `eslint` frontend: 0 erros; vitest **14/14**.
- Reprodução no navegador (Docker, admin com TOTP ativo, reauth expirada): `PATCH /users/:id` → 403 → modal de reauth agora **com PinInput TOTP** → `reauthenticate` 200 → re-submit 200 → toasts "Identidade confirmada" + "Senha alterada com sucesso". Caminho direto (reauth válida): `PATCH` 200 + toast de sucesso.

---

## v1.2.12 — Feedback visível na troca de senha (loading + confirmação + redirect adiado) (2026-08-18)

### Resumo
Relato do usuário: na página `/account/change-password`, clicar em "Trocar senha" não mostrava mensagem de confirmação/falha. Verificado em reprodução (usuário comum, admin com TOTP e fluxo de reautenticação SEC-1.2/15.4) que o toast **sempre** era disparado — mas: (1) o botão não tinha estado de carregamento (a verificação argon2 + revogação de sessões leva ~2-4s de espera "silenciosa"); (2) o toast de sucesso disparava no mesmo instante do redirect e sumia em ~4s (auto-dismiss), fácil de perder. Além disso, a tradução `account.changePassword.next` ("Você será redirecionado em seguida.") já existia mas estava **sem uso** — o design original previa mensagem visível + redirect adiado, nunca implementado.

### Correções aplicadas
- **`frontend/src/pages/account/change-password.tsx`**:
  - Botão "Trocar senha" com `loading` durante a requisição (feedback imediato no clique).
  - Sucesso agora exibe `Alert` verde inline "Senha alterada com sucesso." + "Você será redirecionado em seguida." (`account.changePassword.next`, antes órfã) e o redirect (`next`/`/`) ocorre **2,5s depois** via `useEffect` — o toast e a mensagem ficam visíveis antes da navegação.
  - Fluxo de reautenticação (403 `reauthentication_required`) também usa o mesmo `setSuccess` em vez de `router.push` imediato.
- **`frontend/src/pages/account/index.tsx`**: card "Senha" de `/account` — botão "Salvar" com `loading` e handler `async`/`try-finally` (mesmo feedback durante o processamento; toast já funcionava e não redireciona).

### Validado
- `tsc --noEmit` e `eslint` frontend: 0 erros; vitest **14/14**.
- Reprodução no navegador (Docker): admin+TOTP — sucesso mantém a página por ~2,5s com toast + Alert "Você será redirecionado em seguida.", depois navega a `/upload`; erro e reauth (403 → modal "Confirme sua identidade" → re-submit) continuam com feedback.

---

## v1.2.11 — Correções de CI: build do backend, audit de produção, e2e (jest) e E2E (Playwright) (2026-08-18)

### Resumo
O pipeline de CI apresentava 3 falhas após as correções de segurança (`a043c1d`..`f44933c`): o **build do backend** quebrava (TS2564), o **audit de produção** acusava `deepmerge-ts@7.1.5` (high), o **e2e jest** falhava por dependência de ordem entre suites e o **E2E (Playwright)** não completava o login de admin (MFA obrigatório §34.2) nem carregava páginas que dependem de config pública. Todos os jobs de teste do CI estão verdes após esta correção.

### Correções aplicadas
- **Build do backend (TS2564)** — `backend/src/auth/dto/updatePassword.dto.ts`: `f44933c` tornou `oldPassword` obrigatória, mas sem inicialização (quebrava `nest build`). Adicionado `!` (`oldPassword!: string`) — "definitely assigned".
- **Audit de produção** — `backend/package.json`: adicionado override `"deepmerge-ts": "^8.0.0"`. O `npm audit --omit=dev` apontava `GHSA-ggr8-5vv4-36mx` (high) em `deepmerge-ts@7.1.5`, puxado em produção via `@prisma/config` ← `prisma` ← `@prisma/client` (Prisma 7). Com o override: **0 vulnerabilidades**.
- **e2e jest (ordem das suites)** — `backend/package.json` `test:e2e` dividido em duas invocações sequenciais com `--testPathPatterns=auth-share` e `--testPathPatterns=security`. As suites `auth-share` e `security` dependem do bootstrap "primeiro usuário" (admin via signUp + TOTP, §14.6) e compartilham o mesmo DB; apenas a suite alfabeticamente anterior (auth-share) conseguia virar admin, fazendo a `security` falhar em lote (16 testes). Agora **31/31 verdes** (16 + 15).
- **E2E (Playwright) — login com MFA**: admin do harness agora tem TOTP verificado com segredo fixo conhecido:
  - `backend/prisma/seed/e2e-totp.ts` (novo): seta `totpVerified = true` + `totpSecret` (base32 fixo) no admin de teste; idempotente (update). Executado por `seedAdmin()` (`e2e/lib/harness.ts`).
  - `e2e/lib/env.ts`: constantes `E2E_TOTP_SECRET` + `E2E_TOTP_ADMIN_EMAIL/SECRET` injetadas no `BACKEND_ENV`.
  - `e2e/lib/helpers.ts` `loginAsAdmin`: após a senha, completa o 2º fator — espera `/auth/totp/`, preenche "One time code" com código gerado via `otplib` (`generate({ secret })`) e confirma "Iniciar sessão".
  - `e2e/package.json` (+lock): `otplib` adicionado como devDependency.
- **E2E (Playwright) — quebra de páginas por throttling de config** — `backend/src/config/config.controller.ts`: a lista pública `GET /configs` recebeu `@SkipThrottle()`. O frontend consome `/api/configs` em **toda** renderização de página (middleware `proxy.ts` + `_app.tsx` getInitialProps), e o limite restritivo de admin (§22.4, 30 req/min do commit `37b0dab`) gerava 429 → fallback `getDefaultConfig()` (que **não** inclui `share.chunkSize`) → as páginas de upload/share lançavam `Config variable share.chunkSize not found` e o botão "Carregar Videos" nunca aparecia. Mesmo padrão das rotas `/me` do `UserController` (rota pública de uso obrigatório fora do limite restritivo).
- **E2E (Playwright) — timeout**: `e2e/playwright.config.ts` `timeout: 120_000` (padrão 30s). Uploads com retry de CSRF (`csrf_invalid` transiente em rajadas, com rotação de cookie) podem ultrapassar os 30s.

### Validado
- Backend: build + lint (0 erros) + **247 testes unitários** (24 suites verdes) + e2e jest **31/31** + `npm audit --omit=dev` **0 vulnerabilidades**.
- Frontend: build OK (produção e E2E).
- E2E Playwright local: **6/6 verdes**.
- CI (run `32139680571`, commit `afe82b6`): Backend, Frontend e **E2E (Playwright) verdes**.

### Pendências
- Job **Deploy (produção)** do CI falhou no passo SSH para o host (fora do escopo de teste; depende de segredos do environment `production` / disponibilidade do host).
- Tracker `docs/SEGURANCA-CORRECTIONS-TRACKER.md` desatualizado (ainda marca Fase 3/rate limiting como pendente) — recomenda-se revisão futura.

---

## v1.2.10 — Fase 5 da Especificação de Segurança v1.2: auditoria (§29) e admin de sessões (§34) (2026-08-17)

### Resumo
Conclusão da **Fase 5** (itens 15 e 16 do plano): trilha de auditoria estruturada com os eventos mínimos do §29.4 e painel administrativo de sessões (§34) com listagem (IP/User-Agent/estado) e revogação — sem nunca expor o token. Encerra o plano de segurança v1.2 (Fases 1–5 concluídas; itens 1–16).

### Correções aplicadas
- **Item 15 — Tabela de auditoria** (§29.4):
  - Migração `20260817173536_add_audit_log`: modelo `AuditLog` (`eventType`, `userId` FK `SetNull`, `sessionId`, `resource`, `result`, `metadata` JSON, `ipAddress`, `userAgent`, `requestId`; índices `createdAt`/`eventType`/`userId`/`requestId`); relação `auditLogs` em `User`.
  - `AuditService` (`@Global`): constante `AuditEvent` com os 17 eventos mínimos do §29.4; `record()` **nunca lança** (BKD-04) e extrai IP/User-Agent/requestId do request context; `findAll` com filtros `eventType`/`userId`/`from`/`to` + paginação.
  - Hooks fire-and-forget (`void this.auditService?.record(...)`, **sem `await` dentro de transações** — evita deadlock do SQLite de conexão única): `TokenService` (SESSION_CREATED), `LoginService` (LOGIN_FAILURE/LOGIN_SUCCESS), `AuthTotpService` (MFA_FAILED/LOGIN_SUCCESS/MFA_ENABLED/MFA_DISABLED), `RefreshService` (REFRESH_TOKEN_REUSE_DETECTED/LOGOUT/SESSION_REVOKED), `AuthService.updatePassword` (PASSWORD_CHANGED+SESSION_REVOKED), `VerificationService` (PASSWORD_RESET_REQUESTED/PASSWORD_RESET_COMPLETED+SESSION_REVOKED), `UserService.update` (SESSION_REVOKED/ROLE_CHANGED/PERMISSION_CHANGED), `ShareService` (SHARE_CREATED/SHARE_REVOKED).
  - `AdminAuditLogsController`: `GET /admin/audit-logs` (admin+auditor, throttle 30/60s — §22.4).
  - DownloadLog continua cobrindo `SHARE_ACCESS`/`SHARE_DOWNLOAD` (sem duplicação no `AuditLog`).
- **Item 16 — Admin de sessões** (§34):
  - `AdminSessionsService`: `findAll` computa estado `active`/`idle`/`expired`/`revoked` (idle via `general.sessionIdleTimeout`); **`tokenHash` nunca é selecionado** (§34.1); `revoke(sessionId)` exclui o refresh token (cascata na `Session`); `revokeAllByUser(userId)` revoga a família inteira.
  - `AdminSessionsController`: `GET /admin/sessions` (admin+auditor), `POST :id/revoke` e `POST revoke-all` (admin + `@ReauthRequired` — §15.4/§34.3); todas as revogações auditadas (`ADMIN_SESSION_REVOKED`).
  - `AuditModule` registrado no `AppModule`; i18n `session.json` (`session.notFound`/`session.userNotFound`).
- **Frontend (novo)**: páginas `/admin/audit-logs` (filtros evento/usuário/intervalo + tabela) e `/admin/sessions` (estado com badge, IP/User-Agent, revogação com confirmação e reautenticação obrigatória); cards no admin index; serviços `auditLog.service`/`adminSession.service`; tipos `auditLog.type`/`session.type`; i18n pt-BR.

### Validado
- Backend: build + lint (0 erros) + **247 testes unitários** (24 suites verdes; +10 das specs de auditoria/sessões).
- Backend: **e2e `auth-share`** — 16 testes verdes.
- Frontend: `tsc` + lint + build + **14 testes** verdes; rotas `/admin/audit-logs` e `/admin/sessions` geradas no build.

### Pendências
- Plano de segurança v1.2 completo (Fases 1–5, itens 1–16). Follow-ups opcionais: testes §35 (fase 6) e rate limiting distribuído §22.5 quando houver múltiplas instâncias.

---

## v1.2.9 — Fase 4 da Especificação de Segurança v1.2: refresh token hash (§26.3) e share tokens opacos server-side (§23) (2026-08-17)

### Resumo
Conclusão da **Fase 4**: itens 13 e 14 do plano. Refresh tokens passam a ser armazenados **apenas como SHA-256** (texto puro só no cookie httpOnly), e os **share tokens JWT** — que carregavam `shareId`/`iat`/`sharePasswordSignature` assinados — são substituídos por **tokens opacos de 256 bits** persistidos como hash, com expiração e **revogação explícita** (`revoked_at`).

### Correções aplicadas
- **Item 13 — Refresh token como hash** (§26.3):
  - `TokenService.generateRefreshToken()`: CSPRNG `randomBytes(32)` base64url (256 bits).
  - `createRefreshToken` persiste `token: hashToken(plainToken)` (SHA-256 hex, 64 chars) e retorna o registro com o **texto puro** apenas para o cookie — sem migração (reutiliza a coluna `RefreshToken.token` UNIQUE).
  - `RefreshService.refreshAccessToken` faz lookup por `hashToken(refreshToken)`; detecção de reuso (§26.2/SEC-07) inalterada.
  - Specs de `TokenService`/`RefreshService` atualizadas para o modelo hash.
  - **Nota de deploy**: refresh tokens legados (não-hash) deixam de corresponder ao lookup → famílias ativas pré-v1.2.9 são invalidadas; o cliente é redirecionado ao login.
- **Item 14 — Share tokens opacos com `token_hash` + `revoked_at`** (§23):
  - Migração `20260817172410_add_share_token_hash`: modelo `ShareToken` (`tokenHash` UNIQUE SHA-256, `shareId` FK cascade, `createdAt`, `expiresAt`, `revokedAt`, `ipAddress`, `userAgent`, índice `[shareId]`).
  - `ShareTokenService` reescrito (sem `JwtService`/`JwtSecretService`): `generateShareToken` emite **256 bits de entropia** (§23.2) e persiste apenas o hash; `verifyShareToken` rejeita token inexistente, de outro share, **revogado ou expirado** (§23.4); `revokeAllForShare` revoga em lote mantendo histórico (§23/§29.4).
  - `ShareService.updateSecurity`: **troca de senha revoga todos os share tokens** emitidos com a senha anterior (invalidação imediata, sem assinatura HMAC).
  - `ShareSecurityGuard` simplificado: delega verificação ao serviço; validação de expiração/revogação server-side por hash (cookie opaco ilegível).
  - `ShareController`: `clearShareTokenCookies` não decodifica mais JWT (tokens opacos); mantém cap de 10 cookies por ordem de inserção; dependência de `JwtService`/`dayjs` removida do controller.
  - `ShareService.getShareToken` propaga IP/UA do contexto para o registro do token.
- **Remoções**: `share-token.service` perde as funções HMAC (`getSharePasswordSignature`/`signaturesMatch`); cookie `share_${id}_token` agora contém token opaco.

### Validado
- Backend: build + lint + **237 testes unitários** (22 suites verdes; +4 do novo `ShareTokenService` §23; specs de share atualizadas).
- Backend: **e2e `auth-share`** — 16 testes verdes (fluxo §14.6/§10 inalterado).
- Frontend: `tsc` + lint + build + **14 testes** verdes (share tokens nunca são decodificados no cliente).
- README atualizado (contagem de testes e tabela de segurança).

### Pendências da Fase 4
- Fase 5 (itens 15-16): auditoria §29.4 e admin de sessões §34 — pendente.

---

## v1.2.8 — Fase 4 da Especificação de Segurança v1.2: sessão opaca server-side (§6, §7, §10, §11, §40) (2026-08-17)

### Resumo
Implementação do núcleo da **Fase 4** do plano (`docs/PLANO-CORRECOES-SEGURANCA.md`): substituição do **access token JWT** (que carregava `sub`/`email`/`role`/`isAdmin`) por **sessão de acesso opaca server-side** de 256 bits (apenas SHA-256 persistido), com validação por requisição (§10) e ciclo de vida idle 30min + absoluta 8h (§11). Itens 10, 11 e 12 do plano concluídos; item 13 (refresh token com rotação já existente) permanece conforme interpretação pragmática abaixo; item 14 (share token) adiado.

### Decisão de arquitetura (documentada em §40)
- `Session` = **camada de acesso**. O token opaco associa-se ao `RefreshToken` (família de rotação de 3 meses, §26) via `refreshTokenId` único.
- **Idle 30min** (`general.sessionIdleTimeout`) e **absoluta 8h** (`general.sessionMaxDuration`) aplicam-se a cada **sessão de acesso** (não à família). A rotação do refresh emite uma nova sessão de acesso; a detecção de reuso (SEC-07) continua revogando toda a família.
- Interpretação pragmática do §26.1/§26.3: refresh tokens permanecem como valores aleatórios UUID persistidos em DB (não-hash), com rotação + reuso já implementados na Fase anterior. `lastActivityAt` usa **update condicional** (§10.4), no máximo 1×/min por sessão.

### Correções aplicadas
- **Item 10 — Modelo `Session`** (§7):
  - `Session.token_hash` **UNIQUE** (SHA-256 hex), `user_id`, `created_at`, `last_activity_at`, `expires_at`, `revoked_at`, `ip_address`, `user_agent`; índices em `user_id`/`expires_at`; FK com cascade para `User` e `RefreshToken`.
  - Migração `20260817161907_add_opaque_sessions` + `prisma generate`. (SQLite não suporta `@db.Char(64)`/`@db.VarChar`; o hash/truncamentos são validados em código — UA truncado a 512 no middleware, IP em 45.)
  - `RequestContext` agora carrega `userAgent` (gravado a partir do request no `main.ts`).
  - Config novas: `general.sessionIdleTimeout` (30 minutes) e `general.sessionMaxDuration` (8 hours), seed aplicado na DB runtime.
- **Item 11 — Token opaco 256-bit** (§6):
  - `TokenService.generateAccessToken()` (CSPRNG base64url) + `hashToken()` (SHA-256) — **o token real nunca é persistido**.
  - `createSession(userId, refreshTokenId, tx?)` cria a sessão (IP/UA do request context) e retorna `{ accessToken, sessionId }`.
  - `getSessionByAccessToken()` faz lookup por hash (include refresh+user).
  - `JwtGuard` reescrito (sem passport): validação por requisição no `SessionService` (§10: hash → lookup → revogado → expirado → usuário ativo), fail-closed com `UnauthorizedException` em rotas não-`@Public()`; auth opcional em rotas públicas.
  - `ReauthGuard` reescrito: resolve a sessão corrente via `SessionService.findByAccessToken` → `refreshToken.reauthenticatedAt` (mantém §15.4).
  - `RefreshService.refreshAccessToken` emite nova sessão de acesso opaca na rotação; `signOut` resolve a sessão pelo token do cookie.
  - `signUp`/`signIn`/`signInTotp`/`updatePassword`/`authTotp.issueSession` emitem sessão opaca; `updatePassword` agora também retorna/grava o access token.
  - Middleware do Next.js (`frontend/src/proxy.ts`): removido o fast-path de verificação JWT local (`jose`); roteamento passa a delegar exclusivamente ao backend (`/api/users/me`), consistente com tokens opacos. `jose` removido do `package.json`.
  - `frontend/src/services/auth.service.ts`: `refreshAccessToken` simplificado (cookie httpOnly ilegível; refresh proativo delegado ao backend; 401-handler deduplicado do `api.service` já cobre refresh sob demanda).
- **Item 12 — Idle timeout + expiração absoluta** (§11):
  - `SessionService.validate`: expiração absoluta por `expiresAt`; idle por `lastActivityAt + sessionIdleTimeout`; **update condicional** de `lastActivityAt` via `updateMany WHERE lastActivityAt = antigo`, no máximo 1×/min (§10.4).
  - Cookie de acesso com `maxAge = min(idleTimeout, maxDuration)`.
- **Correções de vazamentos latentes**:
  - `POST /auth/signOut` lia apenas `access_token` (nome legado) — corrigido para resolver o nome correto do cookie (`__Host-SID` em produção).
  - `PATCH /auth/password` não reemitia access token — agora grava access+refresh.

### Validado
- Backend: build + lint + **233 testes unitários** (22 suites, verdes; +9 do `SessionService` §10/§10.4; specs de `TokenService`, `RefreshService`, `LoginService`, `ReauthGuard` e `JwtGuard` reescritas para o modelo opaco).
- Backend: **e2e `auth-share` reescrito para o fluxo §14.6/§10** (16 testes verdes): bootstrap do admin com cadastro TOTP pré-login, sessão por cookie httpOnly (sem Bearer), rotação `/auth/token` e `signOut`.
- Frontend: `tsc --noEmit` + lint + build + **14 testes** (2 suites) verdes.
- README atualizado (contagem de suites/testes e tabela de segurança).

### Pendências da Fase 4
- Item 13: refresh token como hash (§26.3) — adiado (rotação + reuso já ativos).
- Item 14: share token JWT → `token_hash` + `revoked_at` (§23) — adiado.

---

## v1.2.7 — Fase 3 da Especificação de Segurança v1.2: rate limiting (§22) (2026-08-17)

### Resumo
Implementação da **Fase 3** do plano (`docs/PLANO-CORRECOES-SEGURANCA.md`): rate limiting por identificador de conta + IP no login (§22.1) e limites específicos em endpoints de share (§22.3/§23.5) e administrativos (§22.4).

### Correções aplicadas
- **Item 8 — Login por conta + IP** (§22.1):
  - Novo `RequestThrottlerGuard` (substitui o `ThrottlerGuard` global), com `getTracker` ciente do recurso.
  - `/auth/signIn` passa a ser limitado por **email/username + IP** (ex.: 5/min por conta+IP), impedindo brute force concentrado em uma conta e por enumerador.
  - Demais rotas mantêm o comportamento padrão por IP.
- **Item 9 — Limites específicos em share e admin** (§22.3/§22.4/§23.5):
  - Acesso público a share (`GET /shares/:id`, `:id/view`, `:id/metaData`, `:id/token`) passa a ser limitado por **IP + share id** (e inclui o token de compartilhamento na chave quando presente), prevenindo abuso concentrado em um único recurso.
  - `ShareController` ganhou limite de classe de 60 req/min (rotas públicas seguem com limites menores próprios).
  - Endpoints administrativos com limite mais restritivo que o global (30 req/min): `UserController` (rotas de perfil `/me` permanecem no limite global), `ConfigController`, `SystemController` e `AdminDownloadLogsController`.
  - `MetricsController` (público, coleta Prometheus) com limite próprio de 60 req/min.

### Validado
- Backend: build + lint + **226 testes unitários** (21 suites, verdes; +7 testes do `RequestThrottlerGuard`).
- Pendências: Fases 4–7 do plano (sessão opaca com `token_hash`, auditoria estruturada, admin de sessões, testes §35). **§22.5** (rate limiting distribuído) permanece aberto: o `@nestjs/throttler` usa armazenamento em memória por instância — revisitado quando houver múltiplas instâncias (ex.: storage Redis dedicado ao throttler).

---

## v1.2.6 — Fase 2 da Especificação de Segurança v1.2: MFA, recovery codes e reautenticação (2026-08-17)

### Resumo
Implementação da **Fase 2** do plano (`docs/PLANO-CORRECOES-SEGURANCA.md`): MFA obrigatório para administradores (§14.6/§34.2), recovery codes de uso único (§15.3) e reautenticação recente para operações críticas (§15.4). **Sem** mudança de arquitetura de sessão (Fase 4 permanece).

### Correções aplicadas
- **Item 5 — TOTP obrigatório para admins** (§14.6/§34.2):
  - `LoginService.generateToken()` não emite sessão (access/refresh) para admin sem TOTP verificado — retorna `{ loginToken, requiresTotpSetup }`.
  - Novo fluxo de **cadastro pré-login**: `POST /auth/totp/enroll` (loginToken + senha → QR/segredo) e `POST /auth/totp/enroll/verify` (loginToken + código → ativa `totpVerified`, gera recovery codes e emite sessão). Evita deadlock de bootstrap do primeiro admin.
  - Frontend: nova página `/auth/totp/enroll/[loginToken]` com 3 etapas (senha → QR → código → recovery codes).
- **Item 6 — Recovery codes de uso único** (§15.3):
  - Novo modelo `RecoveryCode` (apenas hash SHA-256 persistido; valor em texto puro exibido UMA única vez na ativação).
  - `RecoveryCodeService` com `regenerate` (revoga anteriores), `consume` (uso único atômico via `updateMany WHERE usedAt: null`) e `clearForUser`.
  - `signInTotp` aceita recovery code como alternativa ao TOTP; `verifyTotp`/`enrollVerifyTotp` geram os códigos; `disableTotp` os revoga; `POST /auth/totp/recovery` regenera após senha + TOTP.
  - Frontend: exibição dos códigos no modal de habilitação e no cadastro; `TotpForm` aceita 6 dígitos TOTP ou 10 hex de recovery.
- **Item 7 — Reautenticação recente** (§15.4):
  - `RefreshToken.reauthenticatedAt` (marco de autenticação forte) + config `general.reauthWindow` (padrão 5m).
  - `ReauthGuard`/`@ReauthRequired()`: operações críticas exigem reautenticação dentro da janela, senão 403 `reauthentication_required`.
  - `POST /auth/reauthenticate` (senha + TOTP se ativo) renova o marco da sessão corrente.
  - Aplicado em: `PATCH /auth/password`, `PATCH/DELETE /users/:id` (admin) e `PATCH/DELETE /users/me`.
  - Login forte, 2FA e rotação de refresh preservam o marco (cópia em `refreshAccessToken`).
  - Frontend: modal reutilizável `showReauthModal` integrado à troca de senha e à edição de usuários (admin), com re-submissão automática após confirmar.

### Migração
- Nova migração `20260817151710_add_recovery_codes_and_reauth` (modelo `RecoveryCode` + `RefreshToken.reauthenticatedAt`).
- Nova config `general.reauthWindow` (timespan, default `5m`) — inserida via seed no banco de dados.

### Validado
- Backend: build + lint + **219 testes unitários** (18 suites, verdes; +10: admin gate, recovery codes, reauth guard).
- Frontend: build (nova rota `/auth/totp/enroll`) + lint + **14 testes** verdes.
- Pendências: Fases 3–7 do plano (rate limit por conta, sessão opaca com `token_hash`, auditoria estruturada, admin de sessões, testes §35).

---

## v1.2.5 — Correções da Especificação de Segurança v1.2 (Fases 0 + 1) (2026-08-17)

### Resumo
Revisão completa contra `docs/ESPECIFICACAO-SEGURANCA.md` **v1.2** (sessões, autenticação e tokens). Foram executadas as **Fases 0 + 1** do plano (`docs/PLANO-CORRECOES-SEGURANCA.md`): correções rápidas e correções críticas exploráveis, **sem mudança de arquitetura** (a migração para sessão opaca server-side permanece na Fase 4).

### Correções aplicadas (Fase 0)
- **UA truncado** para 512 chars antes da persistência (`utils/request.util.ts`) — §28.4.
- **`Cache-Control: no-store`** nas respostas de autenticação (login, refresh, signOut, CSRF) — §21.
- **Cookie `__Host-SID`** em produção: nome condicional (Secure → `__Host-SID`; dev → `access_token`), `Path=/` explícito, centralizado em `utils/session-cookie.util.ts`. Frontend (`proxy.ts`, `auth.service.ts`) atualizado para ler ambos os nomes — §8.

### Correções aplicadas (Fase 1)
- **Usuário desativado bloqueado em cada requisição**: `JwtStrategy.validate()` retorna `null` quando `!user.isActivated` → 401 — §10.
- **Revogação de sessões em eventos de segurança**: `UserService.update()` apaga refresh tokens ao desativar usuário, alterar role ou trocar senha — §12.
- **`resetPassword` revoga todas as sessões**: `VerificationService.resetPassword()` invalida os refresh tokens do usuário em transação — §16.4.
- **Download atômico com limite**: `DownloadLimitGuard` reserva o slot com `updateMany WHERE downloads < maxDownloads` (check + increment num único UPDATE), eliminando o TOCTOU; removidas as chamadas separadas de `incrementDownloadCount` — §25.1.
- **Login genérico para conta não ativada**: `LoginService.signIn()` retorna `wrongCredentials` (sem revelar existência da conta) — §14.4.

### Validado
- Backend: build + lint + **209 testes unitários** (18 suites, todos verdes).
- Frontend: lint (arquivos alterados) verdes.
- Pendências: Fases 2–7 do plano (MFA obrigatório p/ admin + recovery codes, reautenticação crítica, rate limit por conta, sessão opaca com `token_hash`, auditoria estruturada, admin de sessões, testes §35).

---

## v1.2.4 — Revisão de segurança e hardening (2026-08-15)

### Resumo
Auditoria independente de segurança (OWASP Top 10) revalidou os controles centrais e identificou **8 novos achados** (4 médios, 4 baixos) não cobertos pelo SECURITY_REPORT.md anterior. Nota sugerida revisada de 9.0 → **8.5/10**. **Todos os achados foram corrigidos e validados** — nota restaurada para 9.0/10. Registro completo em `SECURITY_REPORT.md` (§9 achados, §10 status das correções).

### Correções aplicadas (2026-08-15)
- **NEW-1**: tokens de reset/verify movidos do path para **fragment** (`#token=`) nos e-mails; novo endpoint `POST /auth/resetPassword/request` (body `{email}`) substitui `POST /auth/resetPassword/:email`; frontend lê o token via `hash.util.ts` (`getHashValue`) com fallback para a rota antiga.
- **NEW-2**: `/api/metrics` restrito a redes internas no `Caddyfile.prod`.
- **NEW-3**: flag morta `share.allowUnauthenticatedShares` removida do frontend (middleware, Header, upload, types, defaultConfig) e do backend (seed + tipo config).
- **NEW-4**: middleware do Next.js mantém fast-path local e, em falha (pós-rotação), delega a verificação ao backend `GET /users/me` (resolve o segredo por kid).
- **NEW-5**: `CertificateSystemInfo` reduzido a plataforma + versão Node — certificado PDF público não embute mais hostname/IP/storage path.
- **NEW-6**: `PublicUserDTO` expõe apenas `id` + `username`.
- **NEW-7**: `ShareOwnerGuard` remove o caminho `if (!share.creatorId) return true` → fail-closed (apenas dono/admin).
- **NEW-8**: `.env` dev com `ADMIN_PASSWORD` forte (`openssl rand -base64 32`).

### Controles revalidados (sem alteração)
Fail-closed, CSRF, argon2, sessões, SQLi, path traversal, XSS, upload, npm audit (0 CVE), segredos em repo.

### Validado
- Backend: build + lint + **208 testes unitários** + **16 e2e** (roteiro `resetPassword/request` atualizado).
- Frontend: build + lint + **14 testes**.
- **6 e2e Playwright** (auth, upload, share) — todos verdes.
- Pendência residual: `caddy validate` do `Caddyfile.prod` (caddy não instalado no ambiente local).

---

## v1.2 — Certificado de Assinaturas SHA-256 (2026-08-14)

### Resumo
Nova funcionalidade: geração automática de certificado PDF (replicando `docs/certificado.pdf`) para cada arquivo ao concluir um share. Documentação completa em `docs/CERTIFICADO.md`.

### Implementado
- `CertificateService` (`backend/src/certificate/`) — gera PDF A4 com `pdfkit`, calcula o hash SHA-256 do arquivo original e salva em `{shareId}/{fileId}.certificado.pdf`.
- `CertificateModule` — provido/exportado e importado no `ShareModule`.
- `ShareService.complete()` — dispara `generateCertificates()` (fire-and-forget, falha não bloqueia a conclusão).
- Registro do certificado como `File` no banco — **aparece na listagem do share** e é baixável pelo endpoint padrão.
- `LocalFileService.resolveDiskPath()` — resolve o caminho real do certificado no disco para download/remoção.
- Datas localizadas em pt-BR (`dayjs().locale("pt-br")`).

### Correções de bugs (v1.2.1)
- **`LocalFileService.getFileZip()`** usava `${shareId}/${fileId}` em vez de `resolveDiskPath()`. Para arquivos com subpasta no nome (ex.: `video/arquivo.mp4.certificado.pdf`), o download retornava 404/erro porque o id do certificado não existe no disco. Corrigido para usar `resolveDiskPath()`.
- **`JwtGuard.canActivate()`** retornava `true` para rotas `@Public()` **sem popular `request.user`**. O `ShareSecurityGuard` nunca reconhecia admin (`allowAdminAccessAllShares`) nem o criador → 403 `share_password_required` em shares com senha. Corrigido com `authenticateOptional()`: popula `request.user` a partir do cookie `access_token` em rotas públicas, sem nunca bloquear visitante anônimo.
- **Certificado não conta para o limite de downloads** (`FileController.getFile`): o certificado (`*.certificado.pdf`) **ignora o `DownloadLimitGuard` e não incrementa `share.downloads`**. Apenas o vídeo/arquivos originais contam para `maxDownloads`. Regra de negócio: após usar a senha para liberar o acesso, o certificado fica sempre baixável; o bloqueio vale apenas para o vídeo.
- Remoção de logs de depuração (`[DEBUG] Raw body parser`) em `main.ts`.

### Validado
- E2E via API: create → upload → complete → certificado listado → download (PDF válido) e visualização (200, `Content-Type: application/pdf`).
- Fluxo no navegador: página do share carrega para admin logado (200, sem 403), certificado aparece na listagem com visualização funcionando.
- Hash SHA-256 conferido (arquivo original = certificado).
- Build, lint e **207 testes unitários verdes** (18 suites).

---

## v1.2.2 — Reformulação do fluxo de certificado (2026-08-14)

### Resumo
Reformulação para atender `docs/PLANO-CERTIFICADO.md`: um share de upload de 1 vídeo passa a conter **somente o vídeo (com metadados embutidos in-place) + 1 certificado PDF**, sem o artefato intermediário `.assinado`. O certificado registra os hashes **original e final** (pós-metadados) e o tamanho final quando os bytes do vídeo mudam.

### Implementado
- `CertificateService.embedCertificateInVideo()` — embute o certificado de autenticidade (código/hash/share/proprietário) **diretamente no vídeo** via `ffmpeg -metadata` (in-place, substituindo o arquivo original, sem criar `.assinado`). Retorna `{ originalHash, finalHash, finalSize }`.
- `CertificateService.generateCertificate()` — agora aceita `hashes` (original/final) e `finalSizeBytes`; o PDF exibe **"Hash final (pós-metadados)"** e **"Tamanho final"** quando diferem do original.
- `ShareService.generateCertificates()` — chama `embedCertificateInVideo` primeiro e gera o certificado **uma única vez** com ambos os hashes; pula artefatos já gerados (`.certificado.pdf`, `.assinado.`).
- **BUG-FIX "baixar tudo"** (`ShareService.complete()`): a contagem `share.files.length` era do share antes da geração de certificados. Agora recontar via `prisma.file.count` após `generateCertificates()` → para 1 vídeo o zip agora é gerado e o "Transferir tudo" funciona.

### Correções de layout do PDF (v1.2.2)
- **Cabeçalho desalinhado**: `doc.text(text, centerX, y, { align: "center", width })` centraliza **dentro de `[x, x+width]`**, começando em `centerX` o texto terminava fora da página. Centralizado com `x = margin` e `width = pageWidth - 100` (offset +0 do centro da página).
- **4 páginas → 1 página**: conteúdo terminava em y≈855 (além do limite de texto do PDFKit). Layout compactado (linhas 18pt, seções de sistema/eventos enxutas, rodapé em `pageHeight - margin - 12`).

### Validado
- E2E via API + UI: share com 1 vídeo lista **2 arquivos** (vídeo + certificado, sem `.assinado`).
- Vídeo com metadados embutidos (ffprobe confirma comment com hash original).
- Certificado PDF com **1 página**, cabeçalho centralizado (offset +0) e ambos os hashes (`Hash SHA-256` original / `Hash final (pós-metadados)`) + `Tamanho` / `Tamanho final`.
- "Transferir tudo" (UI) baixa `archive.zip` válido com vídeo+PDF; download individual do vídeo gera zip vídeo+PDF.
- Build, lint e **208 testes unitários verdes** (18 suites).

---

## v1.2.3 — Correções de tela cheia e fuso horário do certificado (2026-08-14)

### Resumo
Duas correções pontuais: (1) a tarja de segurança do preview de vídeo passa a permanecer visível em tela cheia; (2) as datas exibidas no certificado passam a refletir o horário de Brasília (UTC-3), independentemente do fuso do servidor.

### Implementado

#### fix(share): tarja de proteção visível em tela cheia
- `frontend/src/components/share/FilePreview.tsx`
  - Helpers `getFullscreenElement` / `requestFullscreen` / `exitFullscreen` com fallback `webkit*` (Safari antigo).
  - `wrapperRef` envolve vídeo + tarja; botão customizado (`ActionIcon` com `TbArrowsMaximize`/`TbArrowsMinimize`) coloca o **wrapper** (e não apenas o `<video>`) em fullscreen, mantendo a tarja visível.
  - Handler `fullscreenchange` com guarda `wrapperFullscreenRef` evita reentrar em fullscreen durante a transição de saída do Chrome (que passa pelo `<video>` e causava prisão em tela cheia).
  - Estado `isFullscreen` alterna o `aria-label` entre "Entrar"/"Sair" da tela cheia.
- `frontend/src/styles/global.style.tsx` — `video::-webkit-media-controls-fullscreen-button { display: none !important; }` oculta o botão nativo (Chromium).
- `frontend/src/i18n/translations/pt-BR.ts` — chaves `share.video.fullscreen-enter` / `share.video.fullscreen-exit`.

#### fix(certificado): horário de Brasília (UTC-3) nas datas
- `backend/src/certificate/certificate.service.ts`
  - Plugins dayjs `utc` + `timezone` estendidos (mirando o padrão já usado em `email.service.ts`).
  - Constante `BRASILIA_TIMEZONE = "America/Sao_Paulo"`.
  - `nowLabel` (geração) e `shareCreated` (criação do share) formatados com `.tz(BRASILIA_TIMEZONE)` — antes saíam em UTC embora a legenda afirmasse "horário de Brasília".

### Motivação
- O container/servidor roda em UTC; o certificado tinha a legenda "horário de Brasília" mas as datas eram impressas em UTC (+3h).
- A tarja de proteção sumia em tela cheia porque o botão nativo do `<video>` entra em fullscreen apenas no elemento de vídeo (a tarja é irmã do `<video>`), e a tentativa anterior de redirecionar para o wrapper falhava com `TypeError: Permissions check failed` (ausência de user activation) e prendia o usuário em tela cheia.

### Validado
- **Certificado (E2E)**: share criado → vídeo enviado → complete → certificado gerado e baixado. Extração do PDF confirma `14 de agosto de 2026, 19:36:34` (Brasília) com servidor em `22:36 UTC` (diferença de 3h confirmada); rodapé e cabeçalho exibem "horário de Brasília - Brasil".
- **Fullscreen (UI)**: no app real, em fullscreen o wrapper é o `fullscreenElement`; a tarja (`<Text>` filha do wrapper) permanece visível; botão alterna os rótulos; saída limpa sem prisão em tela cheia.
- Backend: `eslint` ✅, `nest build` ✅, `share.service.spec.ts` (45 testes) ✅. Container `controle-videos-local-backend` reconstruído e healthy; fix confirmado no bundle (`grep America/Sao_Paulo`).
- Frontend: `eslint` ✅, `tsc --noEmit` ✅, `next build` ✅, `vitest run` (14 testes) ✅. Container `controle-videos-local-frontend` reconstruído e healthy.

### Commits
- `32de153` — `fix(certificado): exibe horário de Brasília (UTC-3) nas datas do certificado`
- `c7fc53b` — `fix(share): mantém tarja de proteção visível em tela cheia no preview de vídeo`

---

## v1.2.4 — QR Code no certificado + correção do ZIP e autenticidade (2026-08-15)

### Resumo
Adiciona um **QR Code** com o hash SHA-256 do arquivo no certificado PDF (leitura rápida da integridade sem decifrar o hash impresso) e corrige a geração do ZIP ("Transferir tudo") para incluir os certificados, além de alinhar o título do PDF à finalidade de autenticidade.

### Implementado
- `CertificateService` (`backend/src/certificate/certificate.service.ts`)
  - **QR Code**: gera o QR com conteúdo `SHA-256: {originalHash}` via `qrcode` (`QRCode.toBuffer`, 200px, margin 2, centralizado, 70x70pt) posicionado entre os eventos e o rodapé.
  - **Título do PDF**: alterado de "Certificado de assinaturas" para **"Certificado de Autenticidade"** (tanto no PDF quanto no metadata `info.Title`).
  - Legenda sob a data de geração: **"Horário oficial de Brasília (UTC−3)"** (reforço do fuso já aplicado em v1.2.3).
- `ShareArchiveService.getFileZip()` (`backend/src/share/share-archive.service.ts`)
  - **BUG-FIX**: o ZIP do share era gerado apenas com as rows `File` do banco — os certificados (`*.certificado.pdf`), cujo `id` da row não corresponde ao caminho no disco (`{originalFileId}.certificado.pdf`), ficavam **fora do archive.zip**. Agora o serviço lista o diretório do share (`listDirectory`), detecta os PDFs de certificado, soma seus tamanhos à proteção contra zip-bomb (limite de arquivos/bytes) e os anexa com nome amigável `<nomeDoVideo>.certificado.pdf`.
- `ShareService.complete()` — mensagem de erro de zip ajustada (PT-BR).
- `docs/MANUAL.md` — limpeza de conteúdo (removidas seções duplicadas de PowerShell; mantido o manual de limpeza do Docker).

### Correções de CI (PR `fix/...`)
- Backend: mock de `listDirectory` adicionado ao `ShareArchiveService` nos testes (18 suites, **208 testes** verdes).
- E2E: filtro `hasNotText(".certificado.pdf")` na listagem pública para evitar `strict mode violation` no teste de download individual.
- Frontend: adicionado `@types/uuid` (build do Next.js falhava com "Cannot find module 'uuid'").
- GitHub Actions: `actions/checkout@v4→v5`, `actions/setup-node@v4→v6`, `actions/upload-artifact@v4→v5` — elimina o warning de deprecação do Node.js 20 (remoção marcada para 16/09/2026).

### Validado
- Backend: 18 suites / **208 testes** verdes; lint ✅; build ✅.
- Frontend: 14 testes (vitest) verdes; lint ✅; build ✅.
- E2E Playwright: suíte completa verde (6 testes) — inclui download individual com o certificado na listagem.
- ZIP do share com 1 vídeo + 1 certificado: archive.zip contém ambos os arquivos, com o PDF nomeado `<video>.certificado.pdf`.

### Commits
- `eb2a24d` — `correção autenticidade` (título + zip com certificados)
- `d0e5522` — `QRcode` (QR Code SHA-256 no PDF)
- `c23c552` — `fix(ci): corrige falhas em testes, build frontend e E2E`
- `d62d7de` — `ci: atualiza actions para rodar em Node 24`

---

## v1.0 — Auditoria de Prontidão para Produção (2026-08-10)

### Resumo
Auditoria completa do estado atual do Controle Share Videos v1.0 (fork de Pingvin Share) validada para ir para produção **com condições**, nota geral **7.5/10**.

### Estado Técnico Atual

#### ✅ Funcionalidades Validadas
- Backend NestJS 11 + Prisma 6 + SQLite com 10 models validados
- JWT com rotação híbrida (kid + timeline + mutex + AES-256-GCM)
- Guards globais fail-closed: ThrottlerGuard, JwtGuard, RolesGuard, PasswordMustChangeGuard
- RBAC fino com 3 papéis (`admin`, `auditor`, `operador`) e decorators semânticos
- Frontend Next.js 16 + Mantine 9 com middleware jose para JWT
- Upload concorrente limitado (QAL-06: UPLOAD_CONCURRENCY=3)
- Decomposição ShareService (R05 ✅): ShareMapper + ShareArchiveService + FileStorageService
- ConfigService tipado (R06 ✅): ConfigTypeMap elimina `any`
- Jobs com batching (R04 ✅)
- Docker multi-stage (8 stages, non-root UID 1002, node:24-alpine)
- Caddy reverse proxy com TLS, HSTS, filtro `pwd=`
- CI/CD GitHub Actions com deploy SSH + scripts de backup/hardening
- Observabilidade: Prometheus + Grafana + Loki
- `pnpm audit` limpo (0 CVE)

#### ⚠️ Pendências (com plano de remediação em v1.1)
- **D02**: Sem testes E2E — **Resolvido (H-04)**: Playwright integrado ao CI
- **D05**: Backup sem restore test automatizado — **Resolvido (H-02)**: criado `scripts/restore-test.sh` (restaura backup mais recente em DB temporário, valida integrity_check + schema + counts), procedimento e cron documentados em `docs/operacional/BACKUP_RESTORE.md`

#### ✅ Correções v1.1 executadas (2026-08-11/12)
- **S-05/D04**: CSP header adicionado no Caddy (H-01) — validado com `caddy validate`
- **D03**: Branch `fix/producao-v1.1.0` verificada (100% mergeada em main) e removida do remoto (H-03)
- **R02**: `IUploadRepository` extraída — camada `backend/src/storage/` com `FilesystemUploadRepository`; `LocalFileService`, `ShareArchiveService`, `JobsService` e `FileStorageService` agora injetam a interface (sem `fs`/`SHARE_DIRECTORY` direto)
- **R01**: `AuthService` decomposto em `LoginService`, `TokenService`, `RefreshService` e `VerificationService` (`backend/src/auth/service/`); AuthService virou orquestrador fino e `AuthTotpService` passou a injetar os services isolados. 4 specs novos (+31 testes, 109→140). Sem regressão (build, lint, unit e e2e verdes)
- **D02**: Playwright E2E integrado ao CI (H-04) — job `e2e` no ci.yml boota backend/frontend de teste, instala chromium e roda a suíte (`e2e/`); deploy depende do job E2E
- **S-01**: Docker Secrets aplicado a todos os serviços (backend, frontend, caddy, grafana) — nenhum `env_file` remanescente
- **S-06**: `rate_limit` no Caddyfile.prod — zona `dynamic` (100 req/10s) + zona `auth` (10 req/60s)
- **H-02**: `scripts/restore-test.sh` criado (restore test automatizado, D05) — valida backup mais recente em DB temporário (GPG/assinatura/gzip, integrity_check, schema e counts); documentação em `docs/operacional/BACKUP_RESTORE.md`
- **Docs v1.1**: `docs/operacional/DEPLOY.md`, `MONITORAMENTO.md`, `RUNBOOKS.md` criados; `BACKUP_RESTORE.md` revisado; `README.md` hardenado (referências corrigidas, seção Segurança/Limitações) — fecha item "Docs operacional + README hardening" do ROADMAP

#### 📋 Limitações Aceitas
- **A-06/D01**: SQLite em produção (single-writer, sem replica) — Aceito com monitoramento Prometheus + ROADMAP PostgreSQL em v1.3

### Histórico Git (Commits Relevantes)
- `6a29928` — 13 correções documentadas
- `973bdc1` — QAL-06 (concorrência upload + modais decompostos)
- `6c84d71` — Rotação JWT híbrida
- `4c81acc` — Monitoramento Prometheus/Grafana/Loki
- `31221f2` — CI/CD deploy SSH

### Refatorações Concluídas
- ✅ R01 — Decompor AuthService (`LoginService`/`TokenService`/`RefreshService`/`VerificationService`)
- ✅ R02 — Extrair UploadRepository (`IUploadRepository` + `FilesystemUploadRepository`)
- ✅ R03 — Tipagem de controllers
- ✅ R04 — Batching de jobs
- ✅ R05 — Decomposição ShareService
- ✅ R06 — ConfigService tipado

### Refatorações Pendentes
- (nenhuma — R01..R06 concluídas)

### Artefatos gerados nesta auditoria (13/13)
1. ✅ DISCOVERY.md
2. ✅ ARCHITECTURE_REVIEW.md
3. ✅ SECURITY_REPORT.md
4. ✅ PERFORMANCE_REPORT.md
5. ✅ TECH_DEBT.md
6. ✅ REFACTORING_PLAN.md
7. ✅ ROADMAP.md
8. ✅ DEPENDENCY_AUDIT.md
9. ✅ TEST_PLAN.md
10. ✅ AUDIT_MATRIX.md
11. ✅ EVIDENCE_INDEX.md
12. ✅ CHANGELOG.md (este)
13. ✅ AUDIT_REPORT.md (consolidador)

### Decisões de Auditoria
- Não comparar com baseline anterior (decisão explícita do usuário)
- Foco em validar estado atual para produção
- Pendências não bloqueiam go-live desde que explicitamente aceitas com plano de remediação v1.1

---

*Fim do CHANGELOG.md*
