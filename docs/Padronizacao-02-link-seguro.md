# Padronização — Compartilhamento por Link Seguro

> **Sistema de Compartilhamento Seguro de Arquivos — Controle Share Videos**
> Documento de decisão de padronização

**Versão:** 1.0.0
**Data:** 2026-07-25
**Status:** Decidido — documentação; código pendente
**Tema do programa:** 2 de 9
**Depende de:** Tema 1 (`Padronizacao.md` — remoção de reverse shares + S3)

---

## 1. Contexto

A `docs/Visao-geral.md` sinalizou, entre parênteses, os requisitos de UX/link:

> *Configuração do link para acesso ao vídeo com limite de visualização e downloads com senha que deve ter um gerador automático que será disponibilizada pelo admin junto com o link.*
>
> *O usuário que recebe o link deve ter acesso somente ao seu vídeo, sem visualização da tela inicial do sistema (criar uma tela exclusiva de visualização quando acessado pelo link).*

Este documento formaliza a padronização do **fluxo de compartilhamento por link**:

1. **Geração automática de link + senha** — admin não digita manualmente a senha; o sistema gera.
2. **Limites configuráveis por share** — views e downloads já são suportados no schema (`ShareSecurity.maxViews` + `ShareSecurity.maxDownloads`). Validar aplicação real.
3. **Tela exclusiva de visualização** — `/share/[shareId]` carregado pelo link **não deve expor Header/Footer do sistema** (área administrativa).
4. **URL canônica do link** — decisão sobre formato (atual: `/s/[shareId]` no link exibido; rota real: `/share/[shareId]`).

Depende da conclusão do **Tema 1** (remoção de reverse shares + S3) porque vários arquivos afetados no upload (e.g. `showCreateUploadModal.tsx`) referenciam `isReverseShare`.

---

## 2. Estado atual do código

### 2.1 Schema (`backend/prisma/schema.prisma`)

```prisma
model Share {
  // ...
  views     Int @default(0)
  downloads Int @default(0)
  expiration DateTime
  creatorId String?
  security   ShareSecurity?
  // ...
}

model ShareSecurity {
  password     String?
  maxViews     Int?
  maxDownloads Int?
  shareId String? @unique
}
```

**Status:** schema já suporta tudo que o tema 2 precisa.

### 2.2 Backend (`backend/src/share/share.service.ts`)

- `create(share, user, reverseShareToken?)` — recebe senha em texto puro via `CreateShareDTO.security.password`; faz `argon.hash` antes de gravar. **Não gera senha automaticamente**.
- `getShareToken(shareId, password)` — valida senha com `argon.verify`, valida `maxViews`, emite JWT com `sharePasswordSignature` (HMAC da senha) — assinatura do JWT fica acoplada à senha, de modo que mudar a senha invalida tokens antigos.
- `verifyShareToken(share, token)` — valida JWT e assinatura de senha.
- `increaseViewCount` — incrementa `views`.
- `update`/`updateSecurity` — permite alterar senha, `maxViews`, `maxDownloads`.

**Endpoint de token** (`share.controller.ts:154`):
```ts
@Post(":id/token")
async getShareToken(@Body() body: SharePasswordDto, @Res() response: Response) {
  const token = await this.shareService.getShareToken(id, body.password);
  response.cookie(`share_${id}_token`, token, { path: "/", httpOnly: true });
  return { token };
}
```

O token é guardado como cookie HttpOnly chamado `share_<id>_token`.

### 2.3 Frontend — criação do share (`showCreateUploadModal.tsx`)

- ID (link) é auto-gerado via `generateShareId(shareIdLength)`, mas a **senha** é campo opcional manual no formulário (`PasswordInput`).
- A URI exibida no preview é `${appUrl}/s/${link}` — parece ser URL curta (`/s/...`).

### 2.4 Frontend — tela de visualização (`pages/share/[shareId]/index.tsx`)

- Usa layout padrão do `_app.tsx` (Header + Container + Footer).
- **Não é uma tela exclusiva** — exibe chrome do sistema.
- Acessada via rota `/share/[shareId]`.

### 2.5 Layout no `_app.tsx`

```ts
const excludeDefaultLayoutRoutes = ["/admin/config/[category]"];
// ...
{excludeDefaultLayoutRoutes.includes(route) ? (
  <Component {...pageProps} />
) : (
  <><Header /><Container><Component .../></Container><Footer /></>
)}
```

Existe mecanismo de exclusão de layout — atualmente só `/admin/config/[category]` está fora. **Adicionar `/share/[shareId]` na lista cria a tela exclusiva.**

### 2.6 Configuração (`backend/prisma/seed/config.seed.ts`)

Já existe:
- `share.maxExpiration` (timespan; default `0 days` = sem limite)
- `share.defaultExpiration` (timespan; default `7 days`)
- `share.shareIdLength` (number; default `8`)
- `share.maxSize` (filesize; default `1000000000` = 1 GB)
- `share.maxDownloadsDefault` (number; default `0` = ilimitado) — introduzido pelo Tema R7 anterior.

### 2.7 URL do link (verificação)

- **Preview no modal de criação** (`showCreateUploadModal.tsx:292`): `${appUrl}/s/${link}`
- **Rota real no Next.js**: `pages/share/[shareId]/index.tsx` → rota `/share/[shareId]`.

> Existe inconsistência aparente: o preview exibe `/s/...` mas a rota real é `/share/...`. **Ação:** verificar se há rewrite no `next.config.js` ou se há uma página `/s/[shareId].tsx` que redireciona.

---

## 3. Decisão

### 3.1 Geração automática de senha no admin

**Comportamento alvo:**

- No modal de criação do share (`showCreateUploadModal.tsx`), o campo `password` continua **opcional** para compatibilidade (admin pode definir manualmente se quiser).
- Adicionar um botão **"Gerar senha"** ao lado do campo, que cria uma senha forte aleatória com comprimento padrão **12 caracteres** (configurável via `share.generatedPasswordLength`).
- Se o admin não preencher nada e marcar **"Proteger com senha automaticamente"** (checkbox novo, default `true`), o backend gera a senha automaticamente caso `security.password = undefined`.
- A senha gerada é exibida **uma única vez** no modal de "Upload completado" (`showCompletedUploadModal.tsx`), junto com o link final: `https://dominio/share/<shareId>?pwd=<senha>`.
- A senha é **resposta do endpoint `POST /api/shares/:id/complete`** — o backend retorna `notifyReverseShareCreator` hoje; vai passar a retornar `{ shareId, link, generatedPassword? }`.

> **Décisão sobre auto-geração vs manual:** o admin pode optar entre (a) fornecer senha manualmente ou (b) deixar o sistema gerar. O fluxo default é (b) com senha aleatória forte de 12 caracteres. A checkbox "Definir senha manualmente" habilita o campo manual.

**Items de config novos:**

```ts
share.generatedPasswordLength:    { type: "number",  defaultValue: "12",  secret: false }   // comprimento da senha gerada
share.autoGeneratePassword:      { type: "boolean", defaultValue: "true", secret: false }   // default: gerar senha automaticamente na criação do share se não fornecida
share.includePasswordInShareLink: { type: "boolean", defaultValue: "false", secret: false }  // se true, ?pwd=<senha> é anexado ao link exibido (não seguro para log de browser, default false — admin copia separadamente)
```

> **Segurança:** o `?pwd=` na URL é uma **conveniência** que expõe a senha no histórico do navegador e em logs do servidor. Default `false`. Admin copia a senha separadamente. Quando `true`, frontend constrói link completo para o Clipboard.

### 3.2 Limites de views e downloads (validação de aplicação)

- `maxViews` — já existe em schema; já é validado em `share.service.getShareToken:511` (`maxViews <= share.views` → 403). ✅
- `maxDownloads` — existe em schema; validado em `DownloadLimitGuard` (introduzido no tema R7 anterior, em `backend/src/file/guard/downloadLimit.guard.ts`). 🚧 **Ação:** confirmar durante a execução do código que o `DownloadLimitGuard` está aplicado em **todos** os endpoints de download: `GET /api/shares/:id/files/zip` e `GET /api/shares/:id/files/:fileId`.

**Items de UI novos:**

- No modal de criação: adicionar campo `maxViews` (NumberInput) e `maxDownloads` (NumberInput). Atualmente só `maxViews` está no formulário. Adicionar `maxDownloads`.
- No painel admin (`admin/shares/[id].tsx` ou `ManageShareTable`): mostrar `views/maxViews` e `downloads/maxDownloads` em colunas.

### 3.3 Tela exclusiva de visualização

**Comportamento alvo:**

- A rota `/share/[shareId]` **não renderiza Header nem Footer** do sistema. Usuário que acessa via link vê apenas o conteúdo do share (título, descrição, FileList, botão de download).
- Mecanismo: adicionar `/share/[shareId]` ao `excludeDefaultLayoutRoutes` no `_app.tsx`.
- A página deve continuar funcional sem usuário logado (acesso anônimo via token). O cookie `share_<id>_token` (HttpOnly) é suficiente.
- Acesso a **editar** (botão `TbEdit`) deve ser **escondido** para visualizadores anônimos (já é condicional via `isOwnerOrAdmin`).
- **Manter** modal de entrada de senha quando `password` estiver configurado.

**Layout alvo da tela exclusiva:**

```
┌────────────────────────────────────┐
│  Página Cheia (sem Header, sem      │
│  Footer). Apenas conteúdo do share: │
│                                     │
│  Título do Share                    │
│  Descrição                          │
│                                     │
│  Lista de arquivos + botões         │
│                                     │
└────────────────────────────────────┘
```

Nenhum menu de admin, link para `/upload`, link para `/account`, etc.

### 3.4 URL canônica do link

**Decisão:** padronizar como `/share/<shareId>`. Verificar e corrigir o preview no modal que atualmente exibe `/s/<link>` — isso parece incompatível com a rota real (`/share/[shareId]`).

**Ação:**
- Verificar `next.config.js` por `rewrites()` que converta `/s/[shareId]` → `/share/[shareId]`.
- Se não existir, **corrigir o preview** no `showCreateUploadModal.tsx` para usar `/share/${link}` ao invés de `/s/${link}`.
- Adicionar suporte opcional a `?pwd=<senha>` na rota `/share/[shareId].tsx`: se `pwd` estiver presente na query string e o share estiver protegido por senha, **auto-completar** o modal de senha com esse valor e submeter automaticamente. Se `includePasswordInShareLink=false`, esse fluxo é desativado por config.

### 3.5 Estrutura do link final

O admin recebe no modal de "Upload completado" um **texto único copiável** contendo:

```
Link: https://dominio/share/abc12345
Senha: Xk9Pw2MnQbLt     (se gerada automaticamente)
Expira em: 25/08/2026 14:30
Limite de visualizações: 10
Limite de downloads: 5
```

Não é enviado por email automaticamente (essa decisão fica no tema sobre notificações).

---

## 4. Alcance (a executar em fase de código)

### 4.1 Backend

| Arquivo | Ação |
|--------|------|
| `backend/src/share/share.service.ts` | `create()`: se `share.security.password === undefined` e `config.share.autoGeneratePassword === true`, gerar senha aleatória forte de `share.generatedPasswordLength` caracteres; fazer `argon.hash`; manter a senha em texto plano no retorno do `complete()` (não junto ao share retornado no `create()`). |
| `backend/src/share/share.service.ts` | `complete()`: incluir no retorno `{ shareId, link, generatedPassword?, maxViews, maxDownloads, expiration }`. |
| `backend/src/share/dto/shareComplete.dto.ts` | Adicionar campos opcionais `link`, `generatedPassword`, `expiration`, `maxViews`, `maxDownloads` ao DTO. |
| `backend/src/share/guard/shareSecurity.guard.ts` | Suportar `pwd` via query string: se presente, validar a senha automaticamente (sem mostrar modal). Usar com cautela — está em URLs/logs. |
| `backend/src/file/guard/downloadLimit.guard.ts` | Confirmar aplicação em **todos** os endpoints de download (`FileController` `getZip` e `getFile`). |
| `backend/prisma/seed/config.seed.ts` | Adicionar chaves: `share.generatedPasswordLength` (12), `share.autoGeneratePassword` (true), `share.includePasswordInShareLink` (false). |
| `backend/src/share/dto/createShare.dto.ts` | `security.password` permanece opcional (já é); documentar que vazio dispara auto-geração. |

### 4.2 Frontend

| Arquivo | Ação |
|--------|------|
| `frontend/src/pages/_app.tsx` | Adicionar `/share/[shareId]` ao `excludeDefaultLayoutRoutes`. |
| `frontend/src/components/upload/modals/showCreateUploadModal.tsx` | Adicionar checkbox "Definir senha manualmente" (default: desligado → senha gerada). Adicionar botão "Gerar senha". Adicionar campo `maxDownloads` (NumberInput) além de `maxViews`. Corrigir URL de preview `/s/${link}` → `/share/${link}`. |
| `frontend/src/components/upload/modals/showCompletedUploadModal.tsx` | Exibir painel final: link, senha gerada (se aplicável), expiração, max views e max downloads. Botão "Copiar tudo" copia link + senha + metadados como bloco. |
| `frontend/src/pages/share/[shareId]/index.tsx` | Ajustar layout para funcionar sem o `Container`/`Header`/`Footer` — usar Container local (width menor). Esconder botões `TbEdit`/`TbPlusMinus` para visualizadores anônimos (já é condicional, mas validar). |
| `frontend/src/pages/share/[shareId]/index.tsx` | Suportar `?pwd=<senha>` na query string: se presente, auto-preencher o modal `showEnterPasswordModal` e submeter automaticamente. |
| `frontend/src/components/admin/shares/ManageShareTable.tsx` | Adicionar colunas `views/maxViews` e `downloads/maxDownloads`. Edição via `showShareInformationsModal` já suporta `maxViews`; estender para `maxDownloads`. |
| `frontend/src/components/share/showShareInformationsModal.tsx` | Adicionar campo `maxDownloads` ao `EditShareBody` (atual: só `maxViews`). |

### 4.3 Schema / Migration

**Nenhuma migração de schema necessária** — `maxViews`, `maxDownloads`, `password` já existem em `ShareSecurity`. As novas chaves de config (`share.generatedPasswordLength`, `share.autoGeneratePassword`, `share.includePasswordInShareLink`) são **apenas linhas na tabela `Config`**, populadas pelo seed (`seedConfigVariables`).

### 4.4 i18n

Adicionar chaves em `backend/src/i18n/pt-BR/*.json` e `frontend/src/i18n/translations/pt-BR.ts`:

- `upload.modal.accordion.security.generate-password.button` — "Gerar senha"
- `upload.modal.accordion.security.auto-generate.label` — "Gerar senha automaticamente"
- `upload.modal.accordion.security.max-downloads.label` — "Limite de downloads"
- `upload.modal.accordion.security.max-downloads.placeholder` — "Ex.: 5 (0 = ilimitado)"
- `upload.modal.completed.generated-password` — "Senha gerada"
- `upload.modal.completed.copy-all.button` — "Copiar link e senha"
- `share.error.max-downloads-exceeded.title` — "Limite de downloads atingido"
- `share.error.max-downloads-exceeded.description` — "Este share atingiu o limite máximo de downloads permitido."

---

## 5. Validação (critério de aceite para a fase de código)

- [ ] `npm run lint` em backend e frontend → 0 erros, 0 warnings.
- [ ] `tsc --noEmit` em backend e frontend → 0 erros.
- [ ] `docker compose -f docker-compose.local.yml up -d --build` → container healthy.
- [ ] Criar share via admin sem digitar senha → senha gerada automaticamente (12 chars por default).
- [ ] Criar share via admin digitando senha manualmente → senha mantida.
- [ ] Atualizar `share.generatedPasswordLength` para `20` via painel → novo share tem senha de 20 chars.
- [ ] Atualizar `share.autoGeneratePassword` para `false` → admin precisa digitar senha manualmente.
- [ ] Definir `maxViews=3` e `maxDownloads=5` → 4ª visualização rejeitada; 6º download rejeitado.
- [ ] Acessar `/share/<shareId>` sem login → tela exclusiva (sem Header/Footer do sistema), apenas conteúdo do share.
- [ ] Acessar `/share/<shareId>?pwd=<senha>` → modal de senha auto-preenchido se `includePasswordInShareLink=true`.
- [ ] URL de preview no modal de criação: `/share/<id>` (não mais `/s/<id>`).
- [ ] `DownloadLog` registra downloads rejeitados (motivo: `maxDownloadsExceeded`).
- [ ] `DownloadLog` registra downloads bem-sucedidos.

---

## 6. Tópicos relacionados

- **Tema 1** (reverse shares + S3): deve ser concluído antes — `showCreateUploadModal.tsx` referencia `isReverseShare`.
- **Tema 3** (auditoria/logs): os campos `views`, `downloads`, `maxViews`, `maxDownloads` são exibidos e atualizados por esta UI.
- **Tema 5** (limite de tamanho via painel): usa `share.maxSize` que já existe e é exibido no mesmo modal.

---

## 7. Pontos pendentes de decisão (a confirmar antes/durante a execução)

| Ponto | Default provável | Comentário |
|-------|------|------|
| Tamanho padrão da senha gerada | 12 chars (configurável) | Recomendado 10–16. Boa entropia (maiúsculas, minúsculas, números, sem símbolos ambíguos). |
| Permitir link `?pwd=` (config `share.includePasswordInShareLink`) | `false` | Segurança vs. conveniência. |
| Senha gerada contém símbolos? | Sem símbolos ambíguos (`0/O`, `1/l/I`) | Easier para digitação. |
| Expiração default de shares criados pelo admin | `share.defaultExpiration` (7 dias) | Já existe hoje. |
| Limpeza do botão "Editar" para visualizadores anônimos | Escondido | Já condicional via `isOwnerOrAdmin`. |
| Exibição da senha gerada em UI admin posteriormente | Não exibir após fechar modal | Senha em texto só no momento da criação; depois só "alterar". |

---

## 8. Referências (código)

- `backend/prisma/schema.prisma` — models `Share` (views, downloads), `ShareSecurity` (password, maxViews, maxDownloads).
- `backend/src/share/share.service.ts:47` — `create()` — senha em texto puro; hash com argon; não auto-gera.
- `backend/src/share/share.service.ts:480` — `getShareToken()` — valida senha com `argon.verify`; valida `maxViews`.
- `backend/src/share/share.service.ts:523` — `generateShareToken()` — JWT assina `sharePasswordSignature` (HMAC da senha).
- `backend/src/share/share.controller.ts:154` — `POST /api/shares/:id/token` — seta cookie `share_<id>_token`.
- `backend/src/file/guard/downloadLimit.guard.ts` — valida `maxDownloads` (introduzido pelo tema R7 anterior).
- `backend/prisma/seed/config.seed.ts:71` — categoria `share` — adicionar novas chaves aqui.
- `frontend/src/pages/_app.tsx:36` — `excludeDefaultLayoutRoutes` — adicionar `/share/[shareId]`.
- `frontend/src/pages/share/[shareId]/index.tsx` — tela de visualização que precisa virar exclusiva.
- `frontend/src/components/upload/modals/showCreateUploadModal.tsx` — modal de criação do share; senha atualmente é manual; URL preview é `/s/...` (provavelmente bug).
- `frontend/src/components/upload/modals/showCompletedUploadModal.tsx` — modal de "upload completado"; local para exibir link + senha + metadados.
- `frontend/src/components/share/showShareInformationsModal.tsx` — modal de edição (admin); adicionar `maxDownloads`.
- `frontend/src/components/admin/shares/ManageShareTable.tsx` — tabela admin; adicionar colunas views/downloads.

---

*Documento gerado em 2026-07-25 — maintainer do projeto.*
