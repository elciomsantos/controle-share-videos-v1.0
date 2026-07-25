# Padronização 03 — Auditoria e Logs de Vídeo

> **Tema:** Criação de log dos dados do vídeo como: tamanho, data criação, data download,
> identificação do usuário (IP, data, hora) que baixou o vídeo, etc. (item 5 da lista de objetivos em `Visao-geral.md`).
>
> **Status:** Decidido — documentação completa; implementação de código pendente.
> **Decisão formal:** 25/07/2026.
> **Dependências:** Tema 1 (remoção de reverse shares — não bloqueia, mas é executado antes).

---

## 1. Decisão

Auditar dois tipos de evento por share: **download** (já registrado, enriquecido) e **view**
(novo, complementando o contador agregado). Toda tentativa (sucesso ou falha) é persistida.
Os logs ficam disponíveis ao admin em **nova tela admin `/admin/download-logs`** (rota hoje
mencionada no `Visao-geral.md` mas inexistente no frontend).

Princípios:

1. **Auditabilidade forense** — todo evento de acesso fica persistido em tabela própria.
2. **Sem PII extra** — captura-se IP e User-Agent; não se coleta e-mail do destinatário
   anônimo. Em conformidade com o uso interno (Sem暴露ação desnecessária).
3. **Sem degradação do caminho crítico** — registrar log nunca bloqueia o download
   (padrão já adotado: `void this.downloadLogService.record({...})`).
4. **Compatibilidade retrógrada** — campos novos são nullable; registros antigos ficam `null`.

---

## 2. Estado Atual (levantamento)

### 2.1 Tabela `DownloadLog` (existente em `schema.prisma:160-178`)

```prisma
model DownloadLog {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  shareId  String
  fileId   String?
  fileName String
  userId   String?
  username String?
  ip       String
  success  Boolean
  reason   String?
  @@index([shareId])
  @@index([userId])
  @@index([createdAt])
}
```

- Não há `userAgent` nem `fileSize`.
- `File.size` é `String` (não numérico) — mantemos consistência usando `String` para o log.

### 2.2 Pontos onde se grava log (3 hoje)

| Local | Evento | registra |
|------|--------|---------|
| `file.controller.ts:94` | `GET /api/shares/:id/files/zip` — ZIP baixado | shareId, fileName=`<shareId>.zip`, user/ip/success |
| `file.controller.ts:149` | `GET /api/shares/:id/files/:fileId?download=true` — arquivo único | shareId, fileId, fileName, user/ip/success |
| `downloadLimit.guard.ts:44` | Bloqueio por `maxDownloads` excedido | success=false, reason="maxDownloads reached" |

### 2.3 Contadores de view

- `ShareService.increaseViewCount(share)` (`share.service.ts:473`) incrementa `Share.views` ao obter token via `GET /api/shares/:id/token` (`share.controller.ts:154`).
- `FileSecurityGuard` (`fileSecurity.guard.ts:84`) também chama `increaseViewCount`.
- **Não há**量为 log persistente de view — só o contador agregado.

### 2.4 Frontend (logs)

- `grep -rn "download-logs"` no `frontend/src/` retorna **0 resultados**.
- Endpoint `GET /api/admin/download-logs` existe e é paginado/filtrável, mas **ninguém consome**.
- A rota `/admin/download-logs` citada em `Visao-geral.md:318` é uma **promessa não cumprida**.

---

## 3. Padronização

### 3.1 Schema — Nova migration adicionando campos

**Política de migration:** criar nova migration Prisma (não editar migrations antigas — ver Tema 1 §4). Nome sugerido: `2026xxxx_add_log_useragent_filesize_and_viewlog`.

Alterações:

```prisma
model DownloadLog {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())

  shareId  String
  fileId   String?
  fileName String
  fileSize String?   // NOVO — copiado de File.size (em bytes, como String p/ consistência)

  userId   String?
  username String?
  ip       String

  userAgent String?  // NOVO — req.headers["user-agent"]
  success  Boolean
  reason   String?

  event String @default("download")  // NOVO — discrimina tipo: "download" | "view"

  @@index([shareId])
  @@index([userId])
  @@index([createdAt])
  @@index([event])     // NOVO — permite filtro por tipo
}
```

**Notas:**
- Todos os campos novos são nullable (`fileSize`, `userAgent`) ou têm default (`event`), então registros antigos continuam válidos.
- `event` default `"download"` preenche todos os registros existentes.
- `FileSize` é `String?` (igual ao `File.size`) — evita problemas de BigInt no SQLite.
- Renomear **não é necessário** — o model continua `DownloadLog` mesmo cobrindo view (event discrimina). Reduz churn.
- `DownloadLogEntry` interface em `download-log.service.ts:9` atualizada para incluir os novos campos.

### 3.2 Backend — `DownloadLogService.record()` enriquecido

1. **Captura de userAgent e fileSize** em cada ponto de chamada (`file.controller.ts:94`, `:149`, `downloadLimit.guard.ts:44`):
   - `userAgent = req.headers["user-agent"] ?? null`
   - `fileSize`: já disponível em `file.metaData.size` (`file.controller.ts:140`), ou `null` para ZIP.
2. **View logs** — novo ponto: `ShareService.increaseViewCount` (ou um novo método `recordView(share, req)`) chama `downloadLogService.record({ ..., event: "view", fileName: share.name ?? shareId, success: true })`. Captura `ip`, `userAgent`.
3. **Logs de falha de view** — em `FileSecurityGuard` quando `maxViews` excedido, registramos `event: "view", success: false, reason: "maxViews reached"`, sem incrementar `views` (comportamento já existente).
4. **Logs de falha de senha** — em `ShareService.getShareToken` quando a senha falha, chamamos `downloadLogService.record({ shareId, event: "view", success: false, reason: "wrong password", ip, userAgent })` **antes** de lançar a exceção.

### 3.3 Backend — `DownloadLogService.findAll()` estendido

- Adicionar filtro opcional `event?: "download" | "view"` ao `findAll` (`download-log.service.ts:48`).
- Adicionar filtro opcional `success?: boolean` (para mostrar só falhas, por ex.).
- Controller `admin-download-logs.controller.ts:11` repassa os novos query params.

### 3.4 Frontend — Nova tela admin `/admin/download-logs`

**Arquivos a criar/alterar:**

- `frontend/src/pages/admin/download-logs/index.tsx` — página nova, seguint o padrão de outras admin pages (ex.: `/admin/users`).
- `frontend/src/services/admin.service.ts` (ou novo `download-log.service.ts`) — função `getDownloadLogs(params)` que chama `GET /api/admin/download-logs`.
- `frontend/src/components/admin/download-logs/DownloadLogsTable.tsx` — tabela Using Mantine Table.
- `frontend/src/components/admin/` — adicionar item de menu lateral "Logs / Download logs" apontando para `/admin/download-logs`.

**Layout da tabela (colunas):**
| Data | Share | Arquivo | Tamanho | Evento | Usuário | IP | User-Agent | Status | Motivo |
|------|-------|---------|---------|--------|---------|----|----------|--------|---------|

**Filtros (num `<Tabs>` ou `<Grid>` acima da tabela):**
- Share ID (input)
- Usuário (input)
- Evento (select: Todos / Download / View)
- Sucesso (select: Todos / Sim / Não)
- Periodo (DatePickerInput range)
- Botão "Exportar CSV" (opcional — pode ser postergado)

**Paginação:** usar `Pagination` Mantine conforme `limit`/`page` do backend (`totalPages`).

### 3.5 Internacionalização (i18n)

Novas chaves em `frontend/src/i18n/locales/pt-br/admin.ts`:

```ts
downloadLogs: {
  title: "Logs de Download",
  filters: {
    shareId: "Share ID",
    userId: "Usuário",
    event: "Evento",
    success: "Status",
    dateRange: "Período",
    any: "Todos",
    downloadsOnly: "Downloads",
    viewsOnly: "Visualizações",
    successOnly: "Sucesso",
    failureOnly: "Falhas",
  },
  columns: {
    createdAt: "Data",
    shareId: "Share",
    fileName: "Arquivo",
    fileSize: "Tamanho",
    event: "Evento",
    username: "Usuário",
    ip: "IP",
    userAgent: "User-Agent",
    success: "Status",
    reason: "Motivo",
  },
  events: {
    download: "Download",
    view: "Visualização",
  },
  status: {
    success: "Sucesso",
    failure: "Falha",
  },
  empty: "Nenhum log encontrado.",
}
```

### 3.6 Chaves de Config (não necessárias)

Este tema não introduz novas chaves de configuração — todo log é persistido por default (princípio da auditoria contínua). Se no futuro tornar-se necessário desabilitar logs de view para economia de espaço, cria-se uma chave `audit.logViews` (default `true`); não faremos agora (YAGNI).

### 3.7 Privacidade / políticas de retenção

- **IPs** são guardados integralmente (uso interno restrito — não há GDPR externo).
- **Retenção:** atualmente sem limpeza automática (logs crescem indefinidamente). Recomenda-se, mas **fora deste tema**, criar cron `deleteOldDownloadLogs` (ex.: manter 365 dias) — registre-se como follow-up no Tema 8 (refino do Visao-geral.md) ou num Tema futuro.
- **Exportação:** logs nunca saem do servidor por e-mail/HTTP de admin; apenas consulta via tela.

---

## 4. Migration — Política

- Criar **nova migration Prisma** (não editar `schema.prisma` sem regenerar migration nem reverter migrations antigas).
- Comando (a executar na fase de código): `npx prisma migrate dev --name add_log_useragent_filesize_and_viewlog` dentro de `backend/`.
- Seed: atualizar `seed/config.seed.ts` **não é necessário** (sem novas chaves de Config).
- Atualizar `seed/seed.ts` se houver inserção de `DownloadLog` de exemplo para incluir os novos campos (provável teste manual em dev).

---

## 5. Critérios de Aceite

- [ ] Nova migration criada com campos `fileSize`, `userAgent`, `event` adicionados a `DownloadLog`.
- [ ] `DownloadLogEntry` interface inclui `fileSize?`, `userAgent?`, `event?: "download" | "view"`.
- [ ] `DownloadLogService.record()` persiste os novos campos.
- [ ] `DownloadLogService.findAll()` aceita filtros `event` e `success`.
- [ ] Endpoint `GET /api/admin/download-logs` aceita query `event` e `success`.
- [ ] View de share (token / arquivo) cria log com `event="view"`.
- [ ] Falha de senha na obtenção do token cria log com `event="view", success=false, reason="wrong password"`.
- [ ] Falha de `maxViews` em `FileSecurityGuard` cria log com `event="view", success=false`.
- [ ] Falha de `maxDownloads` em `DownloadLimitGuard` cria log com `event="download", success=false` (já existe — validar os novos campos).
- [ ] Página `/admin/download-logs` criada no frontend.
- [ ] Tabela exibe colunas: Data, Share, Arquivo, Tamanho, Evento, Usuário, IP, User-Agent, Status, Motivo.
- [ ] Filtros (shareId, userId, event, success, período) funcionam.
- [ ] Paginação respeita `totalPages` do backend.
- [ ] Item de menu lateral "Logs / Download logs" presente (restrito a admin via `AdministratorGuard`).
- [ ] Chaves i18n PT-BR adicionadas.
- [ ] Lint e typecheck passam.

---

## 6. Mapa de Referências ao Código

| Arquivo | Linha | O que mexer |
|--------|------|------------|
| `backend/prisma/schema.prisma` | 160-178 | Adicionar `fileSize String?`, `userAgent String?`, `event String @default("download")`, `@@index([event])` |
| `backend/prisma/seed/seed.ts` | — | Se inserir logs de teste, atualizar shape |
| `backend/src/download-log/download-log.service.ts` | 9-18 | Estender `DownloadLogEntry` com `fileSize?`, `userAgent?`, `event?` |
| `backend/src/download-log/download-log.service.ts` | 26-46 | `record()` grava novos campos |
| `backend/src/download-log/download-log.service.ts` | 48-90 | `findAll()` aceitar `event?`, `success?` no `where` |
| `backend/src/download-log/admin-download-logs.controller.ts` | 11-28 | Repassar query `event`, `success` |
| `backend/src/file/file.controller.ts` | 94-101 | Capturar `userAgent`, `fileSize=null` (ZIP) e pasar a `record()` |
| `backend/src/file/file.controller.ts` | 149-157 | Capturar `userAgent` e `fileSize=file.metaData.size` |
| `backend/src/file/guard/downloadLimit.guard.ts` | 44-? | Em falha `maxDownloads`, registrar `event="download", success=false`, `userAgent` |
| `backend/src/file/guard/fileSecurity.guard.ts` | 77-84 | Em falha `maxViews`, registrar `event="view", success=false, reason="maxViews reached"` |
| `backend/src/share/share.service.ts` | 480-? (`getShareToken`) | Em falha de senha, chamar `downloadLogService.record({ ..., event="view", success=false, reason="wrong password" })` |
| `backend/src/share/share.service.ts` | 473-478 (`increaseViewCount`) | Após incrementar, chamar `downloadLogService.record({ ..., event="view", success=true })` |
| `backend/src/share/share.module.ts` | — | Certificar que `DownloadLogModule` está importado |
| `frontend/src/pages/admin/download-logs/index.tsx` | — | NOVO: página admin |
| `frontend/src/components/admin/download-logs/DownloadLogsTable.tsx` | — | NOVO: tabela |
| `frontend/src/services/admin.service.ts` (ou novo `download-log.service.ts`) | — | NOVO/EXTENDER: `getDownloadLogs(params)` |
| `frontend/src/components/admin/AdminMenu` ou equivalente | — | Adicionar item "Logs / Download logs" |
| `frontend/src/i18n/locales/pt-br/admin.ts` (ou equivalente) | — | Adicionar `downloadLogs` namespace |

---

## 7. Riscos / Observações

1. **Volume de logs** — logs de view (a cada abertura do link) podem gerar muito mais registros que os de download. Para nosso uso interno (1 admin + poucos usuários), é aceitável; se escalar, criar cron de limpeza (fora deste tema).
2. ** `File.size` String** — optamos por `String?` para `fileSize` no log para manter consistência.展 em telas/admin, converter p/ número para exibir "10 MB" (formatação i18n via `prettyBytes`).
3. **Retrocompatibilidade** — todos os campos novos nullable/default — não quebra logs antigos.
4. **Performance** — índice extra em `event` adiciona custo baixo de escrita; compensa pelo filtro comum.
5. **Privacy** — capturar User-Agent pode identificar cliente/navegador; é aceitável em contexto interno mas deve estar claro na política de privacidade do系统的（在visao-geral.md §13 já menciona auditoria com "IP/UA/timestamp" — coerente).

---

## 8. Follow-ups (fora deste tema)

- **Cron de retenção** — criar `deleteOldDownloadLogs` (similar a `deleteExpiredTokens`) com janela configurável.
- **Exportação CSV** — útil para auditoria externa; adicionar endpoint `GET /api/admin/download-logs/export?format=csv` e botão na tela.
- **Dashboard de auditoria** — métricas agregadas (downloads por dia, top IPs, taxa de falha) numa página separada.
- **Logs admin actions** — registrar login/logout admin, mudanças de config, criação/remoção de shares/usuários (decidir num Tema futuro se necessário).

---

**Fim do Tema 3.**
