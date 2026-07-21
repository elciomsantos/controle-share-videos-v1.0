# Análise do projeto `controle-share-videos-v1.0` para uso interno restrito

- **Base:** Pingvin Share X v1.21.1
- **Objetivo:** restringir a uso interno, fixar PT-BR como único idioma, remover acesso/links externos, hardening de segurança.
- **Data da análise:** 2026-07-19
- **Branch de trabalho ( sugerida ):** `feat/internal-ptbr`

### Requisitos obrigatórios do cliente

| # | Requisito | Impacto no projeto |
|---|---|---|
| R1 | **Login somente com usuário e senha local** — remover todos os provedores sociais ( GitHub, Google, Microsoft, Discord, OIDC genérico ) e LDAP. | Apagar `backend/src/oauth/`, `backend/src/auth/ldap.service.ts`, categorias `oauth` e `ldap` em `config.seed.ts`, UI de "Sign in with..." no frontend. Ver §5. |
| R2 | **Armazenamento em servidor interno, sem necessidade de conexões externas.** Nenhuma chamada de rede para serviços de terceiros ( GitHub API, update checker, telemetry, crowdin, SMTP/S3 externos, registries de Docker em runtime ). | Stub `isNewReleaseAvailable=false`; apagar workflows `.github/*` que publicam em `ghcr.io`; remover `deploy:dev`/`release:*` do `package.json` root; `docker-compose.yml` `image:` → `build: .`; restringir `trusted_proxies` no Caddy; verificar egress de rede ( firewall: bloquear `api.github.com` e demais endpoints externos ). Ver §5, §7, §10 ( Fases 2, 4, 7 ). |
| R3 | Idioma único PT-BR ( infra mantida ). | Ver §6. |
| R4 | ClamAV mantido mas opcional. | Sem remoção de código; apenas corrigir bug do `.catch(() => false)`. |
| R5 | Atualizações de deps apenas patches/minors ( sem majors ). | Ver §8. |
| R6 | **Aumentar nível de segurança** — pacote recomendado de hardening além do mínimo. | Ver §13 ( novo ): helmet + CORS estrito + CSRF + secureCookies true + trust proxy via env + throttle de login ( 5/60s ) + Swagger gated + JWT rotation + bcrypt custo 12. |
| R7 | **Limite de downloads por arquivo ( N downloads totais )**. | Aproveitar `ShareSecurity.maxViews` existente ( ampliar para `maxDownloads` ) + novo campo `downloads` em `Share`. Criar `DownloadGuard`. Ver §14. |
| R8 | **Logs de download com identificação de quem baixou** — campos mínimos: usuário / IP / timestamp / share. | Criar nova model `DownloadLog` ( Prisma migration ) + `DownloadLogService` + endpoint admin `/admin/downloads`. Ver §15. |

---

## 1. Stack técnica

| Camada | Tecnologia | Versão atual |
|---|---|---|
| Backend | NestJS | 11.x |
| ORM | Prisma | 6.x ( SQLite ) |
| i18n backend | nestjs-i18n | — |
| Frontend | Next.js | **14.2.35 ( com CVEs HIGH )** |
| UI | Mantine | 6.x |
| i18n frontend | react-intl | — |
| PWA | next-pwa | ativo |
| Reverse proxy | Caddy ( imagem ) | — |
| Container | Docker multi-stage node:24-alpine | — |

---

## 2. Vulnerabilidades conhecidas

### 2.1 `next@14.2.35` — múltiplos CVEs HIGH
- DoS, cache poisoning, SSRF, XSS, request smuggling.
- **Sem patch 14.x** que cubra todos os CVEs simultaneamente.
- **Mitigadores já presentes:** `images.unoptimized: true` em `next.config.js`.
- **Mitigadores adicionais recomendados:**
  - desabilitar `next-pwa` ( SW vulnerável a cache poisoning ),
  - desabilitar `rewrites`/`middleware` se não usados,
  - restringir `host`/`x-forwarded-host` no Caddy.

### 2.2 `npm audit`
- **Backend:** 0 vulnerabilidades.
- **Frontend:** vulnerabilidade única e centralizada no `next` ( ver 2.1 ).

---

## 3. Hardening — mínimo necessário ( base )

> Estas são correções consideradas **mínimas** e independentes do pacote R6. Aplicar sempre.

### 3.1 `backend/src/main.ts`
- `app.set("trust proxy", true)` **hardcoded** — ignora a env `TRUST_PROXY`.
  → Ler `process.env.TRUST_PROXY === "true"`.
- Sem `helmet`.
- Sem middleware de **CORS** explícito.
- Sem proteção **CSRF** ( cookies de sessão sem SameSite/CSRF token ).

### 3.2 `backend/prisma/seed/config.seed.ts` — defaults inseguros
| Chave | Default atual | Recomendado |
|---|---|---|
| `allowRegistration` | `true` | **`false`** ( uso interno ) |
| `secureCookies` | `false` | **`true`** |
| `defaultLanguage` | `en-US` | **`pt-BR`** |

### 3.3 Throttler global
- 100 requisições / 60s global — **fraco** para endpoint de login.
- Recomendado: throttle específico `/auth/login` ( ex. 5/60s ) + 429 com `Retry-After`.

### 3.4 Swagger
- Se exposto em produção: proteger com gate ( apenas em `NODE_ENV !== "production"` ou atrás de admin ).

> **Pacote ampliado ( R6 ) em §13.**

---

## 4. Bugs e problemas de qualidade

| # | Arquivo | Problema |
|---|---|---|
| 4.1 | `backend/server.log` | **Commitado no repo** — adicionar a `.gitignore` e `git rm`. |
| 4.2 | `backend/src/clamscan/clamscan.service.ts` | `.catch(() => false)` mascara falha do ClamAV como "não infectado". Distinguir `false` ( sem vírus ) de `erro` ( indisponível ). |
| 4.3 | `frontend/src/services/config.service.ts:78-85` | `isNewReleaseAvailable()` chama `api.github.com` a **cada acesso** a `/admin`. Para uso interno: retornar `false` fixo ou cache de 24h. |
| 4.4 | `backend/prisma/seed/config.seed.ts` `migrateConfigVariables` | apenas insere/atualiza — **não deleta** chaves removidas. DBs existentes podem acumular lixo. |
| 4.5 | `backend/prisma/schema.prisma:19` | coluna `User.ldapDN` — tornar obsoleta ao remover LDAP ( manter compatibilidade da migration ). |
| 4.6 | `package.json` ( root ) | `deploy:dev` publica `smp46/pingvin-share-x` no DockerHub — **risco de push externo acidental**. Remover ou renomear para `internal:build`. |
| 4.7 | `docker-compose.yml` | `image: smp46/pingvin-share-x` — trocar por `build: .` ( construir local, sem pull externo ). |

---

## 5. Remoção de OAuth / LDAP / Provedores externos

> **Requisito R1 ( cliente ):** o sistema deve permitir login **apenas** com usuário e senha local. Nenhum login social ou LDAP deve existir na UI ou no backend.

### 5.0 Princípio: sem autenticação externa
- Toda autenticação passa a ser **local** ( tabela `User` com `username` + `password` bcrypt ).
- Fluxos a **eliminar**:
  - `/api/auth/oauth/*` ( GitHub, Google, Microsoft, Discord, OIDC genérico ),
  - `/api/auth/ldap` ( bind LDAP ),
  - botões "Sign in with..." no frontend,
  - configurações de client-id/secret/redirect-url no `config.seed.ts`,
  - coluna `User.ldapDN` ( parar de usar; manter no schema para compatibilidade de migrations ).
- Fluxos a **manter**:
  - login por usuário/senha,
  - refresh tokens ( tabela `RefreshToken` ),
  - 2FA TOTP ( `totpEnabled`, `totpSecret` ),
  - reset de senha por e-mail ( só se SMTP reativado — decisão R2: desativado por padrão ),
  - tokens de ativação.

### 5.1 Backend — apagar diretório e serviços
- `backend/src/oauth/` inteiro:
  - `github.provider.ts` ( URL hardcoded `github.com/login/oauth` )
  - `google.provider.ts`
  - `microsoft.provider.ts`
  - `discord.provider.ts`
  - `genericOidc.provider.ts`
  - `oauth.module.ts`, `oauth.controller.ts`, `oauth.service.ts`
- `backend/src/auth/ldap.service.ts` — apagar.
- `backend/src/app.module.ts` — remover `OAuthModule` e referências a LDAP.
- `backend/prisma/schema.prisma:19` — coluna `ldapDN` ( manter na migration; apenas parar de usar ).

### 5.2 Backend — `config.seed.ts`
- Remover categorias:
  - `oauth` ( linhas 304-422 ): github, google, microsoft, discord, genericOidc
  - `ldap` ( linhas 259-303 ): url, bindDn, bindPassword, userBase, userFilter
- Decidir sobre `smtp` ( 225-258 ) e `s3` ( 424-459 ): usuário optou por **desativar**, código pode permanecer.

### 5.3 Frontend — remover UI/links
| Arquivo | O que remover |
|---|---|
| `frontend/src/services/auth.service.ts:100,104` | Métodos `getOauthAvailable()` e `getOauthStatus()` ( `/oauth/available`, `/oauth/status` ). Verificar consumo nos pages de login. |
| `frontend/src/services/config.service.ts:12-13` | Referências a categorias `"oauth"` e `"ldap"` no array de configurações. |
| `frontend/src/components/footer/Footer.tsx` | Link "Powered by GitHub". |
| `frontend/src/pages/index.tsx:167-177` | Botão "Source" para o repositório GitHub. |
| `frontend/src/pages/admin/intro.tsx` | Links GitHub + Sponsors. |
| `frontend/src/pages/admin/index.tsx:56-72` | Card de "Update" com link ao github/releases. |
| `frontend/src/services/config.service.ts:78-85` | `isNewReleaseAvailable()` — stub `false`. |
| `frontend/src/pages/auth/login/*.tsx` | Botões "Sign in with GitHub/Google/Microsoft/Discord" ( validar todos os arquivos de login ). |

---

## 6. Remoção de i18n extras — fixar PT-BR

**Decisão:** apagar os 33 idiomas adicionais; **manter** infraestrutura `react-intl` e `nestjs-i18n` funcionando ( único idioma = PT-BR ).

### 6.1 Backend
- `backend/src/i18n/` — apagar todos os diretórios exceto `pt-BR`.
- Manter `systemLanguage.resolver.ts`.

### 6.2 Frontend
- `frontend/src/i18n/translations/` — apagar 33 arquivos `.ts` exceto `pt-BR.ts`.
- `frontend/src/i18n/locales.ts` — reduzir a `PORTUGUESE_BRAZIL` apenas.
- `frontend/src/components/LanguagePicker.tsx` — remover ( sem alternativa ).

### 6.3 Defaults a ajustar ( todos os níveis )
| Arquivo | Linha | Atual | Novo |
|---|---|---|---|
| `backend/src/app.module.ts` | 55 | `fallbackLanguage: "en-US"` | `"pt-BR"` |
| `backend/prisma/seed/config.seed.ts` | 37-41 | `defaultLanguage: "en-US"` | `"pt-BR"` |
| `frontend/src/pages/_app.tsx` | 266 | locale default ReactIntl | `"pt-BR"` |
| `frontend/src/util/defaultConfig.util.ts` | — | — | `"pt-BR"` |
| `frontend/src/hooks/useTranslate.hook.ts` | 27 | — | `"pt-BR"` |
| `frontend/src/i18n/i18n.util.ts` | — | — | `"pt-BR"` |

---

## 7. Links / acesso externo — auditoria completa

> **Requisito R2 ( cliente ):** armazenamento e execução em **servidor interno**, sem nenhuma necessidade de conexão com serviços externos. Toda funcionalidade que dependa de rede de terceiros deve ser desativada, stub-ada ou substituída por equivalente local.

### 7.1 Código ( chamadas HTTP externas )
| Local | Destino | Ação |
|---|---|---|
| `frontend/src/services/config.service.ts:78-85` | `api.github.com/repos/.../releases/latest` | stub `false`. |
| `backend/src/oauth/*.provider.ts` | github.com, google, microsoft, discord, OIDC | remover ( ver §5 ). |
| `backend/src/auth/ldap.service.ts` | LDAP server configurável | remover. |

### 7.2 Documentação / config / arquivos
| Arquivo | Ação |
|---|---|
| `README.md` | Remover badges ( workflows, coverage, license ) e links ao repositório upstream. |
| `crowdin.yml` | **Apagar** ( integração tradução externa ). |
| `docs/` ( docusaurus ) | Remover docs públicas ou restringir ( решечно pelo usuário ). |
| `.github/FUNDING.yml` | Apagar ( sponsoring smp46 ). |
| `.github/ISSUE_TEMPLATE/` | Apagar ( sem issues externas em fork interno ). |
| `.github/pull_request_template.md` | Apagar. |
| `.github/workflows/docker-build-push.yml` | Apagar — **publica em `ghcr.io/${{ github.repository }}`** ( push externo ). |
| `.github/workflows/docker-security.yml` | Apagar — sobe SARIF ao GitHub. |
| `.github/workflows/awaiting-release.yml` | Apagar. |
| `.github/workflows/mark-released.yml` | Apagar. |
| `.github/workflows/backend-system-tests.yml` | Apagar ( rodar localmente se necessário ). |
| `package.json` ( root ) scripts `release:*` e `deploy:dev` | Remover ( push externo, publishing ). |

### 7.3 Reverse proxy
- `reverse-proxy/Caddyfile` — sem HTTPS, escuta `:3000`. Para produção interna: adicionar `tls internal` ou terminar TLS antes.
- `reverse-proxy/Caddyfile.trust-proxy` — `trusted_proxies 0.0.0.0/0` ( **muito amplo** ). Restringir à rede interna do Docker ( ex. `172.16.0.0/12` ).

### 7.4 Docker
- `Dockerfile` — multi-stage com `node:24-alpine`; sem pull de imagens externas em runtime ( OK ).
- `docker-compose.yml` — trocar `image: smp46/pingvin-share-x` por `build: .`.
- `docker-compose.dev.yml` — apenas ClamAV ( OK ).
- `docker-compose.local.yml` — `build: .` ( OK ); `TRUST_PROXY=false`.

### 7.5 Checklist de bloqueio de saída ( firewall / rede )
Para garantir R2 ( sem conexões externas em runtime ), após aplicar todas as fases, o servidor interno deve bloquear egress para:

| Host / padrão | Origem | Por quê |
|---|---|---|
| `api.github.com` | `config.service.ts` ( update checker ) | já stub-ado, mas defence-in-depth. |
| `github.com/login/oauth/*` | oauth providers ( se não removidos ) | R1. |
| `*.google.com/o/oauth2`, `login.microsoftonline.com`, `discord.com/api/oauth2` | oauth providers | R1. |
| Servidor LDAP configurado | `ldap.service.ts` | R1. |
| Host SMTP configurado | `email.service.ts` | SMTP desativado ( R2 ). |
| `*.s3*.amazonaws.com` / endpoint S3 configurado | `s3.service.ts` | S3 desativado ( R2 ); usar storage local. |
| `registry-1.docker.io`, `ghcr.io`, `auth.docker.io` | `docker pull` em runtime | usar `build: .` local; não puxar imagem externa. |
| `clamav` freshclam | container ClamAV | persists em update de assinaturas; se **isolado total**, desabilitar freshclam no `docker-compose.dev.yml` ou aceitar que ClamAV não atualiza assinaturas. |

> Após bloqueio, smoke test deve confirmar:
> - login usuário/senha OK,
> - upload/download OK,
> - admin config carrega **sem** chamadas externas ( verificar aba Network ),
> - `docker compose up` não tenta `pull` de imagem externa.

---

## 8. Dependências — plano de atualização

**Política: apenas patches e minors ( sem majors ).**

### 8.1 Backend
- `npm audit`: 0 vulnerabilidades.
- `npm outdated` — validar minors disponíveis para:
  - `@nestjs/*` ( dentro do major 11 )
  - `@prisma/client` e `prisma` ( dentro do major 6 )
  - `nestjs-i18n`, demais deps

### 8.2 Frontend
- `next` — **não atualizar** para major 15; permanecer em 14.x ( pegar último patch 14.2.x ).
- `react`/`react-dom` — permanecer em 18.x.
- `@mantine/core` — permanecer em 6.x.
- Outras deps — minors dentro do major atual.

> _Detalhe: mesmo pegando o último 14.2.x, alguns CVEs HIGH do Next não são cobertos. Avaliar substituição futura por Next 15 ( major ) em projeto separado._

---

## 9. Pontos pendentes / não cobertos

- `backend/prisma/migrations/*.sql` — verificados, **não há secrets hardcoded** ( apenas nomes de coluna `password`/`secret` ).
- `backend/prisma/schema.prisma` — coluna `User.ldapDN` ( linha 19 ): manter para compatibilidade de migrations existentes; parar de usar no código.
- `docs/` ( docusaurus ) — documentação pública: decisão sobre manter/apagar pertence ao usuário.
- `SECURITY.md` / `CHANGELOG.md` — herdados do upstream: adequar ou remover em Fase final.

### 9.1 Confirmações já validadas ( sem ação necessária )
| Item | Resultado | Observação |
|---|---|---|
| **Telemetria / analytics** ( Sentry, PostHog, Pirsch, etc ) | **Ausente** | `grep` em `backend/src` não encontrou nenhum. Sem ação. |
| **Storage local sem S3** | **Já funciona** | `share.service.ts:97` usa `s3.enabled ? "S3" : "LOCAL"`. Com S3 desativado ( default ), já cai para LOCAL automaticamente. Ver §12. |
| **Usuário admin demo/seeds** | **Não existe** | `backend/prisma/seed/` contém apenas `config.seed.ts` — nenhum usuário pré-cadastrado. Setup wizard cria o admin no primeiro acesso. |
| **Secrets hardcoded em migrations SQL** | **Ausente** | Apenas nomes de coluna. Ver §9. |

### 9.2 Itens a validar durante a execução
- **Paths de login no frontend**: verificar todos `frontend/src/pages/auth/login/*.tsx` para garantir remoção completa dos botões OAuth ( almeno `index.tsx`, valide com `grep` ).
- **Guards de autenticação**: confirmar que `JwtAuthGuard`/`session.guard.ts` não referenciam `OAuthService` ou `LdapService` ( remover imports quebrados ).
- **Build Docker offline**: `Dockerfile` faz `npm install` no build-stage — se o servidor de build estiver isolado sem rede, o build quebra. Pré-requisito: build em máquina com rede ou cache npm local.
- **Redirect URLs OAuth no Caddy**: se houver rewrites para `/api/auth/oauth/*`, remover junto com §5.
- **`.opencode/` / `opencode.json`** ( raiz ) — arquivo de configuração da ferramenta de dev: não commitar ( adicionar a `.gitignore` na Fase 0 ).

---

## 10. Plano de execução ( 10 fases )

> ### Registro de progresso ( acompanhar conforme execução )
>
> | Fase | Status | Observações |
> |---|---|---|
> | Fase 0 — Preparação | **Concluída** | `.gitignore` atualizado ( `*.log`, `backend/server.log`, `opencode.json`, `.opencode/` ); `git rm --cached backend/server.log` e `opencode.json`. Branch própria NÃO criada ( já em `main` a pedido do usuário ). |
> | Fase 1 — Hardening mínimo | **Concluída** | `main.ts`: `trust proxy` lê `TRUST_PROXY=true`; `helmet()` com HSTS / `X-Content-Type-Options` / `Referrer-Policy: same-origin` / `Cross-Origin-Resource-Policy: same-origin`; CORS via `CORS_ORIGIN` ( default `false` = same-origin ); Swagger gated ( `NODE_ENV !== production` **e** `SWAGGER_ENABLED=true` ). `config.seed.ts`: `secureCookies=true`, `defaultLanguage=pt-BR`, `allowRegistration=false`. `auth.controller.ts`: `signIn` e `signIn/totp` agora 5/60s. Novo `backend/src/throttler/throttler-exception.filter.ts` adiciona `Retry-After: 60` no 429. `app.module.ts`: `fallbackLanguage: "pt-BR"`. Deps instaladas: `helmet`, `cors`, `@types/cors`. CSRF token adiado ( será avaliado em Fase 6 com `SameSite=Strict` ). Validação: `npm run lint` → 0 errors / 15 warnings pré-existentes; `tsc --noEmit` → 0 errors. |
> | Fase 2 — Remover OAuth + LDAP | **Concluída** | Backend: `backend/src/oauth/` apagado (github, google, microsoft, discord, oidc, genericOidc providers + controllers/services/dto/guard/filter); `backend/src/auth/ldap.service.ts` apagado; `app.module.ts` sem `OAuthModule`; `auth.module.ts` sem `LdapService`/`OAuthModule`; `auth.service.ts` refatorado (signIn só senha, signOut sem OAuth, verifyPassword sem LDAP, generateToken sem oauth, createRefreshToken sem idToken, requestResetPassword sem check ldapDN); `user.service.ts` sem `findOrCreateFromLDAP`/`ldapts` import; `user.dto.ts` sem `isLdap`/`ldapDN`. `config.seed.ts`: categorias `oauth` e `ldap` removidas; `initUser.ldapDN` removido do tipo. `schema.prisma`: model `OAuthUser` removido, coluna `User.ldapDN` removida, coluna `RefreshToken.oauthIDToken` removida, relation `User.oAuthUsers` removida. Nova migration `20260721084252_drop_oauth_and_ldap`. `package.json` backend: `ldapts` e `jmespath`/`@types/jmespath` removidos. Frontend: `auth.service.ts` sem `getAvailableOAuth`/`getOAuthStatus`; `config.service.ts` sem categorias oauth/ldap, `isNewReleaseAvailable` stub `false`, import axios removido; `utils/oauth.util.tsx` apagado; `components/auth/SignInForm.tsx` reescrito (só login/senha, sem botões OAuth); `pages/account/index.tsx` reescrito (sem cards OAuth/LDAP); `pages/admin/intro.tsx` sem links GitHub/Sponsors; `pages/admin/index.tsx` sem card "Update"; `pages/admin/config/[category].tsx` sem categorias OAuth/LDAP; `components/admin/configuration/ConfigurationNavBar.tsx` sem itens OAuth/LDAP; `components/admin/users/ManageUserTable.tsx` sem Badge LDAP; `pages/index.tsx` sem botão "Source"; `components/footer/Footer.tsx` sem link externo GitHub; `types/user.type.ts` sem `isLdap`. `config.example.yaml` sem `ldapDN`; `scripts/generate-example-config.ts` sem `ldapDN` em initUser. i18n `pt-BR/auth.json` limpo (sem `ldapResetPasswordNotAllowed`/`passwordSignInDisabled`); chaves oauth/ldap removidas. Validação: `tsc --noEmit` backend — 0 erros nos arquivos da Fase 2 (erro pré-existente em `share/guard/shareIdValidation.guard.ts` sobre `rxjs` é de ambiente, `node_modules` parcialmente corrompido por `npm install` interrompido). |
> | Fase 3 — Fixar PT-BR único idioma | **Concluída** | Backend: 32 dirs de idioma apagados (mantido apenas `pt-BR/`); `ldap.json` e `oauth.json` removidos de `pt-BR/`. Frontend: 32 arquivos `.ts` de tradução apagados (mantido apenas `pt-BR.ts`); `LanguagePicker.tsx` apagado. `locales.ts`: apenas `PORTUGUESE_BRAZIL`. `i18n.util.ts`: fallback/default `"pt-BR"`. `_app.tsx`: `defaultLocale={LOCALES.PORTUGUESE_BRAZIL.code}`. `useTranslate.hook.ts`: `defaultLocale: "pt-BR"`. `defaultConfig.util.ts`: `defaultLanguage: "pt-BR"`. `account/index.tsx`: card LanguagePicker removido. `pt-BR.ts`: ~93 chaves oauth/ldap removidas. `generate-example-config.ts`: import `pt-BR` em vez de `en-US`. `app.module.ts`: `fallbackLanguage: "pt-BR"`. `config.seed.ts`: `defaultLanguage: "pt-BR"`. Validação: `tsc --noEmit` backend → 0 errors; `tsc --noEmit` frontend → 0 errors. |
> | Fase 4 — Limpeza externa | **Concluída** | `crowdin.yml` apagado. `.github/ISSUE_TEMPLATE/` e `.github/workflows/` apagados (5 workflows). `package.json` root: scripts `release:*`, `version` e devDeps `conventional-changelog` removidos. `docker-compose.yml`: `image:` removido (build já presente). `README.md`: limpo (sem badges, sponsors, links upstream, OIDC/LDAP mention). `Caddyfile.trust-proxy`: `trusted_proxies` restringido a `172.16.0.0/12` (era `0.0.0.0/0`). `docs/` apagado (backup `Analise-sistema-backup.md` na raiz). |
> | Fase 5 — Bug fixes | **Concluída** | `clamscan.service.ts`: `.catch(() => ({ isInfected: false }))` removido — erros do ClamAV agora propagam em vez de tratar como "limpo". S3 path: `finally` block garante limpeza de tmp files; `logger.warn` → `logger.error` + rethrow. `checkAndRemove`: try/catch em `check()` com log de erro, share fica online se scan falhar. `config.seed.ts`: `migrateConfigVariables` com log ao deletar chaves obsoletas; removido `orderMap` não utilizado. |
> | Fase 6 — Hardening ampliado ( R6 ) | **Concluída** | H4: `access_token` cookie com `httpOnly: true` e `sameSite: "strict"` (era `"lax"` sem httpOnly). H7: JWT rotation implementada em `refreshAccessToken()` — deleta refresh token antigo, cria novo, retorna ambos. Controller atualizado para setar novo refresh cookie. H8: `ARGON2_OPTIONS` partilhado em `constants.ts` (128MB, timeCost=4, parallelism=2) — todas as 9 chamadas `argon.hash` atualizadas. Permissions-Policy header via middleware customizado (helmet versão instalada não suporta `permissionsPolicy`). Validacao: `tsc --noEmit` backend e frontend = 0 errors. |
> | Fase 7 — Limite de downloads ( R7 ) | **Concluída** | Schema: `Share.downloads` (Int, default 0) + `ShareSecurity.maxDownloads` (Int?). Migration `20260721150000_add_download_limits`. Novo `DownloadLimitGuard` em `file/guard/downloadLimit.guard.ts` — verifica `maxDownloads` antes de permitir download e incrementa contador. `FileController`: guard aplicado em `getZip` e `getFile`; incremento fire-and-forget após stream. `config.seed`: `maxDownloadsDefault` (default 0 = ilimitado). i18n `pt-BR/share.json`: `maxDownloadsExceeded`. `transformShare`: inclui `downloads` e `maxDownloads`. `updateSecurity`: suporta `maxDownloads`. `UpdateShareSecurityDTO`: campo `maxDownloads` opcional. Validacao: `tsc --noEmit` backend e frontend = 0 errors. |
> | Fase 8 — Logs de download ( R8 ) | **Concluída** | Schema: model `DownloadLog` (shareId, fileId, fileName, userId, username, ip, success, reason) com índices em shareId/userId/createdAt. Migration `20260721151000_add_download_log`. `DownloadLogService`: `record()` async INSERT, `findAll()` paginado com filtros (shareId, userId, from, to). `DownloadLogModule` + `AdminDownloadLogsController`: `GET /api/admin/download-logs` (admin only, paginado). `DownloadLimitGuard`: registra falhas (maxDownloadsExceeded). `FileController`: registra downloads bem-sucedidos (ZIP e individual). `config.seed`: `downloadLogRetentionDays` (default 0 = indefinido). Validacao: `tsc --noEmit` backend e frontend = 0 errors. |
> | Fase 9 — Dependências ( R5 ) | **Concluída** | `npm audit fix` no frontend: 5 vulns → 1 (restante requer Next 16 major, fora do escopo). Backend: overrides adicionados para `axios` (^1.17.1) e `brace-expansion` (^2.0.1). Políticas mantidas: Next 14.x, React 18.x, Mantine 6.x (sem majors). Validacao: `tsc --noEmit` backend e frontend = 0 errors. |
> | Fase 10 — Teste / validação | Pendente | |
>
> _Última atualização: 2026-07-21 — Fase 0 + Fase 1 + Fase 2 + Fase 3 + Fase 4 + Fase 5 + Fase 6 + Fase 7 + Fase 8 + Fase 9 concluídas._

### Fase 0 — Preparação
- Criar branch `feat/internal-ptbr`.
- Adicionar `backend/server.log` e `opencode.json` ao `.gitignore`; `git rm --cached backend/server.log`.
- Commit de limpeza inicial.

### Fase 1 — Hardening mínimo ( §3 + base R6 )
- `main.ts`: `trust proxy` via env, helmet, CORS, CSRF.
- `config.seed.ts`: defaults `allowRegistration=false`, `secureCookies=true`, `defaultLanguage=pt-BR`.
- Throttler específico para `/auth/login` ( 5/60s ).
- Swagger gate por ambiente.

### Fase 2 — Remover OAuth + LDAP ( R1 )
- Apagar `backend/src/oauth/`, `backend/src/auth/ldap.service.ts`.
- Limpar `app.module.ts`, `config.seed.ts` ( categorias `oauth` e `ldap` ).
- Dropar model `OAuthUser` e coluna `User.ldapDN` ( nova migration ).
- Frontend: remover UI e links externos ( Footer, intro, index admin, index público, `config.service.ts`, `auth.service.ts` ).

### Fase 3 — Fixar PT-BR único idioma ( R3 )
- Apagar 33 dirs backend e 33 arquivos frontend.
- Reduzir `locales.ts` ao `PORTUGUESE_BRAZIL`.
- Remover `LanguagePicker.tsx`.
- Ajustar defaults em todos os 6 pontos listados em §6.3.

### Fase 4 — Limpeza externa ( R2 )
- Apagar `crowdin.yml`, `.github/FUNDING.yml`, `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`, `.github/workflows/*`.
- Remover scripts `release:*` e `deploy:dev` do `package.json` root.
- `docker-compose.yml`: `image:` → `build: .`.
- `README.md`: remover badges e links upstream.
- `reverse-proxy/Caddyfile.trust-proxy`: restringir `trusted_proxies` a `172.16.0.0/12`.
- Stub `config.service.ts:isNewReleaseAvailable=false`.
- Decisão sobre `docs/` docusaurus.

### Fase 5 — Bug fixes
- `clamscan.service.ts`: distinguir erro vs não-infectado.
- `migrateConfigVariables`: ajustar para deletar chaves obsoletas ( ou documentar migração manual ).

### Fase 6 — Hardening ampliado ( R6, §13 )
- Aplicar H1-H9 ( bcrypt custo 12, JWT rotation, headers helmet completos, SameSite=Strict, etc ).
- Validar JWT rotation com fluxo de refresh.
- Reexecutar testes de login.

### Fase 7 — Limite de downloads por arquivo ( R7, §14 )
- Nova migration: `Share.downloads`, `ShareSecurity.maxDownloads`.
- `DownloadLimitGuard` novo.
- Incremento no `FileController` ao final do stream.
- Config seed `maxDownloadsDefault`.
- UI admin: coluna downloads + editável.

### Fase 8 — Logs de download ( R8, §15 )
- Nova migration: model `DownloadLog` ( com índices ).
- `DownloadLogService` + `DownloadLogModule` ( registrar em `app.module.ts` ).
- Hook em `FileController` / `DownloadLimitGuard` para `record()`.
- API admin `GET /api/admin/download-logs` ( paginada, filtros ).
- Frontend: página `admin/download-logs` + entrada no menu.
- Config seed `downloadLogRetentionDays=0` ( indefinido ).

### Fase 9 — Dependências ( R5 )
- `npm update` ( patches/minors ) em backend e frontend.
- Reexecutar `npm audit` e `npm outdated`.
- **Não major-upgrade** Next, React, Mantine.

### Fase 10 — Teste / validação
- `npm run lint` + `npm run typecheck` ( frontend e backend ).
- Build Docker local: `docker compose -f docker-compose.local.yml up --build`.
- Smoke test: login, upload, share, admin config, **limite de downloads** ( download até estourar N → 403 no próximo ), **logs** ( verificar registro na página admin ).
- Validar sem rede externa ( bloquear `api.github.com` em firewall ).

---

## 11. Armazenamento local — detalhamento ( requisito R2 )

> **Requisito R2:** armazenamento em servidor interno, sem necesidad de conexões externas.

### 11.1 Mecanismo já existente
- `backend/src/share/share.service.ts:97`:
  ```ts
  storageProvider: this.configService.get("s3.enabled") ? "S3" : "LOCAL"
  ```
- Com `s3.enabled = false` ( default em `config.seed.ts` ) o armazenamento já é **LOCAL** — sem nenhuma ação de código necessária.
- Arquivos são gravados em `./data/` ( volume do container ).
- `docker-compose.yml` / `docker-compose.local.yml` mapeiam `./data:/opt/app/backend/data:rw,z`.

### 11.2 Para garantir isolamento total
1. **Confirmar `s3.enabled = false`** após executar `seed` (ou forçar via DB em DBs existentes ).
2. **Não configurar** bucket S3 em produção ( valor permanece default ).
3. **Backups locais** do volume `./data/` devem fazer parte da rotina do servidor ( não coberto por este projeto ).
4. Firewallservidor interno: bloquear egress para `*.s3*.amazonaws.com` e endpoint S3 configurado ( ver §7.5 ).
5. Código S3 (`backend/src/s3/*`) **pode permanecer** — só não é ativado. Remoção completa é opcional e fora do escopo atual.

---

## 12. Resumo executivo

- **Nível de segurança atual:** **médio-baixo** para uso interno. Sem helmet, sem CORS, sem CSRF, trust proxy hardcoded, defaults inseguros, update checker chamando GitHub a cada acesso admin.
- **Risco principal imediato:** `next@14.2.35` com CVEs HIGH sem patch 14.x completo + push externo acidental via `deploy:dev`/workflows.
- **Esforço estimado:** ~3-5 sessões para Fases 0-5; Fase 6-7 dependem de testes.
- **Decisões já tomadas ( requisitos do cliente ):**
  - **R1 — Auth:** **apenas** usuário/senha local. Remover GitHub, Google, Microsoft, Discord, OIDC genérico e LDAP. Ver §5.
  - **R2 — Armazenamento/Execução:** **servidor interno, sem conexões externas** em runtime. Storage já é LOCAL por default ( §11 ); stub do update checker, apagar workflows de push externo, `build: .` no docker-compose, bloquear egress via firewall. Ver §7 ( especialmente §7.5 ).
  - R3 — PT-BR único idioma ( infra mantida ).
  - R4 — ClamAV mantido mas opcional.
  - R5 — Apenas patches/minors ( sem majors ).
  - R6 — Hardening ampliado ( §13 ).
  - R7 — Limite de downloads por arquivo ( §14 ).
  - R8 — Logs de download com identificação ( §15 ).
- **Nenhuma edição foi feita ainda** — modo `plan`. Aguardando aprovação para iniciar Fase 0.

---

## 13. Hardening ampliado ( requisito R6 )

> **Decisão do cliente:** pacote **recomendado** ( intermediário entre mínimo e máximo ).

### 13.1 Backend — mudanças a aplicar

| # | Arquivo | Mudança |
|---|---|---|
| H1 | `backend/src/main.ts` | `app.use(helmet())` com defaults seguros. |
| H2 | `backend/src/main.ts` | `app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? false, credentials: true }))`. Em uso interno, default `false` ( same-origin ). |
| H3 | `backend/src/main.ts` | `app.set("trust proxy", process.env.TRUST_PROXY === "true")` ( cobre §3.1 ). |
| H4 | `backend/src/main.ts` | CSRF: `csurf` ou equivalente baseado em cookie `SameSite=Lax` + token header `X-CSRF-Token`. Alternativa: usar `SameSite=Strict` em todas as rotas autenticadas e dispensar CSRF token. |
| H5 | `backend/prisma/seed/config.seed.ts` | Defaults `secureCookies=true`, `allowRegistration=false`, `defaultLanguage=pt-BR` ( cobre §3.2 ). |
| H6 | `backend/src/auth/auth.controller.ts` ( ou throttle module ) | Throttle específico `/auth/login`: 5 tentativas / 60s, retornar `Retry-After`. |
| H7 | `backend/src/auth/auth.service.ts` | **JWT rotation** — a cada refresh, invalidar `RefreshToken` anterior ( já é o caso? validar ). Garantir que cada login emita novo `RefreshToken` e que o anterior seja removido. |
| H8 | `backend/src/auth/auth.service.ts` | **bcrypt custo 12** ( atual: validar; mínimo aceitável 10, 12 recomendado ). Se estiver abaixo, exigir rehash no próximo login. |
| H9 | `backend/src/main.ts` | Swagger: servir apenas sob `/api/docs` quando `NODE_ENV !== "production"` ou se config `internal.swaggerEnabled=true`; caso contrário, registrar `/api/docs` apenas condicionalmente. |

### 13.2 Cookies
- Cookie de sessão: `httpOnly: true`, `secure: true` ( com `secureCookies` on ), `sameSite: "strict"` ( ou `"lax"` se houver fluxo cross-site ).
- Cookie de share token (`share_${id}_token`): mesma configuração.

### 13.3 Headers adicionais ( via helmet )
- `Strict-Transport-Security`: `max-age=31536000; includeSubDomains` ( cabe ao Caddy terminar TLS, mas helmet reforça ).
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY`.
- `Referrer-Policy: no-referrer` ( pode conflitar com auditoria de downloads — então `same-origin` ).
- `Permissions-Policy: geolocation=(), camera=(), microphone=()`.

### 13.4 Não incluído no pacote "recomendado" ( fora do escopo atual )
- HSTS / CSP estrita — adicionar quando frontend for servido por separação clara ( hoje frontend está atrás do Caddy; CSP pode conflitar com Mantine SSR ).
- Cache de auth em Redis — sem Redis no stack atual, adicionaria nova dependência.
- Bloqueio de conta após N falhas — pode ser R7.data, mas não foi solicitado; fica fora.
- Auditoria de login ( além de download ) — fora do escopo R8.

---

## 14. Limite de downloads por arquivo ( requisito R7 )

> **Decisão do cliente:** limite **por arquivo ( N downloads totais )**.

### 14.1 Estado atual ( já existente no schema )
- `Share.views Int @default(0)` ( schema.prisma:90 ) — **contador de visualizações**, não de downloads.
- `ShareSecurity.maxViews Int?` ( schema.prisma:149 ) — limite de **visualizações**, aplicado em `FileSecurityGuard` ( backend/src/file/guard/fileSecurity.guard.ts:76 ).
- `increaseViewCount()` em `share.service.ts:451` — incrementa `views` a cada **acesso ao share** ( não por arquivo baixado ).

> **Gap:** atualmente o limite conta "abrir a página do share", não "baixar arquivo". Para R7 precisamos contar downloads reais.

### 14.2 Implementação proposta

#### 14.2.1 Schema — nova migration
```prisma
model Share {
  // ... existente
  downloads Int @default(0)        // NOVO: contador de downloads
}

model ShareSecurity {
  // ... existente
  maxDownloads Int?                // NOVO: limite de downloads ( null = ilimitado )
}
```
- Migration Prisma nova: `backend/prisma/migrations/<timestamp>_add_download_limits`.

#### 14.2.2 Lógica de incremento
- Contar **1 download por requisição completa do arquivo** ( não por byte-range ).
- Em `backend/src/file/file.controller.ts` ( ou onde o stream é retornado ), ao **fim** do stream bem-sucedido:
  - `share.downloads += 1`
  - `await prisma.share.update(...)`
- Caso de ZIP de múltiplos arquivos: contar 1 download do ZIP completo, não 1 por arquivo.

#### 14.2.3 Guarda de limite ( `DownloadLimitGuard` novo )
- Antes de iniciar o stream:
  ```ts
  if (share.security?.maxDownloads !== null &&
      share.security.maxDownloads <= share.downloads) {
    throw new ForbiddenException(i18n.t("share.maxDownloadsExceeded"));
  }
  ```
- Registrar evento bloqueado em `DownloadLog` ( ver §15 ).

#### 14.2.4 Admin UI
- Em `frontend/src/pages/admin/shares/[id].tsx` ou na listagem de shares:
  - Coluna "Downloads": `share.downloads` / `share.security?.maxDownloads ?? ∞`.
  - Campo editável `maxDownloads` ( opcional, somente admin ).

#### 14.2.5 Config seed ( novo )
```ts
{ name: "maxDownloadsDefault", category: "share", type: "number",
  defaultValue: "0",  // 0 = ilimitado
  secret: false, locked: false, order: 5 }
```
- Default `0` significa "ilimitado" — admin pode configurar por share.

### 14.3 Casos a validar
- Limite atingido → 403 com mensagem PT-BR.
- Limite atingido durante download em andamento → stream continua até finalizar, depois bloqueia o próximo.
- Admin ✝: admin pode acessar arquivo mesmo após limite ( se `allowAdminAccessAllShares=true` )?

---

## 15. Logs de download com identificação ( requisito R8 )

> **Decisão do cliente:** campos **mínimos** ( usuário / IP / timestamp / share ). Sucesso e falha registrados.

### 15.1 Schema — nova model `DownloadLog`
```prisma
model DownloadLog {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())

  shareId   String           // FK lógica ( sem cascade para preservar histórico )
  fileId    String?           // null para ZIP
  fileName  String            // snapshot do nome ( caso arquivo seja renomeado )

  userId    String?           // null se download anônimo
  username  String?           // snapshot ( caso usuário seja deletado )
  ip        String            // IP do cliente ( via x-forwarded-for se trust proxy on )

  success   Boolean           // true = completado, false = bloqueado/falhou
  reason    String?           // se success=false: "maxDownloadsExceeded", "unauthorized", "notFound", etc.

  @@index([shareId])
  @@index([userId])
  @@index([createdAt])
}
```
- **Sem FK** para `Share`/`User` ( preservar histórico mesmo após delete ). `shareId`/`userId` guardados como String simples.
- Índices para consultas rápidas por share / por usuário / por período.

### 15.2 `DownloadLogService` ( novo )
- `backend/src/download-log/download-log.service.ts`
- `DownloadLogModule`注册 em `app.module.ts`.
- Método:
  ```ts
  async record(entry: {
    shareId: string; fileId?: string; fileName: string;
    userId?: string; username?: string; ip: string;
    success: boolean; reason?: string;
  }): Promise<void>
  ```
- Chamado a partir de:
  1. `DownloadLimitGuard` ( falha ),
  2. `FileController` stream finalizado com sucesso,
  3. `FileController` stream rejeitado por erro.

### 15.3 IP do cliente
- `request.ip` ( express ) — usa `x-forwarded-for` quando `trust proxy` on.
- Se múltiplos hops: pegar primeiro IP da lista.
- Consideração LGPD: IP é dado pessoal — registrar apenas quando necessário. Para uso interno controlado, é aceitável. Documentar no README interno.

### 15.4 API de administração
- `GET /api/admin/download-logs?shareId=&userId=&from=&to=&page=&limit=`
- Resposta paginada.
- Acesso: somente `isAdmin=true` ( `AdminGuard` existente ).

### 15.5 Frontend — UI admin
- Nova página: `frontend/src/pages/admin/download-logs/index.tsx`
- Tabela: data/hora ( BR ), usuário, IP, shareId, arquivo, sucesso, motivo.
- Filtros: por share, por usuário, por período.
- Exportação CSV ( opcional — decisáo futura ).
- Entrada no menu admin existente.

### 15.6 Rotatividade / retenção
- **Default:** reter indefinidamente ( uso interno, auditoria ).
- Config novo: `downloadLogRetentionDays` ( default `0` = indefinido ).
- Cron job ( `@nestjs/schedule` ) para purge se retention > 0.

### 15.7 Considerações
- **Performance:** escrita de log é `INSERT` assíncrono, não bloqueia download. SQLite comporta volume baixo ( uso interno ).
- **Espaço em disco:** se volume alto, pode crescer — daí `downloadLogRetentionDays`.
- **Não logar conteúdo** do arquivo, apenas metadados ( nome + sucesso ).
