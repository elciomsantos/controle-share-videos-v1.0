# Certificado de Assinaturas (SHA-256) — Documentação Técnica

> **Funcionalidade**: Geração automática de certificado PDF para cada arquivo enviado em um compartilhamento.
> **Status**: Implementado e validado E2E
> **Modelo**: Replica fiel de `docs/certificado.pdf`

---

## 1. Visão Geral

Ao **concluir um compartilhamento** (endpoint `POST /api/shares/:id/complete`), o sistema gera automaticamente um **certificado PDF** para **cada arquivo** do share. O certificado:

- Contém o **hash SHA-256** do arquivo original (função de verificação de integridade).
- Reúne metadados do arquivo, dados do share, dados do sistema e linha de eventos.
- É **salvo no mesmo diretório do share**, junto ao arquivo.
- É **registrado como um arquivo do share** (`File` no banco), portanto **aparece na listagem** da interface e é **baixável pelo mesmo endpoint** dos demais arquivos.

---

## 2. Fluxo de Geração

```
[Usuário] ── upload (chunks) ──► POST /api/shares/:shareId/files
    │
    ▼
[Usuário] ── POST /api/shares/:shareId/complete
    │
    ├──► ShareService.complete()
    │       │
    │       ├── valida: share existe, uploadLocked, tem ≥1 arquivo
    │       │
    │       ├──► generateCertificates(shareId)   [fire-and-forget, não bloqueia]
    │       │       │
    │       │       ▼
    │       │   para cada file do share:
    │       │       └──► CertificateService.generateCertificate(...)
    │       │               ├── 1. sha256OfShareFile() → hash SHA-256 do arquivo
    │       │               ├── 2. monta PDF A4 (pdfkit) replicando o modelo
    │       │               ├── 3. salva em {shareId}/{fileId}.certificado.pdf
    │       │               └── 4. registra File no banco
    │       │
    │       ├──► archiveService.createZip()  (se >1 arquivo)
    │       └──► notifica destinatários por e-mail
    │
    ▼
[Frontend] ── GET /api/shares/:shareId ──► lista files (inclui certificado)
```

> **Importante**: a geração do certificado é **assíncrona e tolerante a falhas**. Um erro na geração é apenas logado (`Falha ao gerar certificado do share {id}`) e **não impede a conclusão** do share.

---

## 3. Componentes Envolvidos

| Arquivo | Responsabilidade |
|---|---|
| `backend/src/certificate/certificate.service.ts` | Geração do PDF (pdfkit), cálculo do SHA-256, persistência no storage e registro no banco |
| `backend/src/certificate/certificate.module.ts` | Módulo NestJS que provê e exporta `CertificateService` |
| `backend/src/share/share.service.ts` | Orquestra a geração no `complete()`; coleta dados do share e do sistema |
| `backend/src/share/share.module.ts` | Importa `CertificateModule` |
| `backend/src/file/local.service.ts` | Download e remoção de arquivos; resolve o caminho real do certificado no disco |
| `backend/src/file/file.controller.ts` | Rotas HTTP de download/listagem |
| `backend/src/storage/` | Abstração `IUploadRepository` (leitura/escrita no storage) |

---

## 4. Detalhamento da Implementação

### 4.1 `CertificateService.generateCertificate()`

Assinatura:

```ts
async generateCertificate(
  shareId: string,
  fileId: string,
  file: CertificateFileInfo,     // nome, tamanho, MIME, extensão, descrição
  share: CertificateShareInfo,   // id, createdAt, ownerName, ownerEmail
  system: CertificateSystemInfo, // hostname, ip, platform, nodeVersion, storagePath
): Promise<{ relativePath: string; hash: string }>
```

Passos:

1. **Hash SHA-256** — lê o arquivo via `repository.createReadStream(`${shareId}/${fileId}`)` e calcula o digest hex (`sha256OfShareFile`).
2. **Montagem do PDF** — usa `pdfkit` com página **A4 portrait**, margem 50, fundo `#F5FBF9`, faixa superior `#2E8B8B`, fontes Helvetica/Helvetica-Bold. Código de verificação = UUID derivado do SHA-256 de `share.id + ":" + fileId`.
3. **Persistência** — grava em `DATA_DIRECTORY/uploads/shares/{shareId}/{fileId}.certificado.pdf`.
4. **Registro no banco** — cria um registro `File`:

```ts
await this.prisma.file.create({
  data: {
    name: `${file.fileName}.certificado.pdf`,
    size: stats.size,
    description: `Certificado SHA-256 de ${file.fileName}`,
    share: { connect: { id: shareId } },
  },
});
```

### 4.2 `ShareService.generateCertificates()`

Chama `CertificateService` para **todos os arquivos** do share. Coleta:

- **Dados do share**: `id`, `createdAt`, nome/e-mail do criador.
- **Dados do sistema** (`getSystemInfo()`): hostname, primeiro IP IPv4 não-interno, `plataforma + release`, `process.version` (Node.js) e caminho de storage.

### 4.3 Integração com `complete()`

No `ShareService.complete()`:

```ts
void this.generateCertificates(id).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  this.logger.error(`Falha ao gerar certificado do share ${id}: ${message}`);
});
```

Padrão **fire-and-forget** com `void` + `catch` — a conclusão do share não espera o certificado.

---

## 5. Conteúdo do Certificado

O PDF contém (replicando `docs/certificado.pdf`):

| Seção | Campos |
|---|---|
| **Cabeçalho** | Título "Certificado de assinaturas", data/hora de geração (fuso de Brasília) |
| **Documento** | Nome do arquivo em destaque, Código para verificação (UUID) |
| **Metadados** | Documento ID, Arquivo ID, Proprietário, E-mail, Criado em, Tamanho (bytes), Extensão, Tipo (MIME), Descrição |
| **Integridade** | **Hash SHA-256** do arquivo original |
| **Sistema** | Hostname, IP, Plataforma, Node.js, Caminho de armazenamento |
| **Eventos** | DOCUMENTO CRIADO, ARQUIVO ENVIADO, CERTIFICADO GERADO (com hash) |
| **Rodapé** | `Gerado por {hostname} em {data} — horário de Brasília - Brasil` |

Datas formatadas em português (`dayjs().locale("pt-br")`), ex.: `13 de agosto de 2026, 19:09:19`.

---

## 6. Nomeação e Localização dos Arquivos

O certificado de um arquivo com id `FILE_ID` no share `SHARE_ID` é salvo como:

```
data/uploads/shares/{SHARE_ID}/{FILE_ID}.certificado.pdf
```

Exemplo real:

```
data/uploads/shares/3lp4lvAtJs1EjWTynqGF/cea364a1-f505-4623-b660-31798aefd81b.certificado.pdf
```

---

## 7. Integração com Download e Listagem

### 7.1 Aparece na listagem do share

Como o certificado é um registro `File` conectado ao share, ele aparece no campo `files` da resposta de `GET /api/shares/:shareId` (e da listagem admin). Exemplo:

```json
"files": [
  { "id": "6012f65d-...", "name": "video.mp4",            "size": "2800" },
  { "id": "73d7b643-...", "name": "video.mp4.certificado.pdf", "size": "3479",
    "description": "Certificado SHA-256 de video.mp4" }
]
```

### 7.2 Download — resolução do caminho no disco

O registro `File` do certificado tem **id próprio** (UUID), diferente do nome do arquivo no disco (`{FILE_ID}.certificado.pdf`). Para servir o download correto, `LocalFileService.get()` usa `resolveDiskPath()`, que:

- Se o nome do arquivo **termina com `.certificado.pdf`**, procura o arquivo original no mesmo share (pelo nome) e monta o caminho `{shareId}/{originalId}.certificado.pdf`.
- Caso contrário, usa `{shareId}/{fileId}` (comportamento padrão).

O mesmo resolver é usado em `remove()`.

### 7.3 Proteção de acesso

O certificado é servido pelo **mesmo endpoint** dos demais arquivos:

```
GET /api/shares/:shareId/files/:fileId
```

Portanto herda a **mesma proteção** (`SharePublicAccess` + `DownloadLimitGuard`):
- Requer senha/token do share quando o share é protegido por senha.
- Respeita limites de downloads (`maxDownloads`).

> O comportamento de acesso é **idêntico ao do vídeo/arquivo original**.

---

## 8. Ciclo de Vida e Limpeza

O certificado vive **junto com o share**:

- **Deleção do share** (`DELETE /api/shares/:id` e job de expiração): `deleteAllFiles()` → `removeShareDirectory()` remove o diretório inteiro, incluindo o certificado.
- **Deleção de arquivo individual**: `remove()` usa `resolveDiskPath()` para apagar também o certificado correspondente.
- **Zip do share**: o certificado participa da compactação como qualquer arquivo.

Não há job específico de expiração de certificados — o ciclo de vida é o do share.

---

## 9. Configuração

A funcionalidade não exige configuração adicional. Depende das seguintes dependências já presentes:

- `pdfkit` + `@types/pdfkit` (backend)
- `dayjs` com locale `pt-br`

---

## 10. Logs Relevantes

| Evento | Log |
|---|---|
| Geração bem-sucedida | `[CertificateService] Certificado gerado para share {id} arquivo {fileId} (hash {12 chars}…)` |
| Falha (não bloqueia complete) | `[ShareService] Falha ao gerar certificado do share {id}: {erro}` |

---

## 11. Testes Realizados

### 11.1 E2E (via API)

1. `POST /api/shares` → cria share (201)
2. `POST /api/shares/:id/files` (octet-stream) → upload (201)
3. `POST /api/shares/:id/complete` → completa (202)
4. `GET /api/shares` → verifica que a lista inclui `{nome}.certificado.pdf`
5. `GET /api/shares/:id/files/:certFileId` → download do certificado (200, PDF válido)

### 11.2 Validação do conteúdo

- Hash SHA-256 conferido: **igual** entre o arquivo original e o registrado no certificado.
- PDF contém todos os campos: nome, tamanho, extensão, MIME, owner, datas, hash, system info e eventos.
- Datas em português (ex.: `13 de agosto de 2026`).

### 11.3 Resultado

- `npm run build` ✅
- `npm run lint` ✅
- `npm test` — 161 testes unitários passam (1 suite de e-mail pré-existente falha por ausência de SMTP no ambiente de teste, não relacionada a esta feature).

---

## 12. Limitações e Observações

- **Nome do arquivo**: o certificado é nomeado `{nome_original}.certificado.pdf`. Se um arquivo com nome idêntico já existir no share, há risco de colisão de nome na listagem.
- **Geração assíncrona**: pode haver um curto intervalo entre o `complete()` e o certificado estar pronto/visível na listagem.
- **Custo de I/O**: para arquivos grandes, o cálculo do SHA-256 lê o arquivo inteiro uma vez durante a geração.

---

*Fim do documento CERTIFICADO.md*