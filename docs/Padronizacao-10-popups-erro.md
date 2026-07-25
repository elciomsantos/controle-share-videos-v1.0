# Padronização 10 — Popups de Erro (Escopo Crítico: Login + Upload)

> **Tema:** "Criar popup de interação com usuário informando de senha ou
> usuário incorretos na tela de login e demais erros do sistema como falha em
> uploads, por que os erros são apenas silenciosos"
> (item 10 da lista de objetivos em `Padronizacao.md`).
>
> **Status:** Decidido — documentação completa; implementação de código pendente.
> **Decisão formal:** 25/07/2026.
> **Dependências:** Tema 1 (sem bloqueio); tem relacionados o Tema 11
> (frontend field-error) e o Tema 3 (toast agregado de upload persistente).

---

## 1. Decisão

Substituir o padrão atual — **tudo vira toast vermelho genérico com título "Erro"
e corpo opaco** — por uma estratégia em **três camadas** que distingue erro
*recuperável inline*, erro *fatal bloqueante*, e *transiente por retry*:

| Camada | Quando usar | Componente | Exemplos |
|--------|-------------|------------|----------|
| **Inline field error** | Erro validável de campo de formulário | Mantine `<TextInput error=...>` / `<PasswordInput error=...>` | Credenciais inválidas, senha fraca, link em uso, email mal formatado |
| **Modal bloqueante** (`showErrorModal` reusado) | Erro fatal de fluxo: usuário não pode prosseguir sem decisão | `components/share/showErrorModal.tsx` (já existe — replicado) | Login impossibilitado (500/rede), `completeShare` falha, `accountNotActivated` |
| **Toast persistente** (mantido mas refinado) | Erro transiente com retry automático em andamento | Mantine Notifications com `autoClose: false` + `withCloseButton` + texto honesto | Chunk de upload falhou, "tentando novamente N/3" |

Princípios:

1. **Honestidade** — nunca exibir "tentando novamente" se não há mecanismo de
   retry real. Bug corrigido (relatório §7 do levantamento aponta
   `upload.notify.count-failed` enganoso — o `uploadFiles` já retornou).
2. **Localização completa** — lacunas i18n apontadas no levantamento
   (`common.error.unknown` ausente, `accountNotActivated` em inglês, `verify.*`
   em inglês, throttler 429 hardcoded em inglês) são corrigidas.
3. **Ação, não só descrição** — todo modal bloqueante tem botão único claro
   ("Tentar novamente", "Voltar", "Início", "Reenviar verificação"), nunca só
   "OK".
4. **Limpeza inteligente de notificações** — abandona `cleanNotifications()`
   global em `upload/index.tsx:260` que apaga toasts alheios. Usa IDs únicos
   por toast e limpa só os próprios.
5. **Toda falha tem catch** — `EditableUpload.save()` e seus awaits
   (`revertComplete`, `removeFiles`) ganham `try/catch`; hoje são unhandled
   rejections silenciosos.

**Decisões específicas de UI:**

**Tela de login (`/auth/signIn`)**
- Erro 401 `auth.wrongCredentials`: **inline field error no `PasswordInput`**
  ("E-mail ou senha incorretos") com limpeza do campo senha; removido o toast
  genérico. Link "Esqueci minha senha" exibido abaixo do campo (aparece
  somente após falha).
- Erro 401 `auth.accountNotActivated`: **modal bloqueante** "Verifique seu
  e-mail" com botão "Reenviar verificação" que chama `POST /api/auth/verify/resend`
  (endpoint já existe). Corrigir string pt-BR (hoje em inglês).
- Erro 429 (throttle): **modal bloqueante com countdown** "Muitas tentativas.
  Tente novamente em N segundos." Botão "Iniciar sessão" desabilitado com
  countdown exibido inline (interpolação i18n `{seconds}`). Frontend lê
  `Retry-After` header se presente; default 60.
- Erro 500/rede/timeout: **modal bloqueante** "Não foi possível conectar ao
  servidor" com botões "Tentar novamente" (refaz request) e "Voltar".
- Login com TOTP: manter notificação azul existente (já funciona).

**Upload (`/upload`)**
- `shareService.create` falha (link em uso → 400): **inline field error** no
  campo "Link" do `showCreateUploadModal` (validar `e.response.data.error ==
  "idInUse"` ou `field == "id"`); **não fechar o modal**.
- `shareService.create` falha (403/500): **modal bloqueante** "Não foi possível
  criar o compartilhamento" com botão "Tentar novamente" (re-envia payload) e
  "Cancelar". Não fechar modal.
- Chunk 5xx/rede: barra de progresso do arquivo fica em `-1` (estado de erro
  visual no `FileList`) + **toast AGRUPADO persistente** mostrando contagem 
  honesta "Falha ao enviar N arquivos" sem texto "tentando novamente" se não
  há retry real. Botão "Ver detalhes" no toast expande lista de arquivos falhos.
- `shareService.completeShare` 500: **modal bloqueante** "Não foi possível
  finalizar o compartilhamento" com botões "Tentar novamente" (chama
  `completeShare` again) e "Descartar" (chama `remove(shareId)` limpa share
  incompleto).
- `isShareIdAvailable` falha de rede: distinguir por `error.response.data.error`
  — se `idInUse` → mensagem "link em uso" (íntegro); se outro → `common.error.unknown`
  (chave nova adicionada), **não** a mensagem "link em uso" atual (engana).
- `EditableUpload.save()`: toda a função envolta em `try/catch`; qualquer
  rejeição (`revertComplete`, `uploadFiles`, `completeShare`, `removeFiles`)
  abre **modal único** "Não foi possível salvar as alterações" (mesmo template
  do `completeShare` modal).

**Erros de share público (`/share/[shareId]`) — não alterar**
- Já usam `showErrorModal` rico (limit excedido, removido, não encontrado,
  privado, scan em andamento — ver Tema 7). Mantém como está; serve de template.

**Erros administrativos (Redis/SMTP test) — não alterar**
- Já usam modal rico. Mantém como está.

---

## 2. Estado Atual (levantamento)

### 2.1 Login — estrutura
- `frontend/src/pages/auth/signIn.tsx` — página fina: carrega `<SignInForm>`.
- `frontend/src/components/auth/SignInForm.tsx` — toda a lógica de submit
  (~129 linhas). Único catch: `.catch(toast.axiosError)` (linha 80). Sem
  inline error, sem modal, sem try/catch.
- `frontend/src/services/auth.service.ts` — `signIn(email, password)` POST
  `/api/auth/signIn`. Decisão email-vs-username por regex `/@/`.
- Backend `auth.controller.ts:69` com `@Throttle({ default: { limit: 5, ttl: 60_000 }})`.
- `throttler-exception.filter.ts` retorna 429 com `message: "Too Many Requests"`
  **hardcoded em inglês** (sem i18n).

### 2.2 Login — feedback por cenário (atual)

| Cenário | HttpStatus | Backend i18n | Frontend atual |
|---------|-----------|--------------|-----------------|
| Campos vazios | 400 | `auth.emailOrUsernameRequired` | Toast vermelho genérico (mas yup já mostra inline no submit) |
| Credenciais inválidas | 401 | `auth.wrongCredentials` = "E-mail ou senha incorretos" | Toast vermelho genérico, senha não limpa, sem inline |
| Conta não ativada | 401 | `auth.accountNotActivated` = **"Account not activated" (em inglês!)** | Toast mistura pt-BR/EN |
| TOTP habilitado | 200 | `{loginToken}` | Notificação azul + redirect (OK) |
| Rate-limit 429 | 429 | "Too Many Requests" (hardcoded EN) | Toast vermelho sem countdown |
| Backend 500/rede | — | sem `data.message` | `toast.axiosError` cai em `error.message` ou **string vazia** (`common.error.unknown` referenciada mas ausente) |

### 2.3 Upload — estrutura
- `frontend/src/pages/upload/index.tsx` (317 linhas) — `uploadFiles` e o
  `useEffect` agregador que decide quando chamar `completeShare`.
- `frontend/src/components/upload/EditableUpload.tsx` (250 linhas) — `save()`
  com `await revertComplete()` e `Promise.all(removeFile)` **sem catch** (linhas
  186, 190, 201, 215) — unhandled rejections silenciosos.
- `frontend/src/components/upload/Dropzone.tsx` — toast curto "file-too-big"
  para tamanho excedido.
- `frontend/src/components/upload/modals/showCreateUploadModal.tsx` —
  `generateAvailableLink` faz `isShareIdAvailable` recursivamente; falha
  genérica vira `upload.modal.link.error.taken` ("link em uso") — **engana**
  quando o problema real é 500/rede.

### 2.4 Upload — feedback por cenário (atual)

| Cenário |-atual estado | Severidade UX |
|---------|---|---|
| `shareService.create` 400 (link em uso) | toast vermelho, modal permanece aberto | B (parcial) |
| `shareService.create` 403/500 | toast vermelho + modal **fecha** por `modals.closeAll()` precoce | B + bug UX |
| Chunk 4xx `unexpected_chunk_index` | auto-retry silencioso | A |
| Chunk 5xx/rede | barra `-1` + retry silencioso de 5s | A (sem toast por arquivo) |
| Agregado count > 0 falhas | toast persistente "Falha ao enviar N. **Tentando novamente**" (enganoso) | B |
| `completeShare` 500 | toast curto "generic-error" sem action | B |
| `isShareIdAvailable` rede | toast "link em uso" (**errado**) | B — enganoso |
| `EditableUpload.save` rejeição | unhandled rejection (sem catch) | **A — totalmente silencioso** |

### 2.5 Util `toast` (`frontend/src/utils/toast.util.tsx`)
- `toast.error/success/axiosError` — todos usam `showNotification` de
  `@mantine/notifications`. `axiosError` extrai via `getApiErrorMessage`
  (`error.util.ts`) lendo `data.message` (string ou array) → `data.error` →
  `error.message` → `JSON.stringify` → fallback `<FormattedMessage id="common.error.unknown" />`.
- `common.error.unknown` **NÃO EXISTE** em `pt-BR.ts` — fallback vira vazio.

### 2.6 Modais ricos já existentes (template)
- `components/share/showErrorModal.tsx` (54 linhas) — central,
  `closeOnClickOutside: false`, `withCloseButton: false`,
  `closeOnEscape: false`, title customizável + texto + botão único. Usado em
  `pages/share/[shareId]/index.tsx` para visitor-limit, removed, not-found,
  access-denied. **Este será o template para os popups do Tema 10.**
- `components/admin/configuration/TestRedisButton.tsx:43-79` e
  `TestEmailButton.tsx:52` usam `modals.openModal` para mostrar erro de conexão
  detalhado — confirma o padrão mas está fora do escopo crítico.

### 2.7 Lacunas i18n identificadas

| Chave | Estado | Impacto |
|-------|--------|---------|
| `common.error.unknown` (frontend) | **Ausente** | `toast.axiosError` fallback vira vazio |
| `auth.accountNotActivated` (backend pt-BR) | **Em inglês** ("Account not activated...") | Mistura idiomas no toast |
| `auth.userAlreadyActivated` (backend pt-BR) | **Em inglês** | Idem |
| `verify.*` (frontend pt-BR) | **Em inglês** (linhas 49-58) | Tela `/auth/verify` mistura idiomas |
| `upload.dropzone.description` (frontend) | **Em inglês** | Aparece no Dropzone |
| `share.notify.copy-too-big-error`, `share.notify.copy-not-supported-error`, `share.copy-text-contents`, `share.notify.copied-contents` (frontend) | **Em inglês** | Toast de clipboard ilegível |
| 429 throttler `"Too Many Requests"` (backend) | **Hardcoded EN** | Sem i18n |

---

## 3. Padronização

### 3.1 Frontend — novo helper `showBlockingErrorModal`

Criar `frontend/src/components/core/showBlockingErrorModal.tsx` reusando o padrão
de `showErrorModal.tsx` mas com API mais flexível:

```ts
export interface BlockingErrorAction {
  label: string;          // ex: "Tentar novamente"
  onClick: () => void | Promise<void>;
  variant?: "default" | "filled" | "light";
  color?: string;
}

export function showBlockingErrorModal(
  modals: ModalsContextValue,
  params: {
    title: string;
    description?: string;
    actions: BlockingErrorAction[];   // 1 ou 2 botões
    onClose?: () => void;
  }
): ModalBaseOverlayProps;
```

- Bloqueante: `closeOnClickOutside: false`, `withCloseButton: false`,
  `closeOnEscape: false`.
- Botões alinhados à direita; default variant "light" para secundária.
- Refatora `showErrorModal.tsx` para usar este helper (compat retroativa).

### 3.2 Frontend — `SignInForm.tsx` refatorado

```ts
const signIn = async (values) => {
  try {
    const result = await authService.signIn(values.email, values.password);
    // ... fluxo TOTP/sucesso existente
  } catch (e: any) {
    const status = e.response?.status;
    const underscore = (id: string) => t(id);
    
    if (status === 401) {
      if (e.response?.data?.message === t("auth.accountNotActivated")) {
        showBlockingErrorModal(modals, {
          title: t("signIn.activated-title"),
          description: t("signIn.activated-description"),
          actions: [
            { label: t("signIn.button.resend-verification"),
              onClick: () => authService.resendVerification(values.email),
              color: "blue" },
          ],
        });
        return;
      }
      // wrongCredentials → inline field error
      form.setFieldError("password", t("auth.wrongCredentials"));
      form.setFieldValue("password", "");
      setShowForgotPasswordLink(true);  // novo state, mostra link abaixo
      return;  // sem toast
    }
    
    if (status === 429) {
      const retryAfter = parseInt(e.response?.headers?.["retry-after"] ?? "60");
      setCountdown(retryAfter);
      setShowCountdown(true);  // state que desabilita botão + exibe counter
      showBlockingErrorModal(modals, {
        title: t("signIn.rate-limited-title"),
        description: t("signIn.rate-limited-description", { seconds: retryAfter }),
        actions: [{ label: t("common.button.go-back") }],
      });
      return;
    }
    
    // 500 / rede / timeout
    showBlockingErrorModal(modals, {
      title: t("signIn.server-error-title"),
      description: t("signIn.server-error-description"),
      actions: [
        { label: t("common.button.retry"),
          onClick: () => signIn(values), color: "blue" },
        { label: t("common.button.go-back") },
      ],
    });
  }
};
```

Novos states no componente: `showForgotPasswordLink`, `showCountdown`,
`countdown`. `useEffect` decrementa countdown de 1s; quando chega a 0, reabilita
botão.

### 3.3 Frontend — `showCreateUploadModal.tsx` refatorado

- Em `onSubmit`, distinguir erro:
  - Se `e.response.data.error === "idInUse"` → `form.setFieldError("link",
    t("upload.modal.link.error.taken"))`; **manter modal aberto**.
  - Senão → `showBlockingErrorModal({ title, actions: [retry, cancel] })`;
    **manter modal aberto**.
- Remover `modals.closeAll()` precoce — só fechar depois de `completeShare`
  sucesso (em `upload/index.tsx`, no callback).

### 3.4 Frontend — `upload/index.tsx` refatorado

- `uploadFiles`: substituir o toast `upload.notify.count-failed` por toast
  com **ID fixo** `upload-error-toast` + `autoClose: false`; usar
  `notifications.update({ id, ... })` em vez de `cleanNotifications()` global.
- Texto honesto: "Falha ao enviar N arquivos. Toque para ver detalhes." Sem
  "tentando novamente" (não há retry global real — documentado como bug).
- `completeShare` catch → `showBlockingErrorModal({ ..., actions: [retry
  `completeShare`, descartar `remove`] })`.

### 3.5 Frontend — `EditableUpload.tsx` refatorado

- Envolver `save()` todo em `try/catch`. Qualquer rejeição →
  `showBlockingErrorModal({ ..., actions: [retry `save`, go-back] })`.
- Cada `Promise.all` (`removeFile`) ganha `.catch` que propaga para o catch
  externo de `save()` (não unhandled).

### 3.6 Backend — `throttler-exception.filter.ts` com i18n

```ts
// backend/src/throttler/throttler-exception.filter.ts
import { I18nService } from "nestjs-i18n";

@Injectable()
export class ThrottlerExceptionFilter implements ExceptionFilter {
  constructor(private readonly i18n: I18nService) {}

  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    response
      .header("Retry-After", "60")
      .status(429)
      .json({
        statusCode: 429,
        message: this.i18n.t("auth.tooManyRequests"),
        error: "Throttler",
      });
  }
}
```

Nova chave backend `auth.tooManyRequests` = "Muitas tentativas. Aguarde N
segundos antes de tentar novamente." (gerada com `{seconds}` interpolado quando
possível).

### 3.7 Backend — diagnóstico em auth.service.ts

- Adicionar `logger.debug` (não `info`) para "Failed login attempt" (atualmente
  `logger.log` vaza username/IP para log INFO — fragilidade mínima).
- Manter estratégia "não distinguir usuário inexistente de senha errada"
  (anti-enumeration).

### 3.8 Correções i18n — lacunas

**Backend (`backend/src/i18n/pt-BR/auth.json`):**

```json
"accountNotActivated": "Conta não ativada. Verifique seu e-mail para ativar a conta.",
"userAlreadyActivated": "Conta já ativada. Faça login normalmente.",
"tooManyRequests": "Muitas tentativas. Aguarde {seconds} segundos antes de prosseguir."
```

(Substitui strings em inglês.)

**Frontend (`frontend/src/i18n/translations/pt-BR.ts`):**

```ts
"common.error.unknown": "Ocorreu um erro desconhecido. Tente novamente.",
"common.button.retry": "Tentar novamente",

// /auth/signIn
"signin.forgot-password": "Esqueci minha senha",
"signin.activated.title": "Conta não ativada",
"signin.activated.description": "Sua conta ainda não foi ativada. Verifique seu e-mail para o link de ativação.",
"signin.button.resend-verification": "Reenviar verificação",
"signin.activated.resent.success": "E-mail de verificação reenviado.",
"signin.rate-limited.title": "Muitas tentativas",
"signin.rate-limited.description": "Aguarde {seconds} segundos antes de tentar novamente.",
"signin.server-error.title": "Servidor indisponível",
"signin.server-error.description": "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",

// verify.* (traduzir 49-58)
"verify.title": "Verificar conta",
"verify.success": "Sua conta foi ativada com sucesso. Você já pode iniciar sessão.",
"verify.error": "O link de verificação é inválido ou expirou.",
"verify.button.signin": "Ir para o login",
"verify.info.title": "Verificação de e-mail",
"verify.info.description": "A verificação por e-mail está habilitada. Enviamos um link de verificação para seu endereço. Clique no link para ativar a conta.",
"verify.info.note": "Se não receber o e-mail em alguns minutos, verifique a pasta de spam.",
"verify.info.resend.button": "Reenviar e-mail de verificação",
"verify.info.resend.success": "E-mail de verificação reenviado com sucesso.",
"verify.info.resend.error": "Falha ao reenviar e-mail de verificação.",

// upload (mensagens honestas)
"upload.notify.count-failed-honest": "Falha ao enviar {count} arquivo(s). Toque para ver detalhes.",
"upload.error.title": "Não foi possível criar o compartilhamento",
"upload.error.description": "Ocorreu um erro ao finalizar o compartilhamento. Tente novamente.",
"upload.button.retry-create": "Tentar novamente",
"upload.button.discard": "Descartar",
"upload.complete.error.title": "Falha ao finalizar compartilhamento",
"upload.complete.error.description": "Não foi possível completar o compartilhamento. Os arquivos podem estar órfãos.",
"upload.save.error.title": "Falha ao salvar alterações",
"upload.save.error.description": "Não foi possível salvar as alterações no compartilhamento.",

// share (corrigir 4 chaves em inglês)
"share.copy-text-contents": "Copiar conteúdo do arquivo para a área de transferência",
"share.notify.copied-contents": "Conteúdo do arquivo copiado para a área de transferência",
"share.notify.copy-too-big-error": "Arquivo grande demais para copiar para a área de transferência",
"share.notify.copy-not-supported-error": "Copiar para a área de transferência requer conexão HTTPS",

// dropzone
"upload.dropzone.description": "Arraste arquivos aqui para começar o compartilhamento ou use Ctrl+V para anexar conteúdo da área de transferência. Aceitamos arquivos de até {maxSize} no total.",
```

### 3.9 `isShareIdAvailable` — distinguir erro

Em `showCreateUploadModal.tsx`:

```ts
} catch (e) {
  if (e.response?.data?.error === "idInUse") {
    form.setFieldError("link", t("upload.modal.link.error.taken"));
  } else {
    showBlockingErrorModal(modals, {
      title: t("common.error"),
      description: t("common.error.unknown"),
      actions: [{ label: t("common.button.retry"), onClick: generateAvailableLink, color: "blue" }],
    });
  }
}
```

---

## 4. Migration — Política

**Sem nova migration Prisma.** Tema puramente de frontend + ajustes i18n
backend. Não introduz schema, não introduz chaves de `Config`.

---

## 5. Critérios de Aceite

- [ ] Helper `showBlockingErrorModal` criado em `components/core/` reusando
      padrão `showErrorModal`.
- [ ] `showErrorModal.tsx` refatorado para usar o helper (sem regressão em
      `pages/share/[shareId]`).
- [ ] `SignInForm.tsx`: credenciais inválidas exibem **inline field error** no
      `PasswordInput` + limpeza do campo + exibição de link "Esqueci a senha".
      Toast removido para esse cenário.
- [ ] `SignInForm.tsx`: conta não ativada abre **modal bloqueante** com botão
      "Reenviar verificação" (chama `POST /api/auth/verify/resend`).
- [ ] `SignInForm.tsx`: rate-limit 429 abre **modal bloqueante com countdown**
      lendo `Retry-After` (default 60s), botão "Iniciar sessão" desabilitado
      durante o countdown.
- [ ] `SignInForm.tsx`: erro 500/rede/timeout abre **modal bloqueante** com
      "Tentar novamente" + "Voltar".
- [ ] `showCreateUploadModal.tsx`: erro 400 `idInUse` exibe inline field error
      no campo "Link".
- [ ] `showCreateUploadModal.tsx`: erro 403/500 abre modal e **não fecha** o
      modal de criação.
- [ ] `upload/index.tsx`: toast `count-failed` agora com ID fixo e texto honesto
      ("Falha ao enviar N. Toque para detalhes"), sem `cleanNotifications()`
      global.
- [ ] `upload/index.tsx`: `completeShare` 500 abre modal bloqueante com
      "Tentar novamente" (refaz `completeShare`) e "Descartar" (chama `remove`).
- [ ] `showCreateUploadModal.tsx`: `isShareIdAvailable` falha de rede abre
      modal genérico (não mais "link em uso" enganoso).
- [ ] `EditableUpload.tsx`: `save()` envolto em `try/catch`; qualquer rejeição
      (`revertComplete`, `uploadFiles`, `completeShare`, `removeFiles`) abre
      modal bloqueante único.
- [ ] `throttler-exception.filter.ts` injeta `I18nService` e usa
      `auth.tooManyRequests` em vez de hardcoded "Too Many Requests", mantém
      header `Retry-After: 60`.
- [ ] Chave frontend `common.error.unknown` adicionada (não mais fallback vazio).
- [ ] Chave frontend `common.button.retry` adicionada.
- [ ] Chaves `verify.*` (10 chaves) traduzidas em `pt-BR.ts`.
- [ ] Backend `accountNotActivated`, `userAlreadyActivated` traduzidos para
      pt-BR em `auth.json`.
- [ ] Backend `auth.tooManyRequests` adicionada com `{seconds}` interpolation.
- [ ] Chaves frontend `share.copy-text-contents`, `share.notify.copied-contents`,
      `share.notify.copy-too-big-error`, `share.notify.copy-not-supported-error`
      traduzidas.
- [ ] Chave frontend `upload.dropzone.description` traduzida.
- [ ] Chaves `signin.*` (8 novas) adicionadas em `pt-BR.ts`.
- [ ] Lint e typecheck passam em backend e frontend.
- [ ] Teste manual: login com credenciais erradas não mostra toast (mostra
      inline + link esqueci); login com 500 mostra modal; `completeShare` 500
      mostra modal com retry.

---

## 6. Mapa de Referências ao Código

| Arquivo | Linha | O que mexer |
|--------|------|------------|
| `frontend/src/components/core/showBlockingErrorModal.tsx` | — | NOVO: helper reutilizável |
| `frontend/src/components/share/showErrorModal.tsx` | toda | Refatorar para usar helper |
| `frontend/src/components/auth/SignInForm.tsx` | 60-80 | Refatorar catch para inline + modal + countdown |
| `frontend/src/components/auth/SignUpForm.tsx` | 60-79 | Aplicar mesmo padrão para signup (reaproveita) |
| `frontend/src/components/auth/TotpForm.tsx` | 60-63 | Aplicar mesmo padrão para TOTP |
| `frontend/src/components/upload/modals/showCreateUploadModal.tsx` | 60-77 | Distinguir `idInUse` de 500; não fechar modal precoce |
| `frontend/src/pages/upload/index.tsx` | 74, 123-139, 242-286 | Toast com ID fixo; modal bloqueante no `completeShare` catch |
| `frontend/src/components/upload/EditableUpload.tsx` | 145-220 | `save()` envolto em try/catch; modais em cada ramo de erro |
| `frontend/src/components/upload/Dropzone.tsx` | 115, 142, 155 | Traduzir mensagens file-too-big; eventualmente modal para pastas |
| `backend/src/throttler/throttler-exception.filter.ts` | todo | Injetar I18nService, usar `auth.tooManyRequests` |
| `backend/src/auth/auth.service.ts` | 130 | Mudar `logger.log` para `logger.debug` (failed login) |
| `backend/src/i18n/pt-BR/auth.json` | 17-18 | Traduzir `accountNotActivated`, `userAlreadyActivated` |
| `backend/src/i18n/pt-BR/auth.json` | — | Adicionar `tooManyRequests` |
| `frontend/src/utils/toast.util.tsx` | 26 | Confirmar uso de `common.error.unknown` (vai existir) |
| `frontend/src/i18n/translations/pt-BR.ts` | 49-58 | Traduzir `verify.*` |
| `frontend/src/i18n/translations/pt-BR.ts` | — | Adicionar `common.error.unknown`, `common.button.retry`, chaves `signin.*`, `upload.*`, traduzir `upload.dropzone.description`, `share.notify.copy-*`, `share.copy-text-contents` |

---

## 7. Riscos / Observações

1. **Refatoração de `Toast → Modal` pode parecer regressão de UX para usuários
   acostumados a toast** — mitigado pelo fato de o modal só aparecer para
   erros fatais; inline mantém feedback rápido sem bloqueio.
2. **`Retry-After` header já existe** no backend throttle (default 60), mas o
   frontend nunca foi instruído a ler; implementação simples em `e.response.headers['retry-after']`.
3. **Countdown cross-tab** — se usuário abre 2 abas e uma recebe 429, a outra
   está em estado normal. Aceitável ( throttler é por-IP/sessão); desabilitar
   app-wide exigiria sync via localStorage, fora do escopo.
4. **`auth.tooManyRequests` interpolation** — `nestjs-i18n` suporta args, usar
   `{ seconds: retryAfter }`. Backend precisa calcular segundos restantes a
   partir do header `Retry-After` ou do TTL do throttler (não exposto pela lib
   nativamente; workaround: sempre 60).
5. **Endpoint `POST /api/auth/verify/resend`** — confirmar existência no backend
   (`auth.controller.ts`); se não existir, criar (mínimo: reenvia email
   verification).
6. **`modals.closeAll()` precoce** — há 0 ocorrências em `upload/index.tsx`
   mas 1 em `showCreateUploadModal.tsx` (depois de `uploadCallback()`); precisa
   mover para depois do `completeShare` sucesso no `useEffect` do `upload/index.tsx`.
7. **Toast persistente ID fixo** — Mantine `showNotification` aceita `id`;
   `notifications.update({ id, ... })` atualiza sem duplicar Api.
8. **Compatibilidade com Tema 11** — Tema 11 (inline error de usuário
   duplicado) reusará o mesmo padrão de `form.setFieldError`. Implementar
   Tema 10 primeiro cria a infraestrutura; Tema 11 é caso de uso adicional.

---

## 8. Follow-ups (fora deste tema)

- **Estender popups para admin config** (`TestRedisButton`, `TestEmailButton`,
  `LogoConfigInput`) — já usam `modals.openModal`; uniformizar com helper novo.
- **Estender para todas as telas de account** (Trocar senha, TOTP enable/disable)
  que atualmente usam toast — aplicar mesmo padrão de inline + modal.
- **Refatorar `toast.axiosError` para usar `e.response.data.error` (código)
  quando existir** — hoje trata só `message`; códigos permitem mapeamentos
  mais limpos (E新中国 Tema 11).
- **Telemetria de erros** — capturar toast/modal abertura como evento analítico
  (postman, sentry); futuro.
- **Toast stacking visual no mobile** — Mantine notifications podem sobrepor;
  definir `top` único ou empilhamento (fora deste tema).

---

**Fim do Tema 10.**
