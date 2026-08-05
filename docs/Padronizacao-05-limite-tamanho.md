# Padronização 05 — Limite de Tamanho de Arquivo via Painel Administrativo

> **Tema:** "Controle sobre o tamanho dos arquivos podendo aumentar e diminuir via painel
> de administração (a fazer)." (item 6 da lista de objetivos em `Visao-geral.md`)
>
> **Status:** Decidido — **funcionalidade já existente**; requer apenas ajuste
> documental (reclassificação de "a fazer" para "verificado"). Sem mudança de código.
> **Decisão formal:** 25/07/2026.

---

## 1. Decisão

Após análise, constatou-se que o sistema **já atende** ao objetivo do Tema 5:

- `share.maxSize` (default 1 GB) é uma chave de `Config` da categoria `share`, editável
  na página `/admin/config?category=share` via componente `FileSizeInput`.
- A aplicação do limite ocorre em `local.service.ts:90-101` durante o upload de cada
  chunk: se `fileSizeSum + diskFileSize + buffer > limit`, retorna
  `HttpStatus.PAYLOAD_TOO_LARGE` com i18n `file.maxSizeExceeded`.
- Existe ainda override por usuário (`User.shareSizeLimit`) configurável no modal
  `showUpdateUserModal`,permitindo limite individual diferente do global.
- O frontend já mostra o limite dinamicamente no `Dropzone` (`Dropzone.tsx:117`,
  `EditableUpload.tsx:65-67`) e exibe mensagem formatada quando ultrapassado
  (`upload.dropzone.notify.file-too-big`).

**Portanto:** o Tema 5 não introduz schema, backend nem frontend novos — apenas
**reclassifica o item de "a fazer" para "verificado/documentado"** na `Visao-geral.md`.

---

## 2. Estado Atual (levantamento)

### 2.1 Schema

- `Share` não tem campo próprio de limite — o limite é global (`Config.share.maxSize`)
  ou por usuário (`User.shareSizeLimit String?`).
- `File.size` é `String` (bytes em texto).

### 2.2 Config — `prisma/seed/config.seed.ts:97-101`

```ts
maxSize: {
  type: "filesize",
  defaultValue: "1000000000",  // 1 GB
  secret: false,
},
```

- Categoria `share`, type `filesize`, editável no painel, não secreta.

### 2.3 Backend — aplicação do limite

`backend/src/file/local.service.ts:82-101`:

```ts
const fileSizeSum = share.files.reduce((n, { size }) => n + parseInt(size), 0);
const shareSizeSum = fileSizeSum + diskFileSize + buffer.byteLength;
let limit = parseInt(this.config.get("share.maxSize"));
if (share.reverseShare?.maxShareSize) {
  limit = parseInt(share.reverseShare.maxShareSize);
} else if (share.creator?.shareSizeLimit) {
  limit = parseInt(share.creator.shareSizeLimit);
}
if (shareSizeSum > limit) {
  throw new HttpException(this.i18n.t("file.maxSizeExceeded"), HttpStatus.PAYLOAD_TOO_LARGE);
}
```

**Observação:** o trecho `if (share.reverseShare?.maxShareSize)` ficará **morto** após o
Tema 1 (remoção de reverse shares) — o ramo `else if` (user override) passará a ser o
único override. Recomenda-se, na fase de código do Tema 1, **remover o ramo do reverse
share** e simplificar para:

```ts
let limit = parseInt(this.config.get("share.maxSize"));
if (share.creator?.shareSizeLimit) {
  limit = parseInt(share.creator.shareSizeLimit);
}
```

Isso está documentado no mapa de referências do Tema 1.

### 2.4 Frontend — administração

`/admin/config?category=share` renderiza `AdminConfigInput` (`AdminConfigInput.tsx:283-290`)
quando `configVariable.type == "filesize"`, usando `FileSizeInput`. O admin pode:

- Aumentar (ex.: 10 GB) ou diminuir (ex.: 100 MB) o limite global.
- Salvar via `updateConfigVariable`.

### 2.5 Frontend — transparência no upload

- `Dropzone.tsx:117` lê `maxShareSize` (via `useConfig`) e mostra no `acceptedFiles`
  do react-dropzone.
- `EditableUpload.tsx:65-67` aplica override: `user?.shareSizeLimit ?? config.get("share.maxSize")`.
- Mensagem i18n `upload.dropzone.notify.file-too-big`: "Seus arquivos excedem o tamanho
  máximo do compartilhamento {maxSize}."

### 2.6 Frontend — override por usuário

- `showCreateUserModal.tsx:50-51, 87-89, 143-148` — switch "limite customizado" + `FileSizeInput`.
- `showUpdateUserModal.tsx:53-55, 112-114, 165-167` — idem para edição.

---

## 3. Padronização

### 3.1 Decisão — Manter o que existe

1. **`share.maxSize`** permanece a fonte de verdade global do limite, editável no painel
   admin em `/admin/config?category=share`. Faixa default 1 GB; admin pode ajustar entre
   qualquer valor suportado pelo `FileSizeInput` (sem hard bound; o limite de fato é o
   espaço em disco do servidor).
2. **`User.shareSizeLimit`** permanece como override opcional, configurável no modal de
   criação/edição de usuário (apenas pelo admin — ver Tema 4). Se `null`, usa global.
3. **Aplicação** permanece no backend (`local.service.ts`), durante o upload,
   retornando `413 PAYLOAD_TOO_LARGE` com i18n `file.maxSizeExceeded`.
4. **Transparência** no frontend `Dropzone` continua mostrando o limite efetivo antes
   do upload, com mensagem `upload.dropzone.notify.file-too-big` em caso de excedente.

### 3.2 Recomendações (opcionais, fora do escopo mínimo)

Estas существуют como follow-ups **opcionais** — não bloqueiam o "Decidido" do Tema 5:

1. **Limite por arquivo único** distinto do total do share — hoje não há. Para vídeos
   longos, o admin pode querer impedir arquivo único > X mesmo que o share total < Y.
   Criar chave `share.maxFileSize` (type `filesize`, default null = ilimitado) e validar
   em `local.service.ts` ao receber o primeiro chunk (ou ao finalizar o arquivo). Avaliar
   em follow-up se útil.
2. **Presets rápidos** no painel admin (1 GB, 5 GB, 10 GB, "ilimitado") como botões de
   atalho. Pouco valor; o `FileSizeInput` já é flexível. Skip.
3. **UX de erro mais visível** — hoje o backend rejeita com 413 no meio do upload, o
   que aborta após já transferir vários chunks. Could improve: pré-check no frontend
   antes de iniciar o upload, somando tamanhos e comparando com `maxShareSize`. Avaliar
   em follow-up.
4. **Bypass admin** — hoje `share.maxSize` se aplica indistintamente. Para casos onde o
   admin pretende enviar algo maior, ele deve temporariamente aumentar o limite global.
   Não há bypass por role — se desejado, follow-up `share.maxSizeAdminBypass=true`.

### 3.3 Alinhamento com Tema 1

Quando o Tema 1 (remoção de reverse shares) for implementado em código, **remover o ramo
morto** em `local.service.ts:91-92` conforme §2.3. Documentado como cross-reference aqui.

### 3.4 Alinhamento com Tema 4

Após Tema 4 (roles), a tela `/admin/config?category=share` deve exigir `@Roles("admin")`
write — auditor sem acesso. Já está coberto pela substituição de `AdministratorGuard` por
`@Roles("admin")` (Tema 4 §3.5).

---

## 4. Migration — Política

**Sem nova migration.** Nenhuma alteração de schema, nenhuma nova chave de config. Apenas
ajuste documental na `Visao-geral.md` e na tabela do programa em `Padronizacao.md`.

---

## 5. Critérios de Aceite

- [ ] Documento criado (`Padronizacao-05-limite-tamanho.md`).
- [ ] `Visao-geral.md` atualizada: item 6 marcado como "verificado/documentado" e
      referência a este documento.
- [ ] `Padronizacao.md` tabela do programa atualizada (Tema 5 = Decidido).
- [ ] `README.md` atualizado se aplicável.
- [ ] (Sem implementação de código — funcionalidade já atende.)

---

## 6. Mapa de Referências ao Código

Não há alterações de código neste tema. Apenas referências para manutenção futura:

| Arquivo | Linha | O que observar |
|--------|------|---------------|
| `backend/prisma/seed/config.seed.ts` | 97-101 | `share.maxSize` default 1 GB; ajustável pelo admin. |
| `backend/src/file/local.service.ts` | 82-101 | Aplicação do limite no upload; ramo `reverseShare` a remover no Tema 1. |
| `backend/src/user/dto/user.dto.ts` | 41-43 | `shareSizeLimit` String com validação de digits. |
| `backend/src/user/dto/publicUser.dto.ts` | 7 | `shareSizeLimit` exposto p/ leitura. |
| `frontend/src/components/admin/configuration/AdminConfigInput.tsx` | 283-290 | Renderiza `FileSizeInput` para type `filesize`. |
| `frontend/src/components/upload/Dropzone.tsx` | 117, 157, 177 | Mostra `maxShareSize` no dropzone e mensagem quando excedido. |
| `frontend/src/components/upload/EditableUpload.tsx` | 65-67 | Override via `user.shareSizeLimit ?? config.get("share.maxSize")`. |
| `frontend/src/components/admin/users/showCreateUserModal.tsx` | 50-51, 87-89, 143-148 | Switch de override individual. |
| `frontend/src/components/admin/users/showUpdateUserModal.tsx` | 53-55, 112-114, 165-167 | Switch de override individual na edição. |
| `frontend/src/i18n/translations/pt-BR.ts` | 240 | `upload.dropzone.notify.file-too-big`. |

---

## 7. Riscos / Observações

1. **Limite "ilimitado"** — não há conceito de 0 ou null como "ilimitado" no `FileSizeInput`.
   Se o admin quiser desativar verificação, precisa setar um valor muito alto (ex.: 1 TB).
   Considerado aceitável — a qualquer momento o disco é o limite real.
2. **Sem limite por tipo MIME** — hoje qualquer extensão é aceita. Se no futuro se
   quiser restringir a tipos específicos (ex.: só vídeo), é outro tema (não é "tamanho").
3. **Validação de disco** — não há verificação de espaço real em disco antes de aceitar
   upload. Se admin setar `share.maxSize=1TB` mas servidor tem só 100 GB, o upload vai
   falhar no meio. Fora deste tema — recomendado futuro `df` check no backend.

---

## 8. Follow-ups (fora deste tema)

- **Limite por arquivo único** (`share.maxFileSize`) — ver §3.2.
- **Pré-check de espaço em disco** antes do upload — ver §3.2.
- **Bypass admin** (`share.maxSizeAdminBypass`) — ver §3.2.
- **Logs de rejeição por tamanho** (criar `DownloadLog` ou novo event quando upload é
  rejeitado por exceder limite — melhoria de auditoria; cruzar com Tema 3).

---

**Fim do Tema 5.**
