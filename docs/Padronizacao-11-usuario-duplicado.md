# Padronização 11 — Usuário Duplicado (UX Completa)

> **Tema:** "Quando tento cadastrar um novo usuário e já existe um usuário
> duplicado com o mesmo login ou e-mail, o sistema deveria apresentar um erro
> no campo duplicado, destacando-o na tela de cadastro. Mas o comportamento
> atual gera apenas um erro silencioso. Solicita-se que o sistema indique,
> no campo em questão, que o valor já está em uso."
> (item 11 da lista de objetivos em `Padronizacao.md`).
>
> **Status:** Decidido — documentação completa; implementação de código pendente.
> **Decisão formal:** 25/07/2026.
> **Dependências:** Tema 10 (helper `showBlockingErrorModal`); nenhuma outra
> dependência cruzada.

---

## 1. Decisão

Substituir o toast vermelho genérico atual por **erros inline nos campos
duplicados** (`form.setFieldError(...)`) em ambos os fluxos: criação de usuário
pelo admin (`POST /api/users`) e auto-cadastro público (`POST /api/auth/signUp`).

### 1.1 Estratégia: Duas camadas, sem debounce

| Camada | Quando | Onde |
|--------|--------|------|
| **Inline field error** (obrigatório) | Após resposta 400 do backend com `message` contendo `"já existe"` ou campo em `error.field` | `showCreateUserModal.tsx` / `SignUpForm.tsx` |
| **Debounce pre-validation** (opcional) | Antes do submit, verificar disponibilidade via `GET /api/users/exists?username=X&email=Y` | `showCreateUserModal.tsx` (admin), `SignUpForm.tsx` (signup) |

**Decisões específicas:**

1. **Contrato de erro backend atual** — já é parcialmente correto:
   - `user.service.ts:73` extrai `e.meta?.target[0]` (ex: `"username"` ou
     `"email"`) e injeta via i18n `auth.userAlreadyExists` com `{ field }`.
   - Mensagem resultante: `"Um usuário com este username já existe"` (pt-BR).
   - HTTP response: `{ statusCode: 400, message: "Um usuário com este
     username já existe", error: "Bad Request" }`.
   - **Problema**: o campo `target[0]` do Prisma retorna o nome da **constraint**
     do SQLite (ex: `"username"`, `"email"`), que é coincidentemente igual ao
     nome do campo do formulário. Mas isso não é garantido em todos os
     providers.

2. **Refatoração backend (recomendada, robusta)** — retornar `field` como campo
   dedicado na resposta:

   ```json
   {
     "statusCode": 400,
     "message": "Um usuário com este username já existe",
     "error": "duplicated_field",
     "field": "username"
   }
   ```

   - `error` muda de `"Bad Request"` para `"duplicated_field"` (facilita
     parse no frontend sem regex).
   - `field` é adicionado explicitamente (não depende de parsing de string
     de mensagem i18n).
   - Compatível com `error.util.ts:getApiErrorMessage()` (continua lendo
     `data.message` para toast), mas agora o frontend também lê `data.field`.

3. **Frontend `showCreateUserModal.tsx`** — substituir `.catch(toast.axiosError)`
   por `.catch((e) => { ... })` que:
   - Se `e.response?.data?.field` existe → `form.setFieldError(field,
     e.response.data.message)`.
   - Caso contrário → fallback para `toast.axiosError` (erros inesperados).
   - **Não fechar o modal** (já é o comportamento atual com toast).

4. **Frontend `SignUpForm.tsx`** — substituir `.catch(toast.axiosError)` por
   `.catch((e) => { ... })` com mesma lógica.

5. **Debounce pre-validation (admin)** — opcional mas recomendado:
   - Criar endpoint `GET /api/users/check-availability?username=X&email=Y`
     que retorna `{ available: boolean, field?: "username" | "email" }`.
   - No admin, validar 500ms após último keystroke nos campos username/email.
   - Exibir erro inline **antes** do submit (UX proativa).
   - **Não aplicar no signup público** para não expor enumerate de usernames
     (segurança anti-enumeration).

6. **Mapeamento nome de campo → rótulo i18n** — traduzir `username` →
   `"Nome de usuário"` e `email` → `"E-mail"`. Usar `FormFieldLabels`
   mapeamento estático (já que os campos são fixos).

---

## 2. Estado Atual (levantamento)

### 2.1 Fluxo admin — `showCreateUserModal.tsx`
- **Componentes**: `TextInput` (username), `TextInput` (email), `Select` (role),
  `Switch` (generatePassword), `PasswordInput` (condicional).
- **Submit**: `form.onSubmit(async (values) => { userService.create({...}).then(...)
  .catch(toast.axiosError) })` — única linha de catch (linha 131).
- **Feedback atual**: toast vermelho com `getApiErrorMessage(e)` que lê
  `e.response.data.message` = "Um usuário com este username já existe" (ou email).
- **Bug**: modal fecha prematuramente via `modals.closeAll()` na linha 129
  (executado mesmo quando `temporaryPassword` não existe — `modals.closeAll()`
  está **fora** do `if`). **Correção**: mover para dentro do `.then()` após
  a exibição do modal de senha temporária, ou melhor, substituir `closeAll()`
  por `modals.closeModal(modalsState.currentModalId)` se houver referência.

### 2.2 Fluxo público — `SignUpForm.tsx`
- **Componentes**: `TextInput` (username), `TextInput` (email), `PasswordInput`.
- **Submit**: `signUp(email, username, password)` que chama `authService.signUp(...)`.
- **Catch**: `.catch(toast.axiosError)` (linha 77).
- **Feedback atual**: toast vermelho com mesma mensagem i18n.

### 2.3 Backend — contrato de erro P2002
- `user.service.ts:68-81` e `auth.service.ts:81-94` — idênticos:
  - Extrai `duplicatedField = e.meta?.target[0]` (string Prisma constraint name).
  - `throw new BadRequestException(this.i18n.t("auth.userAlreadyExists", { args: { field: duplicatedField } }))`.
  - NestJS serializa como `{ statusCode: 400, message: "...", error: "Bad Request" }`.
- **i18n key**: `auth.userAlreadyExists` = `"Um usuário com este {field} já existe"` (`backend/src/i18n/pt-BR/auth.json:16`).
- **Valores possíveis de `duplicatedField`**: `"username"` ou `"email"` (constraint names SQLite).

### 2.4 Frontend `error.util.ts`
- `getApiErrorMessage()` lê `data.message` (string ou array) → `data.error` →
  `error.message` → `JSON.stringify` → fallback.
- **Não lê `data.field`** — precisa ser estendido.

### 2.5 Frontend `user.type.ts`
- `CreateUser` type: `{ username, email, password?, isAdmin?, role?,
  generatePassword?, shareSizeLimit? }` — sem campo `field` no response.
- `CreateUserResponse`: `{ id, username, email, isAdmin, role, isActivated,
  totpVerified, hasPassword, shareSizeLimit?, temporaryPassword? }` — tipo de
  retorno de sucesso, não de erro.

---

## 3. Padronização

### 3.1 Backend — refatorar P2002 handler para incluir `field`

Criar helper compartilhado `backend/src/common/duplicated-field.exception.ts`:

```ts
import { HttpException, HttpStatus } from "@nestjs/common";

export class DuplicatedFieldException extends HttpException {
  constructor(
    message: string,
    readonly field: "username" | "email",
  ) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message,
        error: "duplicated_field",
        field,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
```

Substituir em `user.service.ts` (linhas 68-81):

```ts
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code == "P2002") {
    const rawField: string = (e.meta?.target as string[])?.[0] ?? "field";
    const field: "username" | "email" = rawField === "email" ? "email" : "username";
    throw new DuplicatedFieldException(
      this.i18n.t("auth.userAlreadyExists", { args: { field } }),
      field,
    );
  }
  throw e;
}
```

Mesma refatoração em `auth.service.ts` (linhas 81-94, método `signUp`).

**Razão do mapeamento explícito**: `e.meta.target[0]` depende do provider do
Prisma. SQLite retorna o nome da constraint como foi definido no schema
(`"username"`, `"email"`). PostgreSQL retornaria `"User_username_key"`. O
mapeamento explícito é portável.

### 3.2 Frontend — `error.util.ts` estendido

Adicionar campo `field` à extração:

```ts
export function getApiErrorField(error: any): string | undefined {
  const data = error?.response?.data;
  const field = data?.field;
  if (typeof field === "string" && field.trim().length > 0) return field;
  return undefined;
}
```

Manter `getApiErrorMessage` inalterado (legado para toast fallback).

### 3.3 Frontend — `showCreateUserModal.tsx` refatorado

```tsx
.catch((e) => {
  const field = getApiErrorField(e);
  if (field === "username" || field === "email") {
    form.setFieldError(field, getApiErrorMessage(e) ?? t("admin.users.error.duplicated"));
  } else {
    toast.axiosError(e);
  }
});
```

**Remover `modals.closeAll()` da linha 129** — mover para o callback de
sucesso correto (após exibição de `temporaryPassword` modal):

```tsx
.then((result) => {
  getUsers();
  if (result.temporaryPassword) {
    modals.openConfirmModal({ ... });  // já existe
  }
  modals.closeAll();  // agora só fecha DEPOIS do modal de senha, não antes
})
.catch((e) => {
  const field = getApiErrorField(e);
  if (field === "username" || field === "email") {
    form.setFieldError(field, getApiErrorMessage(e) ?? t("admin.users.error.duplicated"));
  } else {
    toast.axiosError(e);
  }
});
```

**Título do modal hardcoded** `"Create user"` (linha 27) — traduzir para
`{t("admin.users.modal.create.title")}`. Adicionar chave:

```json
"admin.users.modal.create.title": "Criar usuário"
```

### 3.4 Frontend — `SignUpForm.tsx` refatorado

```tsx
.catch((e) => {
  const field = getApiErrorField(e);
  if (field === "username" || field === "email") {
    form.setFieldError(field, getApiErrorMessage(e) ?? t("signup.error.duplicated"));
  } else {
    toast.axiosError(e);
  }
});
```

### 3.5 Frontend — debounce pre-validation (admin apenas)

Criar `frontend/src/hooks/useDebounce.ts` (ou usar lib existente, ex:
`useDebouncedCallback` de `use-debounce` se disponível no package.json;
senão, debounce manual de 500ms com `setTimeout`/`clearTimeout`).

Criar `frontend/src/services/user.service.ts` — função adicional:

```ts
const checkAvailability = async (params: { username?: string; email?: string }) => {
  return (await api.get("/users/check-availability", { params })).data;
};
```

Endpoint backend: `GET /api/users/check-availability?username=X&email=Y`

```ts
// backend/src/user/user.controller.ts — nova rota
@Get("check-availability")
@UseGuards(JwtGuard, RolesGuard)
@Roles("admin")
async checkAvailability(
  @Query("username") username?: string,
  @Query("email") email?: string,
) {
  const result: { available: boolean; field?: string } = { available: true };
  if (username) {
    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) { result.available = false; result.field = "username"; }
  }
  if (result.available && email) {
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) { result.available = false; result.field = "email"; }
  }
  return result;
}
```

**Integração no `showCreateUserModal.tsx`** — adicionar `useEffect` com debounce:

```tsx
const [checkingField, setCheckingField] = useState<"username" | "email" | null>(null);

useEffect(() => {
  if (!form.values.username || form.values.username.length < 3) return;
  const timer = setTimeout(async () => {
    setCheckingField("username");
    try {
      const result = await userService.checkAvailability({ username: form.values.username });
      if (!result.available && result.field === "username") {
        form.setFieldError("username", t("admin.users.error.duplicated-username"));
      } else {
        form.clearFieldError("username");
      }
    } catch { /* ignora erro de rede */ }
    setCheckingField(null);
  }, 500);
  return () => clearTimeout(timer);
}, [form.values.username]);

// Idêntico para email (useEffect separado)
```

**Indicador visual**: exibir `<Loader size="xs" />` ao lado do campo quando
`checkingField` corresponder ao campo em questão.

**Não aplicar no signup público** — para não permitir enumeração de usernames
existentes (segurança).

### 3.6 Frontend — `ManageUserTable.tsx` — nenhuma alteração

A tabela de lista de usuários não exibe erros de duplicação (é read-only).
Nenhuma mudança necessária.

### 3.7 Backend — rota `check-availability` (detalhes)

- **Autenticação**: `JwtGuard + RolesGuard` (admin apenas). Nenhum admin
  não-autenticado pode enumerar.
- **Rate limiting**: usar mesmo throttler global (padrão 60 req/min).
- **Resposta**:

```json
{
  "available": false,
  "field": "username"
}
```

ou

```json
{
  "available": true
}
```

- **Segurança**: não retornar lista de usernames existentes, apenas
  `available: false` + o campo específico consultado.

---

## 4. Migration — Política

**Sem nova migration Prisma.** O schema `User` não muda. A mudança é puramente
de contrato HTTP (campo `field` na resposta de erro) e de comportamento frontend.

---

## 5. Critérios de Aceite

- [ ] `DuplicatedFieldException` criada em `backend/src/common/` com `field`
      no body da resposta.
- [ ] `user.service.ts` e `auth.service.ts` usam `DuplicatedFieldException`
      em vez de `BadRequestException` genérico para P2002.
- [ ] Resposta HTTP 400 para P2002 contém `field: "username"` ou `field: "email"`
      no body.
- [ ] `getApiErrorField()` adicionado em `error.util.ts`.
- [ ] `showCreateUserModal.tsx`: `.catch(toast.axiosError)` substituído por
      `.catch(...)` que usa `form.setFieldError()` quando `field` está presente.
- [ ] `showCreateUserModal.tsx`: `modals.closeAll()` movido para após a
      exibição do `temporaryPassword` modal (correção de bug existente).
- [ ] `showCreateUserModal.tsx`: título `"Create user"` traduzido para
      `{t("admin.users.modal.create.title")}`.
- [ ] `SignUpForm.tsx`: `.catch(toast.axiosError)` substituído por `.catch(...)`
      que usa `form.setFieldError()` quando `field` está presente.
- [ ] `GET /api/users/check-availability` endpoint criado (admin-only, com
      `JwtGuard + RolesGuard`).
- [ ] `userService.checkAvailability()` adicionado em `user.service.ts` (frontend).
- [ ] `showCreateUserModal.tsx`: debounce 500ms para username e email, com
      `useEffect` que chama `checkAvailability` e seta erro inline ou limpa.
- [ ] `showCreateUserModal.tsx`: Loader visual ao lado do campo durante
      debounce.
- [ ] Chave `admin.users.modal.create.title` adicionada em `pt-BR.ts`.
- [ ] Chave `admin.users.error.duplicated` adicionada em `pt-BR.ts` (fallback).
- [ ] Chave `admin.users.error.duplicated-username` adicionada em `pt-BR.ts`.
- [ ] Chave `admin.users.error.duplicated-email` adicionada em `pt-BR.ts`.
- [ ] Chave `signup.error.duplicated` adicionada em `pt-BR.ts` (fallback).
- [ ] Lint e typecheck passam em backend e frontend.
- [ ] Teste manual: admin cria usuário com username duplicado → erro inline no
      campo "Nome de usuário" (não toast); modal permanece aberto.
- [ ] Teste manual: signup com email duplicado → erro inline no campo "E-mail"
      (não toast); formulário permanece visível.
- [ ] Teste manual: debounce admin exibe loader e erro inline antes do submit
      quando username já existe.

---

## 6. Mapa de Referências ao Código

| Arquivo | Linha | O que mexer |
|--------|------|------------|
| `backend/src/common/duplicated-field.exception.ts` | — | NOVO: exceção estruturada com `field` |
| `backend/src/user/user.service.ts` | 68-81 | Substituir `BadRequestException` por `DuplicatedFieldException` |
| `backend/src/user/user.service.ts` | — | Adicionar injeção de `PrismaService` para `check-availability` (já injetado) |
| `backend/src/user/user.controller.ts` | — | NOVA rota `GET /check-availability` com query params |
| `backend/src/auth/auth.service.ts` | 81-94 | Substituir `BadRequestException` por `DuplicatedFieldException` |
| `backend/src/i18n/pt-BR/auth.json` | 16 | `userAlreadyExists` mantido (message i18n ok) |
| `frontend/src/utils/error.util.ts` | — | NOVO: `getApiErrorField()` |
| `frontend/src/components/admin/users/showCreateUserModal.tsx` | 27 | Traduzir título `"Create user"` |
| `frontend/src/components/admin/users/showCreateUserModal.tsx` | 81-131 | Refatorar submit: `.catch(...)` com `form.setFieldError()` |
| `frontend/src/components/admin/users/showCreateUserModal.tsx` | 129 | Corrigir `modals.closeAll()` posicionamento |
| `frontend/src/components/admin/users/showCreateUserModal.tsx` | — | Adicionar `useEffect` debounce para username + email |
| `frontend/src/components/auth/SignUpForm.tsx` | 77 | Refatorar `.catch(...)` com `form.setFieldError()` |
| `frontend/src/services/user.service.ts` | — | NOVO: `checkAvailability()` |
| `frontend/src/i18n/translations/pt-BR.ts` | — | Adicionar chaves `admin.users.modal.create.title`, `admin.users.error.duplicated*`, `signup.error.duplicated` |

---

## 7. Riscos / Observações

1. **Mapeamento de `e.meta.target[0]` do Prisma não é portável entre providers**.
   SQLite retorna `"username"`, PostgreSQL retorna `"User_username_key"`. O
   mapeamento explícito (`rawField === "email" ? "email" : "username"`) resolve
   isso. Se novos campos únicos forem adicionados ao schema `User`, este
   mapeamento precisa ser atualizado.

2. **Segurança: enumeração de usernames**. O endpoint `check-availability`
   é protegido por `JwtGuard + RolesGuard (admin)`, então apenas admins
   autenticados podem verificar existência. Para o signup público (se
   implementado futuro), seria necessário rate-limit mais agressivo ou
   não-expor o campo `field` na resposta.

3. **Bug existente: `modals.closeAll()` precoce**. Na linha 129 de
   `showCreateUserModal.tsx`, `modals.closeAll()` está fora do `if
   (result.temporaryPassword)` — significa que o modal de criação fecha
   antes do modal de senha temporária ser exibido. Mover para após o
   `openConfirmModal` ou para o `finally` do fluxo.

4. **Compatibilidade com `showUpdateUserModal.tsx`** — o modal de atualização
   (`PATCH /api/users/:id`) também usa `.catch(toast.axiosError)` e passa
   pelo mesmo `userService.update` que contém P2002 handler. Deve-se aplicar
   o mesmo padrão de `form.setFieldError()` no modal de edição para
   consistência. Fora do escopo mínimo deste tema, mas recomendado como
   follow-up imediato.

5. **Título do modal `"Create user"`** — está hardcoded em inglês na linha 27
   de `showCreateUserModal.tsx`. Esta é uma ocorrência de i18n faltante que
   deve ser corrigida neste tema (já que o formulário inteiro está em
   português exceto este título).

6. **`useForm` do Mantine** — `form.setFieldError(field, message)` aceita
   string diretamente; `form.clearFieldError(field)` remove o erro. Não
   precisa de schema customizado de validação para isso.

7. **Backend `check-availability` usa `findUnique`** — como `username` e
   `email` são `@unique` no schema Prisma, `findUnique` é O(1) via índice.
   Não há risco de performance.

8. **Compatibilidade com Tema 10** — Tema 10 (popups de erro) cria
   `showBlockingErrorModal`. Tema 11 não o utiliza (inline field error é
   suficiente para duplicação). Se o admin estiver deslogado (401), Tema 10
   trata; se 500, Tema 10 trata; se 400 com `field`, Tema 11 trata.
   São complementares, não conflitantes.

---

## 8. Follow-ups (fora deste tema)

- **Extender `form.setFieldError` para `showUpdateUserModal.tsx`** — aplicar
  mesmo padrão quando `PATCH /users/:id` retorna P2002 (duplicação de
  username/email ao editar).
- **Extender `check-availability` para signup público** — com rate-limit mais
  agressivo e possivelmente CAPTCHA. Decisão de segurança futura.
- **Visual indicator (shake)** — adicionar animação de shake no campo com erro
  para reforçar feedback (Mantine suporta via `style` ou `className` custom).
- **Campo `role` no `CreateUserDTO`** — `@IsIn(["admin", "operador", "auditor"])`
  mas `@IsOptional()`. Se valor inválido for enviado, NestJS/class-validator
  lança 400 com mensagem de validação. O frontend hoje ignora esse cenário.
  Pode-se tratar no mesmo `.catch(...)` para exibir erro inline no Select.
- **Mensagem i18n genérica** — se `getApiErrorMessage()` retornar `undefined`
  (fallback vazio), mostrar chave `common.error.unknown` (adicionada no
  Tema 10) em vez de string vazia.

---

**Fim do Tema 11.**
