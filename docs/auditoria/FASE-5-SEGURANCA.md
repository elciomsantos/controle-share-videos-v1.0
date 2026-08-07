# Fase 5 — Auditoria de Segurança

**Status:** ✅ Concluída
**Data:** 2026-08-04
**Escopo:** auditoria baseada em **OWASP Top 10**, **CWE** e **OWASP ASVS**: autenticação/autorização (JWT, RBAC, fail-open de guardas), injeção (SQLi, XSS, injeção em e-mail), CSRF, SSRF, path traversal, exposição de dados (credenciais em URL), hardening HTTP (helmet/CSP/cookies), upload e antivírus (ClamAV), enumeração de contas e ciclo de vida de tokens.

---

## 5.1 Resumo Executivo

O backend é **bem endurecido nas camadas de infraestrutura**: o Prisma parametriza toda consulta (não há `$queryRaw`/`$executeRaw`), não há requisições a URLs externas no backend (SSRF improvável), helmet aplica CSP restritiva, há CSRF double-submit, cookies com `httpOnly` + `sameSite: strict`, e o upload é validado por magic bytes com allow-list de extensões. Entretanto, a **camada de guardas de autenticação tem um fail-open de alto risco** e a integração com ClamAV — anunciada no produto — **nunca é executada**. Foram identificados **8 achados**:

| Severidade | Qtd |
|---|---|
| Alto | 1 |
| Médio | 4 |
| Baixo | 3 |
| **Total** | **8** |

**Principal risco:** o `JwtGuard`, registrado como guarda **global** (`APP_GUARD`), possui `catch { return allowUnauthenticatedShares }` (SEC-01). Quando essa configuração é habilitada, a autenticação é desativada em **todas** as rotas da API — upload, listagem, atualização, expiração, deleção e rotas de admin — e não apenas nas rotas públicas de compartilhamento, como a documentação do produto sugere.

---

## 5.2 Critérios Avaliados

| Critério | Status |
|---|---|
| Autorização por token (JWT) — fail-closed | ❌ Falho (SEC-01) |
| RBAC (admin / operador / auditor) | ✅ Adequado (`RolesGuard` + checks de admin) |
| SQL Injection | ✅ Adequado (Prisma parametrizado; sem raw queries) |
| SSRF | ✅ Adequado (sem chamadas a URLs externas no backend) |
| XSS (previews, markdown, upload) | ✅ Adequado (CSP `sandbox`, DOMPurify, allow-list) |
| CSRF | ✅ Adequado (double-submit cookie + `sameSite: strict`) |
| Flags de cookie de sessão | ✅ Adequado (`httpOnly`, `sameSite: strict`, `secure` configurável) |
| Path traversal em download | ✅ Adequado (arquivos em disco renomeados para UUID; `fileId` validado no banco) |
| Antivírus / malware em uploads | ❌ Falho (SEC-02 — ClamAV nunca executado) |
| Recuperação de senha / tokens | ✅ Adequado (SEC-03/BKD-01 — token de reset expira em 1h) |
| E-mail transacional (injeção HTML) | ✅ Adequado (SEC-04 — valores de usuário escapados com `escapeHtml` quando `sendHtmlEmails=true`) |
| Credenciais em URL | ⚠️ Parcial (SEC-05 — token via body, sem senha em query string) |
| Enumeração de contas | ✅ Adequado (SEC-06 — resposta uniforme no `resendVerification`) |
| Rotação de refresh tokens | ✅ Adequado (SEC-07 — rotação atômica + reuse-detection) |
| Fail-open em detecção de magic bytes | ✅ Adequado (SEC-08 — fail-closed no `local.service`) |
| Segredo JWT / hashing de senha | ✅ Adequado (argon2; HS256 com segredo forte) |

---

## 5.3 Achados Detalhados

### SEC-01 — `JwtGuard` global com fail-open: `allowUnauthenticatedShares` desativa autenticação em **todas** as rotas

- **Problema:** O `JwtGuard` está registrado como guarda global (`APP_GUARD`) e seu `catch` retorna `share.allowUnauthenticatedShares`. Esse comportamento foi herdado do upstream (Pingvin Share), onde o guarda é aplicado **por rota** — mas aqui ele abrange a API inteira. Quando a configuração é habilitada (para permitir acesso anônimo a shares), **qualquer rota sem `@Public()` passa a aceitar requisições sem token válido**, incluindo `POST /api/shares` (upload), `GET /api/shares` (minhas shares), `GET /:id/from-owner`, `PATCH`, `DELETE` e `expire`. Os guardas derivados `ShareSecurityGuard` e `ShareOwnerGuard` chamam `super.canActivate(context)` dentro da base, herdando o fail-open.
- **Localização:** `backend/src/auth/guard/jwt.guard.ts:36-38`; registro global em `backend/src/app.module.ts:71-72`; herdado por `backend/src/share/guard/shareSecurity.guard.ts:51` e `backend/src/share/guard/shareOwner.guard.ts:60`.
- **Evidência:**
  ```ts
  // jwt.guard.ts
  } catch {
    return this.config.get("share.allowUnauthenticatedShares");
  }
  ```
  ```ts
  // app.module.ts (APP_GUARD global)
  { provide: APP_GUARD, useClass: JwtGuard },
  ```
  ```ts
  // shareOwner.guard.ts
  async canActivate(context: ExecutionContext) {
    // ... pré-checagens
    await super.canActivate(context); // → JwtGuard.canActivate → fail-open
  ```
- **Situação Atual:** Com `allowUnauthenticatedShares=false` (default no seed, `config.seed.ts:80`), o guarda falha fechado (401) e o comportamento é seguro. Porém, o simples ato de habilitar o acesso anônimo a shares — recurso legítimo do produto — **desbloqueia a API inteira**: upload, deleção, expiração, listagem e rotas de admin ficam acessíveis sem autenticação. O impacto é uma única opção de config com raio de destruição global, e a semântica do catch também mascara tokens **inválidos/vencidos** como "acesso anônimo permitido" em qualquer rota.
- **Implementação (recomendada):** Escopar o fail-open às rotas efetivamente públicas de share/arquivo. A forma mais robusta: remover o `catch` global do `JwtGuard` e fazer o bypass explícito nos guardas de share (`ShareSecurityGuard`) **apenas quando** a rota for `@Public()` e a config estiver habilitada — ou, no mínimo, condicionar o retorno do catch a `isPublicRoute` (que já é resolvido no início do `canActivate`).
- **Código Atual:**
  ```ts
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [...]);
    if (isPublic) return true;
    try {
      const result = (await super.canActivate(context)) as boolean;
      // ...
      return result;
    } catch {
      return this.config.get("share.allowUnauthenticatedShares");
    }
  }
  ```
- **Código Sugerido:**
  ```ts
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [...]);
    if (isPublic) return true;              // rotas declaradas públicas passam
    try {
      const result = (await super.canActivate(context)) as boolean;
      // ...
      return result;
    } catch {
      // Sem fail-open global: token ausente/inválido ⇒ 401.
      // O bypass anônimo de shares é tratado exclusivamente em
      // ShareSecurityGuard, somente em rotas @Public e sob a config.
      throw new UnauthorizedException();
    }
  }
  ```
- **Benefícios:** elimina a superfície em que um flag de config derruba a autenticação da API inteira; alinha o guarda ao princípio fail-closed (OWASP ASVS V2); preserva o acesso anônimo a shares via caminho explícito e auditável.
- **Riscos:** mudança de comportamento para quem já opera com `allowUnauthenticatedShares=true` — o fluxo anônimo de share deve ser movido para a config explícita nos guardas de share; requer teste dos cenários de token inválido/vencido.
- **Compatibilidade:** totalmente compatível — a API pública (NestJS Guard) permanece; apenas o semântico do fail-open muda. Nenhuma dependência externa alterada.

---

### SEC-02 — Integração com ClamAV nunca executada (antivírus é código morto)

- **Problema:** O módulo `ClamScanModule` e o serviço `ClamScanService.check()` existem e são importados no `AppModule`, mas **nenhum componente chama `check()`** (o único símbolo exportado). Uploads são validados por magic bytes e allow-list de extensões, mas arquivos ZIP/PDF/Office — tipos permitidos — podem conter malware que seria detectado pelo ClamAV. O produto anuncia "integração opcional com ClamAV" (Fase 0), porém a varredura nunca acontece; o container/daemon ClamAV, se provisionado, fica ocioso.
- **Localização:** `backend/src/clamscan/clamscan.module.ts` (providers/exports `ClamScanService`); `backend/src/clamscan/clamscan.service.ts:17-` (classe com `check()`); import em `backend/src/app.module.ts` (`ClamScanModule`); ausência de consumidor — `grep -rn "ClamScanService" src` retorna apenas o próprio módulo/serviço.
- **Evidência:**
  ```ts
  // clamscan.module.ts
  providers: [ClamScanService],
  exports: [ClamScanService],
  ```
  ```bash
  # nenhum consumidor — única referência fora do módulo é a importação no AppModule
  $ grep -rn "ClamScanService" src --include="*.ts" | grep -v node_modules
  src/clamscan/clamscan.service.ts:17
  src/clamscan/clamscan.module.ts:3
  src/clamscan/clamscan.module.ts:7
  src/clamscan/clamscan.module.ts:8
  ```
- **Situação Atual:** Após o `complete()` de um upload, nenhuma varredura é disparada. Um ZIP ou documento Office malicioso compartilhado internamente passa intacto até o destinatário. A checagem de zip-bomb (GAP-04, Fase 2) protege contra compressão abusiva, mas não contra conteúdo malicioso. **Nota de conciliação (Fase 6):** o comentário em `share.service.ts:246-249` afirma que a varredura foi removida por "decisão formal" registrada em `docs/Padronizacao-07-clamav.md`, mas esse documento **não existe no repositório** (`find` não retorna ocorrência) — a decisão não é verificável. Recomenda-se registrar a decisão (ou reativar a varredura conforme a política) e, em qualquer caso, remover o código morto do `ClamScanService` se for manter a remoção.
- **Implementação (recomendada):** Invocar `clamScanService.check(shareId)` (ou a lista de arquivos do share) no fluxo de `complete()` em `ShareService` e/ou na escrita dos arquivos, **antes** de o share ficar disponível; tratar falha do daemon como degradação configurável (`fail-open` com log, ou bloqueio se a política exigir — OWASP ASVS V12 "Malware protection"). Reutilizar o `check()` já implementado (retorna os arquivos infectados) e rejeitar o share ou marcar os arquivos.
- **Código Atual:**
  ```ts
  // Nenhuma chamada; exemplo do serviço existente (sem uso):
  async check(shareId: string) {
    const clamScan = await this.ClamScan;
    if (!clamScan) return [];
    // ...varre os arquivos de shareId...
  }
  ```
- **Código Sugerido:**
  ```ts
  // share.service.ts — complete()
  const infected = await this.clamScanService.check(shareId);
  if (infected.length > 0) {
    this.logger.warn(`Malware detectado em ${shareId}: ${infected.join(", ")}`);
    if (this.config.get("share.blockOnMalware")) {
      throw new BadRequestException(this.i18n.t("share.malwareDetected"));
    }
  }
  // prossegue com a disponibilização do share
  ```
- **Benefícios:** ativa a camada de defesa em profundidade já construída (CWE-434/ASVS 12.x); reduz risco de distribuição de malware na rede interna; valida o investimento em infraestrutura ClamAV.
- **Riscos:** latência no upload se o daemon estiver em outro host; decisão de política `blockOnMalware` (fail-open vs fail-closed) precisa ser documentada; daemon indisponível não deve travar o upload (manter fallback).
- **Compatibilidade:** compatível — adiciona dependência DI de `ClamScanService` em `ShareService` (já registrado no módulo); sem mudança de contrato externo.

---

### SEC-03 — Token de redefinição de senha nunca expira (ampliação de segurança de BKD-01)

- **Problema:** O token de reset de senha é criado com `expiresAt = 1 h`, mas `resetPassword()` **não valida a expiração** — apenas a existência do token. Na perspectiva de segurança, isso significa que um token capturado (e-mail cacheado/proxy, log, URL compartilhada) permanece utilizável por tempo indeterminado até o cron horário de limpeza remover o registro — uma janela indefinida de **account takeover** via redefinição de senha.
- **Localização:** `backend/src/auth/auth.service.ts` — `requestResetPassword()` l.147-173 (cria com 1 h) e `resetPassword()` l.175-193 (sem checagem de `expiresAt`). Já documentado em **BKD-01** (Fase 2); aqui o foco é o impacto de segurança.
- **Evidência:**
  ```ts
  // requestResetPassword()
  const expiresAt = dayjs().add(1, "hour").toDate(); // 1 h
  // resetPassword() — NÃO compara com expiresAt
  const user = await this.prisma.user.findFirst({
    where: { resetPasswordToken: { token } },
  });
  if (!user) throw new BadRequestException(this.i18n.t("auth.tokenInvalidOrExpired"));
  // ...atualiza a senha
  ```
- **Situação Atual:** O token viaja em URL de e-mail (`email.service.ts` → `/auth/resetPassword/{token}`), sem binding a device/IP e sem expiração efetiva. Qualquer vazamento do link gera acesso persistente à conta até o cleanup. O fluxo análogo `verifyAccount()` (l.195-204) faz a checagem de expiração — a correção é trivial e alinhada ao padrão já existente.
- **Implementação (recomendada):** Adicionar `expiresAt` à condição de busca ou comparar após o `findFirst`, exatamente como `verifyAccount()` faz com `activationTokenExpiresAt`. Considerar também invalidar tokens de reset em mudanças de e-mail/senha e em `signOut` de todos os dispositivos.
- **Código Atual:**
  ```ts
  const user = await this.prisma.user.findFirst({
    where: { resetPasswordToken: { token } },
  });
  if (!user) throw new BadRequestException(this.i18n.t("auth.tokenInvalidOrExpired"));
  ```
- **Código Sugerido:**
  ```ts
  const user = await this.prisma.user.findFirst({
    where: {
      resetPasswordToken: { token },
      // falha ao buscar tokens vencidos
      resetPasswordToken: { is: { expiresAt: { gt: new Date() } } },
    },
  });
  // ou, após o find:
  if (!user || (user.resetPasswordToken!.expiresAt < new Date()))
    throw new BadRequestException(this.i18n.t("auth.tokenInvalidOrExpired"));
  ```
- **Benefícios:** fecha a janela indefinida de redefinição de senha (OWASP ASVS V6.6.2, CWE-640); consistência com `verifyAccount()`; elimina dependência do cron para a revogação.
- **Riscos:** usuários com token expirado precisam solicitar novo link — comportamento esperado e já tratado pela UX de "token inválido ou expirado".
- **Compatibilidade:** compatível; nenhum contrato externo alterado; correção de 1-3 linhas.

---

### SEC-04 — Injeção de HTML em e-mails de share quando `email.sendHtmlEmails=true`

- **Problema:** Em `sendMailToShareRecipients`, placeholders `{desc}` e `{creator}` são interpolados **sem sanitização** no corpo do e-mail. Com `email.sendHtmlEmails=true`, a descrição do share (controlada pelo remetente) e o username do criador são renderizados como HTML no cliente de e-mail do destinatário — abrindo vetor de **phishing / injeção HTML** (links falsos, captura de credenciais) dentro da comunicação oficial do sistema.
- **Localização:** `backend/src/email/email.service.ts:65-` (`sendMailToShareRecipients`), com `.replaceAll("{desc}", ...)` e `.replaceAll("{creator}", ...)`; configuração `email.sendHtmlEmails` (default `false`, `config.seed.ts:201-203`).
- **Evidência:**
  ```ts
  await this.sendMail(
    recipientEmail,
    this.config.get("email.shareRecipientsSubject"),
    this.config
      .get("email.shareRecipientsMessage")
      .replaceAll("{desc}", description ?? /* fallback */)
      .replaceAll("{creator}", creator?.username ?? /* fallback */),
  );
  // sendMail() escolhe html|text conforme email.sendHtmlEmails
  [isHtml ? "html" : "text"]: text,
  ```
- **Situação Atual:** O vetor só existe com `sendHtmlEmails=true` (default desligado). Quando ligado, um share com descrição `<a href='https://evil.example'>...</a>` ou `<img src=...>` é entregue ao destinatário renderizando HTML arbitrário controlado pelo criador. Impacto: confiança abusada no domínio do remetente (phishing convincente).
- **Implementação (recomendada):** Sanitizar os valores interpolados quando o modo HTML estiver ativo (escapar HTML ou aplicar um sanitizer como `DOMPurify`/`sanitize-html` no backend), ou **sempre** enviar e-mails em texto puro para conteúdo controlado por usuário. Manter placeholders de sistema (URLs geradas pelo servidor) fora de valores sanitizados.
- **Código Atual:**
  ```ts
  .replaceAll("{desc}", description ?? this.i18n.t("..."))
  ```
- **Código Sugerido:**
  ```ts
  import { escapeHtml } from "../common/sanitize";
  const safeDescription = isHtml
    ? escapeHtml(description ?? this.i18n.t("..."))
    : description ?? this.i18n.t("...");
  // ... .replaceAll("{desc}", safeDescription)
  ```
- **Benefícios:** neutraliza injeção de HTML/links em e-mail (CWE-79/CWE-80, OWASP ASVS V7); protege destinatários de phishing com aparência oficial; mantém flexibilidade de templates.
- **Riscos:** escapar o texto pode afetar descrições legítimas que usam formatação simples (quebras de linha) — contornável preservando `\n`; requer decisão de política sobre rich content.
- **Compatibilidade:** compatível; somente valores controlados por usuário são sanitizados; URLs de sistema intocadas.
- **✅ Resolvido (2026-08-07):** `backend/src/common/sanitize.ts` (`escapeHtml`) criado; aplicado via `escapeUserInput` em `email.service.ts` para `{creator}`, `{creatorEmail}`, `{desc}`, `{recipientEmail}`, `{fileName}` e `{email}` quando `email.sendHtmlEmails=true`. +4 testes em `email.service.spec.ts` (unit 67/67).

---

### SEC-05 — `includePasswordInShareLink=true` coloca senha de share na query string

- **Problema:** Quando habilitado, o link de share carrega a senha via `?pwd=...` na URL. A senha passa a residir em histórico do navegador, logs do proxy/reverse proxy (Caddy/nginx), servidores de referer e ferramentas de telemetria. É uma violação da prática de "nunca colocar credenciais em URL" (CWE-598).
- **Localização:** `backend/src/share/guard/shareSecurity.guard.ts:74` (`if (this.configService.get("share.includePasswordInShareLink"))` → auto-auth via `?pwd=`); config default `false` em `config.seed.ts:175-177`.
- **Evidência:**
  ```ts
  // shareSecurity.guard.ts:74
  if (this.configService.get("share.includePasswordInShareLink")) {
    // valida pwd vindo da query e emite cookie share_{id}_token
  }
  ```
- **Situação Atual:** Opt-in, default desligado. Mitigações presentes: `referrerPolicy: same-origin` (helmet) reduz vazamento via Referer, e o token é confirmado e convertido em cookie de sessão. Porém, quando ativado, a senha fica gravada nos logs do proxy e no histórico — irreversível após o compartilhamento do link.
- **Implementação (recomendada):** Manter o default desligado; documentar no painel de admin o trade-off; e, se ativado, considerar não logar query strings no proxy (config de log Caddy/nginx) e adicionar aviso na UI ao gerar o link.
- **Código Atual:**
  ```ts
  // config.seed.ts — includePasswordInShareLink default false
  ```
- **Código Sugerido:** Manter `false` por padrão; documentar na seção de implantação a necessidade de mascarar query strings nos logs do proxy quando o recurso for usado.
- **Benefícios:** reduz exposição acidental de credenciais em infraestrutura; sem mudança de código funcional.
- **Riscos:** nenhum — recomendação de política/configuração.
- **Compatibilidade:** compatível; nenhuma alteração de API.

---

### SEC-06 — Enumeração de contas via `resendVerification` (oráculo de e-mail cadastrado)

- **Problema:** Em `resendVerification()`, e-mail não cadastrado retorna **sucesso silencioso** (200 sem ação), enquanto e-mail cadastrado e já ativado lança `400 userAlreadyActivated`. Essa diferença permite a um atacante distinguir e-mails registrados (e ativos) de não registrados, apoiando ataques de *credential stuffing* e phishing direcionado.
- **Localização:** `backend/src/auth/auth.service.ts` — `resendVerification()` (l.214-238): `if (!user) return;` vs `throw new BadRequestException(auth.userAlreadyActivated)`.
- **Evidência:**
  ```ts
  if (!user) return; // 200 silencioso
  if (user.isActivated) {
    throw new BadRequestException(this.i18n.t("auth.userAlreadyActivated"));
  }
  ```
- **Situação Atual:** O vetor é limitado: a rota tem throttle (20/5 min) e a informação de "já ativado" só é retornada para e-mails conhecidos — mas um atacante com muitos IPs (distribuído) pode ainda assim montar a lista. O `signIn` usa mensagem genérica (`auth.wrongCredentials`) — bom — mas `accountNotActivated` (auth.service.ts:114-116) diferencia contas existentes quando a senha confere.
- **Implementação (recomendada):** Uniformizar as respostas de `resendVerification`: sempre retornar sucesso (ou sempre erro genérico) independentemente de o e-mail existir ou estar ativado, realizando a ação apenas quando aplicável. Aplicar a mesma lógica de mensagem genérica nos fluxos de reset (`requestResetPassword` já é silencioso — manter).
- **Código Atual:**
  ```ts
  if (!user) return;
  if (user.isActivated) {
    throw new BadRequestException(this.i18n.t("auth.userAlreadyActivated"));
  }
  ```
- **Código Sugerido:**
  ```ts
  if (!user || user.isActivated) return; // resposta idêntica p/ não-cadastrado e ativado
  // envia novo token apenas para usuários pendentes
  ```
- **Benefícios:** remove o oráculo de e-mail ativo (OWASP ASVS V2.3.1, CWE-204); impede fingerprinting da base de usuários.
- **Riscos:** usuários ativados que chamam "reenviar" não recebem erro visível — UX aceitável e comum; pode ser complementado por nota informativa.
- **Compatibilidade:** compatível; comportamento de sucesso preservado para o fluxo principal (reenvio de token pendente).
- **✅ Resolvido (2026-08-07):** `resendVerification()` em `backend/src/auth/auth.service.ts` agora retorna silenciosamente para e-mail não cadastrado **e** para já ativado (`if (!user || user.isActivated) return;`) — resposta idêntica nos dois casos, eliminando o oráculo. +3 testes em `auth.service.spec.ts` (unit 76/76).

---

### SEC-07 — Rotação de refresh token não atômica e sem detecção de reuso

- **Problema:** `refreshAccessToken()` executa três passos fora de transação: `findUnique` → `delete` (token antigo) → `create` (novo). Dois `refresh` paralelos com o mesmo token podem causar erro de concorrência (o segundo `delete` falha) ou, em cenário de corrida, **dois pares de tokens válidos**. Além disso, não há *reuse detection*: o reuso de um refresh token já rotacionado não é registrado/alertado — um indicador clássico de roubo de sessão (CWE-294/345).
- **Localização:** `backend/src/auth/auth.service.ts` — `refreshAccessToken()` (l.300-330).
- **Evidência:**
  ```ts
  const refreshTokenMetaData = await this.prisma.refreshToken.findUnique({ where: { token: refreshToken }, include: { user: true } });
  if (!refreshTokenMetaData || refreshTokenMetaData.expiresAt < new Date()) throw new UnauthorizedException();
  await this.prisma.refreshToken.delete({ where: { id: refreshTokenMetaData.id } });   // passo 1
  const newRefreshToken = await this.createRefreshToken(refreshTokenMetaData.user.id); // passo 2
  const accessToken = await this.createAccessToken(refreshTokenMetaData.user, newRefreshToken.refreshTokenId);
  ```
- **Situação Atual:** A rotação existe e revoga o token antigo em uso normal. O risco é de concorrência (refreshes paralelos de clientes/abas) quebrar a sessão com 500/401 inesperados, e a ausência de *reuse detection* não sinalizar tentativa de replay de token roubado.
- **Implementação (recomendada):** Envolver delete+create em transação; e, sobre o `delete`, retornar `true`/`false` (via `deleteMany`) para detectar reuso — se o token já não existia (replay), revogar a família de refresh tokens do usuário e registrar alerta de auditoria.
- **Código Atual:**
  ```ts
  await this.prisma.refreshToken.delete({ where: { id: refreshTokenMetaData.id } });
  ```
- **Código Sugerido:**
  ```ts
  const { count } = await this.prisma.refreshToken.deleteMany({
    where: { id: refreshTokenMetaData.id },
  });
  if (count === 0) {
    // Reuso detectado — token antigo já consumido: potencial roubo.
    await this.revokeAllRefreshTokens(refreshTokenMetaData.user.id);
    await this.downloadLogService?.record({ /* alerta de segurança */ });
    throw new UnauthorizedException();
  }
  ```
- **Benefícios:** sessão resiliente a corridas; detecção de replay de refresh token roubado (OWASP ASVS V3.2.1); trilha de auditoria para incidentes.
- **Riscos:** revogar a família em reuso legítimo (ex.: retry de cliente) pode desconectar o usuário — exigir política de tolerância (janela curta) ou apenas registrar.
- **Compatibilidade:** compatível; API de refresh inalterada.
- **✅ Resolvido (2026-08-07):** `refreshAccessToken()` em `backend/src/auth/auth.service.ts` agora executa `findUnique` + `deleteMany` + `create` dentro de `$transaction`. Se `deleteMany` retornar `count === 0` (token já consumido → replay), todos os refresh tokens do usuário são revogados na mesma transação e um `UnauthorizedException` é lançado após o commit — a exceção fica fora da tx para o rollback não desfazer a revogação. `logger.warn` registra o incidente de reuso. +3 testes em `auth.service.spec.ts` (unit 76/76).

---

### SEC-08 — Fail-open documentado na detecção de magic bytes

- **Problema:** Em `local.service.ts`, o `catch` da validação de magic bytes engole **erros inesperados** e deixa o upload continuar ("fail-open on detection errors"). Se a função de detecção lançar em cenário adverso (arquivo corrompido, edge case do parser), a checagem de tipo é contornada e só resta a allow-list de extensões como barreira.
- **Localização:** `backend/src/file/local.service.ts:192-197`.
- **Evidência:**
  ```ts
  } catch (e) {
    // Validation failures are re-thrown for the client; unexpected errors
    // are swallowed so the upload still completes (fail-open on detection
    // errors) — the extension allowlist remains the primary safeguard.
    if (e instanceof BadRequestException) throw e;
  }
  ```
- **Situação Atual:** A decisão é deliberada e comentada: erros de validação (magic bytes não correspondem à extensão) são re-lançados; apenas falhas inesperadas seguem em frente. O risco é baixo (detecção estável), mas a política de fail-open contraria o princípio fail-closed adotado no resto do sistema.
- **Implementação (recomendada):** Para falhas inesperadas de detecção, **rejeitar** o arquivo (fail-closed) ou, se a disponibilidade for prioridade, registrar alerta estruturado e permitir o upload apenas com a extensão na allow-list (como hoje). Recomenda-se reverter para rejeição e monitorar falsos positivos em produção.
- **Código Atual:**
  ```ts
  if (e instanceof BadRequestException) throw e;
  // erros inesperados: continua
  ```
- **Código Sugerido:**
  ```ts
  if (e instanceof BadRequestException) throw e;
  this.logger.error(`Magic-byte detection falhou para ${fileId}: ${e}`);
  throw new BadRequestException(this.i18n.t("file.typeUnverified"));
  ```
- **Benefícios:** remove a exceção ao princípio fail-closed; impede contorno da validação de tipo em cenários de parser quebrado (CWE-436).
- **Riscos:** uploads legítimos com tipos raros podem ser bloqueados se o detector falhar — mitigado por monitoramento e allow-list.
- **Compatibilidade:** compatível; contrato de erro idêntico (`400 Bad Request`).
- **✅ Resolvido (2026-08-07):** o `catch` de `local.service.ts` agora é fail-closed: erros de validação (magic bytes ≠ extensão) continuam re-lançados; falhas inesperadas da detecção fazem `logger.error`, removem o arquivo em disco (`fs.unlink`) e lançam `BadRequestException(file.typeUnverified)`. Nova chave i18n `file.typeUnverified` em `backend/src/i18n/pt-BR/file.json`. +3 testes em `local.service.spec.ts` (unit 76/76).

---

## 5.4 Fortalezas / Mitigações já existentes (não são achados)

- **SQL Injection:** inexistente — todas as consultas via Prisma parametrizado; nenhum `$queryRaw`/`$executeRaw` no código (`grep` não retornou ocorrências).
- **SSRF:** inexistente — nenhum `fetch`/`axios` a URLs externas no backend; `sharp` processa apenas uploads locais.
- **XSS:** previews de arquivo servidos com header `Content-Security-Policy: sandbox` (`file.controller.ts:184,216`); markdown sanitizado com DOMPurify no frontend; upload de `.html`/`.htm` fora da allow-list; extensão/MIME validados.
- **CSRF:** double-submit cookie (`X-CSRF-Token`) em `main.ts` + `sameSite: strict`; mutações exigem o token; exceções explícitas para refresh/signOut (seguros por SameSite).
- **Cookies de sessão:** `httpOnly: true`, `sameSite: "strict"`, `secure` configurável (`auth.service.ts:365-383`); cookie de share com `sameSite: lax` (adequado para navegação de links) e `httpOnly`.
- **Hardening HTTP (helmet):** CSP restritiva (`scriptSrc 'self'`, `frameAncestors 'none'`, `objectSrc 'none'`, `upgradeInsecureRequests`), HSTS com `preload`, `referrerPolicy: same-origin`, COOP/CORP same-origin.
- **Path traversal em download:** arquivos em disco renomeados para UUID (`${shareId}/${file.id}`); `fileId` precisa existir no banco antes de qualquer `createReadStream`/`unlink` (validado em `local.service.ts:274-292, 307-320`); `shareId` validado por regex `[a-zA-Z0-9-]` (IdValidation).
- **Hashing/segredos:** senhas com argon2; JWT HS256 com `JWT_SECRET` de 256 bytes (forte); expiração de access token curta (15 min) com rotação de refresh.
- **2FA:** TOTP opcional (`otplib`) e exigido para login por senha quando habilitado.
- **RBAC:** `RolesGuard` global + checks explícitos de `isAdmin`/`role` nas operações sensíveis (expirar/deletar shares de terceiros, admin de sistema).
- **Throttling:** global 100/60 s + `@Throttle` em rotas sensíveis (signIn 5/60 s; signUp/reset/verify 20/5 min; share GET/view/token 10-30/60 s; download de arquivo com limite).
- **Limites de download/visualização:** aplicados também em requisições com token (`maxDownloads`/`maxViews`), com trilha de auditoria de sucesso/falha.
- **CSRF/generalização de erros em login:** `signIn` retorna mensagem genérica (`wrongCredentials`) independente de usuário/senha — bom padrão anti-enumeração (parcial, ver SEC-06).

---

## 5.5 Classificação Risco × Impacto × Esforço

| ID | Achado | Risco | Impacto | Esforço | Quick Win? |
|---|---|---|---|---|---|
| SEC-01 | `JwtGuard` global fail-open (`allowUnauthenticatedShares`) | Alto | Segurança | Médio | ⚠️ parcial |
| SEC-02 | ClamAV nunca executado (antivírus é código morto) | Médio | Segurança | Médio | ❌ |
| SEC-03 | Token de reset de senha não expira (c/ BKD-01) | Médio | Segurança | Muito Baixo | ✅ (1 linha) |
| SEC-04 | Injeção HTML em e-mails com `sendHtmlEmails=true` | Médio | Segurança | Baixo | ✅ |
| SEC-05 | Senha em query string (`includePasswordInShareLink`) | Médio | Segurança | Muito Baixo | ✅ (política) |
| SEC-06 | Enumeração de contas via `resendVerification` | Baixo | Segurança | Muito Baixo | ✅ |
| SEC-07 | Rotação de refresh token não atômica / sem reuse-detection | Baixo | Disponibilidade | Médio | ✅ |
| SEC-08 | Fail-open na detecção de magic bytes | Baixo | Segurança | Muito Baixo | ✅ |

---

## 5.6 Recomendações Prioritárias

1. **SEC-01 (Alto):** remover o fail-open global do `JwtGuard` (lançar `UnauthorizedException` no `catch`) e concentrar o acesso anônimo a shares no `ShareSecurityGuard`, restrito a rotas `@Public()` e sob a config. É o único achado que pode derrubar a autenticação da API inteira.
2. **SEC-03 (Médio, Quick Win):** validar `expiresAt` no `resetPassword()` — fecha a janela indefinida de account takeover; alinha com `verifyAccount()`.
3. **SEC-02 (Médio):** conectar `ClamScanService.check()` ao `complete()` do upload com política configurável de bloqueio — ativa a camada antivírus já provisionada.
4. **SEC-04 (Médio):** sanitizar `{desc}`/`{creator}` quando `sendHtmlEmails=true` (escapar HTML) — neutraliza phishing via e-mail oficial.
5. **SEC-06/05/08 (Baixos):** uniformizar resposta do `resendVerification`; documentar mascaramento de query strings no proxy se `includePasswordInShareLink` for usado; rejeitar (fail-closed) quando a detecção de magic bytes falhar de forma inesperada. — *SEC-06 e SEC-08 pagos em 2026-08-07; resta apenas SEC-05 (documentação do proxy).*
6. **SEC-07 (Baixo):** transação no refresh + `deleteMany` para detecção de reuso com revogação da família de tokens. — *Pago em 2026-08-07.*

---

## 5.7 Notas de Execução

- Nenhum achado desta fase foi aplicado — correções pertencem à Fase 12 (proposta) e ao plano de execução (Fase 13), salvo decisão explícita do solicitante.
- **Referências cruzadas:** BKD-01/BKD-05/BKD-07 (Fase 2 — Backend); FRN-01 (Fase 3 — Frontend, JWT decodificado sem verificação de assinatura no middleware); Fase 9 (Docker/DevOps) deve verificar se o daemon ClamAV está provisionado no `docker-compose` e se o proxy mascara query strings; Fase 6 (Performance) deve revisar o custo do `resendVerification`/refresh e a latência de `complete()`.
- **Evidências coletadas em:** `auth/guard/jwt.guard.ts`, `app.module.ts`, `share/guard/shareSecurity.guard.ts`, `share/guard/shareOwner.guard.ts`, `auth/auth.service.ts`, `email/email.service.ts`, `file/local.service.ts`, `file/file.controller.ts`, `main.ts`, `share/share.service.ts`, `prisma/seed/config.seed.ts`.
- **Cobertura OWASP ASVS (resumo):** V1 (arquitetura) parcial; V2 (auth) — SEC-01, SEC-03, SEC-06, SEC-07; V3 (session) — SEC-07; V4 (access) — SEC-01; V5 (validation) — SEC-08; V7 (XSS) — SEC-04; V12 (malware) — SEC-02; V14 (config/headers) — forte.
