# Padronização 04 — Gestão de Usuários e Permissões

> **Tema:** "Apenas o usuário admin será criado via painel; os demais usuários serão criados
> pelo admin e, ao acessarem o sistema pela primeira vez, poderão trocar a senha criada
> por uma nova" (item 5 da lista de objetivos em `Visao-geral.md`).
>
> **Status:** Decidido — documentação completa; implementação de código pendente.
> **Decisão formal:** 25/07/2026.
> **Dependências:** Tema 1 (não bloqueia); integra-se ao Tema 3 (logs de admin actions é follow-up).

---

## 1. Decisão

**(a) Criação de usuários (painel admin)** — mantém-se o endpoint `POST /api/users` existente
(admin) e o fluxo do modal `showCreateUserModal`. **Auto-signup público é desativado** por
default (config `signUp.disabled=true`).

**(b) Perfis (roles)** — adiciona-se campo `role` no User com três valores possíveis:
**`admin`**, **`operador`**, **`auditor`**. Substitui o boolean `isAdmin` (mantido
temporariamente para compatibilidade, mas `role` é fonte de verdade).

**(c) Troca de senha no primeiro acesso** — novo campo `passwordMustChange Boolean @default(false)`
em User. Quando o admin cria usuário, seta `passwordMustChange=true`. Um novo
`PasswordMustChangeGuard` bloqueia **todas** as rotas autenticadas exceto
`GET /api/users/me` e `PATCH /api/auth/password` (e o logout). Após trocar a senha, o
service desliga a flag e o usuário prossegue.

**(d) Senha inicial (SMTP off)** — admin pode escolher entre (i) gerar automaticamente
(senha forte exibida **uma única vez** no modal "User created") ou (ii) digitar manualmente.
Em ambos os casos `passwordMustChange=true`. Se SMTP on, mantém-se o fluxo atual de
invite email.

Permissões por role:

| Perfil | Cria/gerencia users | Cria/gerencia shares próprios | Vê shares de todos | Vê logs /admin/download-logs | Vê /admin/shares, /admin/users | Vê config admin |
|-------|--------------------|-----------------------------|--------------------|-----------------------------|-------------------------------|-----------------|
| **admin** | Sim | Sim | Sim | Sim | Sim | Sim (escrita) |
| **operador** | Não | Sim | Apenas próprios | Não | Não | Não |
| **auditor** | Não | Não (somente leitura de configs) | Sim (somente leitura) | Sim (somente leitura) | Sim (somente leitura) | Somente leitura |

---

## 2. Estado Atual (levantamento)

### 2.1 Schema User (`schema.prisma:11-35`)

```prisma
model User {
  id        String   @id @default(uuid())
  ...
  username String  @unique
  email    String  @unique
  password String?
  isAdmin  Boolean @default(false)
  shareSizeLimit String?
  ...
  isActivated              Boolean   @default(true)
  activationToken          String?   @unique
  activationTokenExpiresAt DateTime?
}
```

Não há `role`, não há `passwordMustChange`.

### 2.2 Guards

- `JwtGuard` (`auth/guard/jwt.guard.ts`) — valida JWT do cookie `access_token`.
- `AdministratorGuard` (`auth/guard/isAdmin.guard.ts`) — só retorna `user.isAdmin`. Usado em
  **19 pontos** no backend (controllers de users, admin/shares, config, jobs, etc.).

### 2.3 Endpoints de users (`user.controller.ts`)

| Método | Rota | Guard | Ação |
|--------|------|-------|------|
| `GET` | `/api/users/me` | JwtGuard | Próprio perfil |
| `PATCH` | `/api/users/me` | JwtGuard | Atualiza username/email (sem senha) |
| `DELETE` | `/api/users/me` | JwtGuard | Auto-excluir |
| `GET` | `/api/users` | JwtGuard + AdministratorGuard | Listar todos |
| `POST` | `/api/users` | JwtGuard + AdministratorGuard | Criar usuário |
| `PATCH` | `/api/users/:id` | JwtGuard + AdministratorGuard | Editar qualquer um |
| `DELETE` | `/api/users/:id` | JwtGuard + AdministratorGuard | Excluir |
| `PATCH` | `/api/auth/password` | JwtGuard | Trocar própria senha (exige `oldPassword`) |

### 2.4 signUp (auto-registro público)

- `AuthService.signUp` (`auth.service.ts:32`) cria usuário. Se é o **primeiro user** vira admin automaticamente (`isFirstUser`).
- Config **`signUp.disabled`** existe (ver `config.seed.ts`) mas precisa validar default.
- Frontend `/auth/signUp` exposto. **Decisão:** por default `signUp.disabled=true` (auto-registro off neste projeto).

### 2.5 Fluxo de convite por e-mail

- `UserService.create` (`user.service.ts:32`): se `dto.password` vazio, gera UUID como senha, envia `sendInviteEmail` via SMTP. Se SMTP off, o frontend hoje mostra apenas o campo de senha manual.
- Não há flag de "trocar no primeiro acesso" — usuário fica com a senha recebida indefinidamente.

### 2.6 Frontend — Admin Users

- `/admin/users` (`pages/admin/users.tsx`) — lista, modal create (`showCreateUserModal.tsx`), modal update (`showUpdateUserModal.tsx`).
- Modal create tem switch "senha manual" só visível se `smtpEnabled`.
- Sem noção de "role" — somente toggle `isAdmin`.

---

## 3. Padronização

### 3.1 Schema — Nova migration

**Política:** nova migration Prisma (não editar migrations antigas). Nome sugerido:
`2026xxxx_add_user_role_and_password_must_change`.

```prisma
enum Role {
  admin
  operador
  auditor
}

model User {
  ...
  role                Role     @default("operador")  // NOVO
  isAdmin             Boolean  @default(false) @deprecated  // mantido p/ compat; role é fonte de verdade
  passwordMustChange  Boolean  @default(false)  // NOVO
  ...
}
```

**Notas / alternativas:**
- SQLite **não suporta enums** nativos. Prisma 7 gera um String com validação no client.
  Confirmado: definir como `role String @default("operador")` mais validação no DTO
  (`@IsIn(["admin", "operador", "auditor"])`), evitando surpresas do runtime SQLite.
  Documentar explicitamente: **sem enum no schema (apenas String + validação NestJS)**.
- `isAdmin` deprecated mas mantido por enquanto — facilita migration incremental
  (controllers ainda usam `AdministratorGuard`). Atualizar para `RolesGuard` aceitando
  `role="admin"` (ver §3.2). Após estabilizar, em Tema 8 ou follow-up, remover `isAdmin`.
- `passwordMustChange` default false — admin só seta true ao criar usuário.

### 3.2 Backend — Guards baseados em role

1. **`RolesGuard`** (novo `auth/guard/roles.guard.ts`) lê `user.role` aceitando lista de roles
   permitidas via decorator `@Roles("admin", "auditor")`.
2. **Substituir `AdministratorGuard`** por `RolesGuard` com `@Roles("admin")` em todos os 19
   pontos hoje protegidos. Critérios:
   - Operações de **escrita** admin (`POST/PATCH/DELETE /api/users`, `/api/admin/*`,
     `/api/config/*`): `@Roles("admin")`.
   - Operações de **leitura admin** (`GET /api/admin/download-logs`, `GET /api/admin/shares`):
     `@Roles("admin", "auditor")` — auditor vê, não edita. A validação "somente leitura" é
     garantida pela ausência das rotas POST/PATCH no controller (auditor não terá sequer
     a UI exposta no frontend).
3. **`PasswordMustChangeGuard`** (novo `auth/guard/passwordMustChange.guard.ts`):
   - Aplicado globalmente no `AppModule` em conjunto com `JwtGuard`.
   - Bypassa (permite) rotas: `PATCH /api/auth/password`, `GET /api/users/me`, `POST /api/auth/logout` (se houver), `GET /api/auth/token` (refresh, opcional).
   - Se `user.passwordMustChange=true` e a rota não está na whitelist, retorna HTTP `403`
     com chave i18n `auth.passwordMustChange` e o frontend redireciona para
     `/account/change-password?next=...`.

### 3.3 Backend — `AuthService.updatePassword`

Em `auth.service.ts:248`, ao trocar senha própria:
- Se `user.passwordMustChange=true`, desligar a flag (`passwordMustChange=false`) após
  gravar o novo hash.
- Se `user.passwordMustChange=false`, comportamento atual (exige `oldPassword`).

 challengent: também no fluxo de "primeiro acesso" o `oldPassword` é a senha temporária
 que o admin forneceu — `argon.verify` funciona normalmente, basta permitir que o cliente
 envie `oldPassword=temporária` mesmo com a flag setada. Decidido: **sempre exige `oldPassword`
 também no primeiro acesso** — assim o usuário comprova que recebeu a senha inicial e evita
 acesso indevido de alguém que interceptou o token JWT.

### 3.4 Backend — `UserService.create`

Em `user.service.ts:32`:
1. Aceitar `role` (default `"operador"`) no `CreateUserDTO` — validação `@IsIn(["admin","operador","auditor"])`.
2. Se `dto.password` vazio: gerar senha forte (12 chars, letras+números+símbolos), gravar
   hash, **retornar a senha temporária em texto** no response (uma única vez). Setar
   `passwordMustChange=true`.
3. Manter fluxo de `sendInviteEmail` se `smtpEnabled` e admin não pediu manual. Nesse caso
   o e-mail entrega a senha temporária e `passwordMustChange=true` também (princípio: todo
   usuário criado pelo admin troca a senha no primeiro login).
4. Se admin escolheu digitar manualmente: guardar hash, setar `passwordMustChange=true`,
   não retornar senha no response (admin já sabe).

**Importante:** o `UserDTO` (serialização) tem `@Exclude` em `password` — a senha
temporária deve viajar em campo extra `temporaryPassword` no response, **fora** do UserDTO,
para não vazar em outras leituras.

### 3.5 Backend — Rotas de admin por role

| Controller / rota | Hoje | Padronizado |
|-------------------|------|-------------|
| `POST /api/users` | JwtGuard+AdministratorGuard | `@Roles("admin")` |
| `PATCH /api/users/:id` | JwtGuard+AdministratorGuard | `@Roles("admin")` |
| `DELETE /api/users/:id` | JwtGuard+AdministratorGuard | `@Roles("admin")` |
| `GET /api/users` (list) | JwtGuard+AdministratorGuard | `@Roles("admin")` (auditor não vê lista de usuários — privacy) |
| `GET /api/admin/shares` (list all) | AdministratorGuard | `@Roles("admin","auditor")` |
| `GET /api/admin/download-logs` | AdministratorGuard | `@Roles("admin","auditor")` (ver Tema 3) |
| `GET/PATCH /api/config/*` | AdministratorGuard | `@Roles("admin")` (escrita admin; auditor sem acesso a config para impedir alterar flags de segurança) |
| `/api/jobs/*` | AdministratorGuard | `@Roles("admin")` |

Para isso, no controlador `GET /api/shares` (do próprio user — operador) continua só com
`JwtGuard`. Implementar `GET /api/admin/shares` se já não existir (verificar).

### 3.6 Frontend — Modais e páginas

1. **`showCreateUserModal.tsx`** — adicionar:
   - **Select "Perfil"** (`admin` / `operador` / `auditor`) default `operador`. Em PT-BR:
     "Administrador / Operador / Auditor".
   - Quando SMTP off ou admin escolhe "gerar senha automaticamente": ao submeter,
     exibir **modal subsequente** "Usuário criado" mostrando a `temporaryPassword` com
     botão "Copiar" e aviso "Entregue esta senha ao usuário por canal seguro. Ela não
     será exibida novamente e o usuário deverá trocá-la no primeiro acesso."
   - Se admin escolheu digitar manualmente: confirmação extra "Você entrega a senha
     inicial? O usuário deverá trocá-la no primeiro acesso." — check de"ciente".
2. **`showUpdateUserModal.tsx`** — adicionar select "Perfil" (somente se o usuário
   editado não for o último admin — mesmo critério em `user.service.delete`).
3. **`ManageUserTable.tsx`** — adicionar coluna "Perfil" (badge colorida).
4. **Nova página `/account/change-password`** (`pages/account/change-password.tsx`):
   - Formulário com 3 campos: senha atual, nova senha, confirme nova senha.
   - Validação (yup): nova senha minlength 8,坚强的 (1 maiuscula/1 número/1 símbolo — ajustar).
   - Em caso de `passwordMustChange=true`, mostra banner "Seu acesso está restrito. Troque
     a senha para continuar." e bloqueia navegação (sem menu lateral — usa mesma técnica do
     Tema 2 de `excludeDefaultLayoutRoutes`).
   - Após sucesso, redireciona para `next=` (default `/`).
5. **Interceptação global (axios)** — quando uma chamada retorna 403 com
   `auth.passwordMustChange`, o frontend:
   - Limpa tokens (logout local).
   - Redireciona para `/account/change-password`.
   Implementar no `services/api` interceptor (`services/api.ts` ou equivalente).
6. **Item de menu lateral** — em `/admin` sidebar, adicionar:
   - "Usuários" (já existe em `/admin/users`) — somente visível para `role=admin`.
   - Apagar toggle "isAdmin" — usar select de perfil.
7. **Restringir UI por role** — helper `useCurrentUser()` retorna role; componentes:
   - Menu lateral "Logs" → visível se `role in [admin, auditor]`.
   - Menu "Shares de todos" → visível se `role in [admin, auditor]`.
   - Menu "Configurações" → visível se `role === admin`.

### 3.7 Backend — Auth signUp desabilitado

- Confirmar que `signUp.disabled` default seja `true` em `config.seed.ts` (se não for,
  adicionar/changing default). Documentar como config admin pode reabilitar (se
  desejável em algum cenário).
- `AuthService.signUp` já valida `config.get("signUp.disabled")` — verificar.
- Frontend `/auth/signUp` permanece acessível se admin reabilitar via config (mantém
  default off neste projeto).

### 3.8 i18n — novas chaves PT-BR

```ts
auth: {
  passwordMustChange: "Você deve trocar sua senha antes de continuar.",
  passwordMustChange.description: "Seu acesso está restrito até a troca da senha.",
  temporaryPassword: "Senha temporária gerada",
  temporaryPassword.warning: "Copie esta senha e entregue ao usuário por canal seguro. Ela não será exibida novamente.",
}
admin: {
  users: {
    modal: {
      create: {
        role: "Perfil",
        role.admin: "Administrador",
        role.operador: "Operador",
        role.auditor: "Auditor",
        role.description: "Determina permissões do usuário no sistema.",
        generatePassword: "Gerar senha automaticamente",
        generatePassword.description: "Uma senha temporária forte será gerada e exibida uma única vez.",
      },
      update: { role: "Perfil" },
    },
    table: { role: "Perfil" },
  },
}
account: {
  changePassword: {
    title: "Trocar senha",
    current: "Senha atual",
    new: "Nova senha",
    confirm: "Confirmar nova senha",
    submit: "Trocar senha",
    success: "Senha alterada com sucesso.",
    next: "Você será redirecionado em seguida.",
  }
}
roles: {
  admin: "Administrador",
  operador: "Operador",
  auditor: "Auditor",
}
```

---

## 4. Migration — Política

- Criar **nova migration Prisma** com `role` (String) e `passwordMustChange` (Boolean).
- Após rodar migration, na fase de código, **script de backfill** (executado uma vez em
  produção): para cada User existente, setar `role="admin"` se `isAdmin=true`, senão
  `role="operador"`. `passwordMustChange=false` para todos os existentes (já estão em uso).
  Pode ser um script node mínimo ou um paso no `seed` (idempotente).
- Seed de config: alterar `signUp.disabled` default para `true` em `config.seed.ts` (se
  ainda não for). Não é migration de schema, mas alteração de seed (precisa re-seed em dev).

---

## 5. Critérios de Aceite

- [ ] Nova migration adiciona `role String @default("operador")` e `passwordMustChange Boolean @default(false)` em User.
- [ ] `CreateUserDTO` aceita `role` com validação `@IsIn(["admin","operador","auditor"])`.
- [ ] `UpdateUserDto` aceita `role` (somente admin pode alterar).
- [ ] `UserService.create` gera senha temporária (12 chars) se `dto.password` vazio, retorna em `temporaryPassword` (fora do UserDTO), seta `passwordMustChange=true`.
- [ ] `UserService.create` mantém envio de invite email se `smtpEnabled` e admin não escolheu manual.
- [ ] `UserService.create` se admin escolheu senha manual: seta `passwordMustChange=true`, não retorna `temporaryPassword`.
- [ ] `UserService.update` não permite rebaixar o **último admin** (extensão da regra atual em `delete`).
- [ ] `RolesGuard` criado em `auth/guard/roles.guard.ts` com `@Roles(...)` decorator.
- [ ] `AdministratorGuard` substituído por `@Roles("admin")` em todos os 19 pontos.
- [ ] Rotas de leitura admin (`/api/admin/shares`, `/api/admin/download-logs`) abertas para `@Roles("admin","auditor")`.
- [ ] `PasswordMustChangeGuard` criado e aplicado globalmente com whitelist
      de rotas permitidas quando flag ativa.
- [ ] `AuthService.updatePassword` desliga `passwordMustChange` após trocar a senha.
- [ ] `signUp.disabled` default `true` em `config.seed.ts`.
- [ ] Script de backfill: `role="admin"` para isAdmin=true, `role="operador"` senão.
- [ ] Frontend: `showCreateUserModal` tem select "Perfil" e switch "gerar senha automaticamente".
- [ ] Frontend: modal "Usuário criado" exibe `temporaryPassword` com botão copiar e aviso.
- [ ] Frontend: `showUpdateUserModal` tem select "Perfil".
- [ ] Frontend: `ManageUserTable` mostra coluna "Perfil".
- [ ] Frontend: página `/account/change-password` criada (tela exclusiva sem chrome).
- [ ] Frontend: interceptor axios trata 403 `auth.passwordMustChange` redirecionando.
- [ ] Frontend: menu lateral restrito por `role` (logs p/ admin+auditor; config só admin).
- [ ] Chaves i18n PT-BR adicionadas.
- [ ] Lint e typecheck passam.

---

## 6. Mapa de Referências ao Código

| Arquivo | Linha | O que mexer |
|--------|------|------------|
| `backend/prisma/schema.prisma` | 11-35 | Adicionar `role String @default("operador")` e `passwordMustChange Boolean @default(false)` em User. Manter `isAdmin` (deprecated) p/ compat incremental. |
| `backend/prisma/seed/config.seed.ts` | categoria `signUp` | Validar/forçar `signUp.disabled=true` default. |
| `backend/prisma/seed/seed.ts` ou novo script | — | Backfill `role`: `isAdmin=true`→`role="admin"`; senão `role="operador"`. `passwordMustChange=false` para todos. |
| `backend/src/auth/guard/roles.guard.ts` | — | NOVO: RolesGuard lendo `user.role` via decorator `@Roles(...)`. |
| `backend/src/auth/guard/passwordMustChange.guard.ts` | — | NOVO: PasswordMustChangeGuard global com whitelist. |
| `backend/src/auth/decorator/roles.decorator.ts` | — | NOVO: `@Roles("admin", ...)` decorator (SetMetadata). |
| `backend/src/auth/guard/isAdmin.guard.ts` | — | MANTER (deprecado) ou descontinuar conforme Tema 8; aqui apenas substituímos usos. |
| `backend/src/user/user.controller.ts` | 76-97 | Substituir `AdministratorGuard` por `@Roles("admin")` |
| `backend/src/admin-shares/...` (verificar) | — | Substituir por `@Roles("admin","auditor")` para GET; `@Roles("admin")` para POST/PATCH/DELETE |
| `backend/src/download-log/admin-download-logs.controller.ts` | 7 | `@Roles("admin","auditor")` |
| `backend/src/config/...` (verificar) | — | `@Roles("admin")` para tudo; auditor sem acesso |
| `backend/src/user/user.service.ts` | 32-73 (`create`) | Gerar senha temporária forte se dto.password vazio; retornar em `temporaryPassword`; setar `passwordMustChange=true` |
| `backend/src/user/user.service.ts` | 75-97 (`update`) | Rejeitar rebaixamento do último admin |
| `backend/src/user/dto/createUser.dto.ts` | — | Adicionar `role` com `@IsIn(["admin","operador","auditor"])` default `operador` |
| `backend/src/user/dto/updateUser.dto.ts` | — | Adicionar `role` |
| `backend/src/user/dto/user.dto.ts` | — | Expor `role` no serializado; `temporaryPassword` em wrapper separado |
| `backend/src/auth/auth.service.ts` | 248-267 (`updatePassword`) | Desligar `passwordMustChange=false` após trocar |
| `backend/src/auth/auth.controller.ts` | 166 (`PATCH /auth/password`) | Continua exigindo `oldPassword` mesmo no primeiro acesso |
| `frontend/src/components/admin/users/showCreateUserModal.tsx` | 33-172 | Adicionar select "Perfil", switch "gerar senha automaticamente", flow modal subsequente com `temporaryPassword` |
| `frontend/src/components/admin/users/showUpdateUserModal.tsx` | — | Adicionar select "Perfil" |
| `frontend/src/components/admin/users/ManageUserTable.tsx` | — | Adicionar coluna "Perfil" (badge) |
| `frontend/src/pages/account/change-password.tsx` | — | NOVO: tela de troca de senha (exclusiva sem chrome) |
| `frontend/src/pages/_app.tsx:36` | excludeDefaultLayoutRoutes | Adicionar `/account/change-password` |
| `frontend/src/services/api.ts` (interceptor) | — | Tratar 403 `auth.passwordMustChange` → redirect `/account/change-password` |
| `frontend/src/services/user.service.ts` | — | `create()` pode retornar `{ user, temporaryPassword }` |
| `frontend/src/components/admin/...` (menu lateral) | — | Mostrar items condicionalmente via `role` |
| `frontend/src/hooks/useCurrentUser.ts` (ou equivalente) | — | Expor `role` |
| `frontend/src/i18n/translations/pt-BR.ts` | — | Adicionar chaves `auth.passwordMustChange`, `account.changePassword.*`, `roles.*`, `admin.users.modal.create.role.*` |

---

## 7. Riscos / Observações

1. **Migração incremental do `isAdmin`** — manter `isAdmin` deprecated evita quebrar o
   `AdministratorGuard` em paralelo durante a troca. Mas precisamos garantir que `role`
   e `isAdmin` não divergem. Solução: no `UserService.create/update`, se `role="admin"`,
   setar também `isAdmin=true`; se `role!="admin"`, setar `isAdmin=false`. Chamamos `role`
   a fonte de verdade e `isAdmin` um espelho.
2. **SQLite enums** — não há enums; usamos `String` + validação no DTO. Qualquer
   mudança de valores precisa atualizar DTO e frontend (não há alteração de schema).
3. **Auditor e proteção contra escrita** — garantida por *ausência de UI* + *ausência de
   rota POST/PATCH com `@Roles("admin","auditor")`. Se por engano expusermos uma rota
   PATCH com `@Roles("admin","auditor")`, auditor poderia gravar. Recomendação: em rotas
   que devem ser somente-leitura para auditor, usar **dois decorators distintos** —
   `@Roles("admin")` na escrita e `@Roles("admin","auditor")` na leitura — nunca um único
   que permita ambos.
4. **Bypass do PasswordMustChange via refresh token** — atualizar/limpar refresh tokens
   também precisa respeitar o guard, senão usuário migra tokens sem trocar senha. O
   guard global cobre `POST /api/auth/token`. Decidir: (i) bloquear refresh também, ou
   (ii) permitir refresh mas manter a flag (menos disruptivo, usuário se mantém logado
   enquanto troca senha). **Decisão:** permitir refresh (manter sessão), já que o access
   token novo continuará bloqueado pelo guard.
5. **Fluxo de invite por e-mail com `passwordMustChange=true`** — se SMTP on e admin
   não marcou "manual", o e-mail entrega a senha temporária; o usuário acessa, faz login
   com ela, e o guard obriga trocar. Comportamento coerente.
6. **Permissões de share entre operadores** — operador só vê e gerencia shares próprios
   (filtros no `share.controller.ts:53` já usam `user.id`). Auditor vê todos (precisa
   rota `GET /api/admin/shares` — verificar se existe; senão criar).

---

## 8. Follow-ups (fora deste tema)

- **Logs de admin actions** — registrar criação/remoção/edição de usuário, mudança de
  role, mudança de config (extensão do Tema 3). Avaliar em Tema futuro se o volume de
  events de admin justifica.
- **Remover `isAdmin` queimado** — após estabilizar `role`, drop da coluna em migration
  posterior (Tema 8 ou tarefa isolada).
- **2FA / TOTP** — existe (`authTotp.service.ts`) mas pode exigir revisão para operadores/
   auditores. Fora deste tema.
- **Auditoria de "trocou a senha em X"** — capturar timestamp `lastPasswordChangeAt` em
   User (nova coluna) como futuro follow-up. Não incluído agora (escopo mínimo).

---

**Fim do Tema 4.**
