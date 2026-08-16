# Certificado de Autenticidade (SHA-256) — Documentação Técnica

> **Funcionalidade**: Geração automática de certificado PDF para cada arquivo enviado em um compartilhamento.
> **Status**: Implementado e validado E2E
> **Modelo**: Replica fiel de `docs/certificado.pdf`

---

## 1. Visão Geral

Ao **concluir um compartilhamento** (endpoint `POST /api/shares/:id/complete`), o sistema gera automaticamente um **certificado PDF** para **cada arquivo** do share. O certificado:

- Contém o **hash SHA-256** do arquivo original (função de verificação de integridade) — impresso em texto **e em QR Code**.
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
    │       │               ├── 1. (opcional) embedCertificateInVideo() — ffmpeg in-place
    │       │               │      retorna { originalHash, finalHash, finalSize }
    │       │               ├── 2. sha256OfShareFile() → hash SHA-256 do arquivo
    │       │               ├── 3. monta PDF A4 (pdfkit) com hash + QR Code + metadados
    │       │               ├── 4. salva em {shareId}/{fileId}.certificado.pdf
    │       │               └── 5. registra File no banco
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
  system: CertificateSystemInfo, // platform, nodeVersion (sem hostname/IP/storage — SEC-NEW-5)
  hashes?: { originalHash?: string; finalHash?: string },  // opcional (vídeos)
  finalSizeBytes?: number | bigint,                        // opcional (vídeos)
): Promise<{ relativePath: string; hash: string }>
```

Passos:

1. **(Opcional) Metadados no vídeo** — `embedCertificateInVideo()` embute código/hash/share/proprietário via `ffmpeg -metadata` (in-place) e retorna `{ originalHash, finalHash, finalSize }`.
2. **Hash SHA-256** — lê o arquivo via `repository.createReadStream(`${shareId}/${fileId}`)` e calcula o digest hex (`sha256OfShareFile`).
3. **Montagem do PDF** — usa `pdfkit` com página **A4 portrait**, margem 50, fundo `#F5FBF9`, faixa superior `#2E8B8B`, fontes Helvetica/Helvetica-Bold. Código de verificação = UUID derivado do SHA-256 de `share.id + ":" + fileId`. **QR Code** do hash SHA-256 gerado com `qrcode` (`QRCode.toBuffer`, centralizado, 70x70pt).
4. **Persistência** — grava em `DATA_DIRECTORY/uploads/shares/{shareId}/{fileId}.certificado.pdf`.
5. **Registro no banco** — cria um registro `File`:

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
- **Dados do sistema** (`getSystemInfo()`): `plataforma + release` e `process.version` (Node.js). **Desde 2026-08-15 (SEC-NEW-5)** o certificado público NÃO embute hostname, IP interno ou caminho de storage — removidos para evitar info disclosure a visitantes.

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
| **Cabeçalho** | Título "Certificado de Autenticidade", data/hora de geração (fuso de Brasília) e legenda "Horário oficial de Brasília (UTC−3)" |
| **Documento** | Nome do arquivo em destaque, Código para verificação (UUID) |
| **Metadados** | Documento ID, Arquivo ID, Proprietário, E-mail, Criado em, Tamanho (bytes), Extensão, Tipo (MIME), Descrição |
| **Integridade** | **Hash SHA-256** do arquivo original (e **Hash final (pós-metadados)** + **Tamanho final** quando o vídeo recebe metadados embutidos) |
| **QR Code** | **QR Code** com `SHA-256: {hash}` — leitura rápida do hash do arquivo original |
| **Sistema** | Plataforma, Node.js |
| **Eventos** | DOCUMENTO CRIADO, ARQUIVO ENVIADO, CERTIFICADO GERADO (com hash) |
| **Rodapé** | `Certificado gerado em {data} — horário de Brasília - Brasil` |

Datas formatadas em português no **fuso de Brasília (UTC-3)**, independentemente do fuso do servidor/container:

```ts
import type { PluginFunc } from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
// ...
const BRASILIA_TIMEZONE = "America/Sao_Paulo";
const nowLabel = dayjs().tz(BRASILIA_TIMEZONE).locale("pt-br")
  .format("DD [de] MMMM [de] YYYY, HH:mm:ss");
```

> Em produção o servidor roda em UTC. Sem o `.tz(BRASILIA_TIMEZONE)` as datas sairiam em UTC, divergindo da legenda "horário de Brasília" do rodapé. Ex.: `14 de agosto de 2026, 19:36:34` (Brasília) quando o relógio do servidor marca `22:36 UTC`.

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

### 7.3 Download do vídeo original baixa junto o certificado

Ao baixar um **vídeo original** (`GET /api/shares/:shareId/files/:fileId` com `download=true`), o backend detecta se existe o certificado correspondente (`hasCertificate()`) e retorna um **ZIP `video.mp4.zip`** contendo o vídeo **+** o certificado PDF (`getVideoWithCertificateZip()`), garantindo que destinatário e criador recebam sempre o par (autenticidade + integridade) junto. O download do certificado em si permanece disponível individualmente.

### 7.4 Proteção de acesso

O certificado é servido pelo **mesmo endpoint** dos demais arquivos:

```
GET /api/shares/:shareId/files/:fileId
```

Portanto herda a **mesma proteção** (`SharePublicAccess`):
- Requer senha/token do share quando o share é protegido por senha.

> **Exceção (regra de negócio)**: o certificado (`*.certificado.pdf`) **não passa pelo `DownloadLimitGuard`** — após liberar o acesso com a senha, o certificado fica sempre baixável, **não conta para o limite de downloads** e **não incrementa `share.downloads`**. Apenas o vídeo/arquivo original conta para `maxDownloads`.

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
- `qrcode` + `@types/qrcode` (backend) — geração do QR Code com o hash SHA-256
- `dayjs` com locale `pt-br` + plugins `utc` e `timezone` (fuso de Brasília `America/Sao_Paulo`)

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
- Datas em português (ex.: `13 de agosto de 2026`) e em **horário de Brasília (UTC-3)** mesmo com o servidor em UTC.

### 11.3 Resultado

- `npm run build` ✅
- `npm run lint` ✅
- `npm test` — **208 testes unitários passam** (18 suites), incluindo a suíte da funcionalidade de certificado.

---

## 12. Limitações e Observações

- **Nome do arquivo**: o certificado é nomeado `{nome_original}.certificado.pdf`. Se um arquivo com nome idêntico já existir no share, há risco de colisão de nome na listagem.
- **Geração assíncrona**: pode haver um curto intervalo entre o `complete()` e o certificado estar pronto/visível na listagem.
- **Custo de I/O**: para arquivos grandes, o cálculo do SHA-256 lê o arquivo inteiro uma vez durante a geração.

---

## 13. Verificação de Autenticidade e Integridade

O sistema aplica duas camadas de verificação porque, ao concluir o share, **embutir metadados de autenticidade no próprio vídeo** (via `ffmpeg -metadata`, in-place) antes de calcular o hash final. Por isso o certificado PDF exibe **dois hashes**:

| Campo no PDF | O que é | Quando usar |
|---|---|---|
| **Hash SHA-256** | Hash do vídeo **original** (antes de embutir metadados) | Verificação de autenticidade (vídeos antigos/sem metadados) |
| **Hash final (pós-metadados)** | Hash do vídeo **com metadados embutidos** (o que é baixado) | Verificação de integridade do arquivo baixado |
| **Código para verificação** | UUID derivado de `sha256(share.id + ":" + fileId)[:36]` | Atalho de pertinência (vídeo↔certificado↔share) |

> Para arquivos **não-vídeo** (PDF, ZIP, imagens etc.) não há embutimento de metadados — o certificado lista apenas o **Hash SHA-256** (do arquivo original), e a verificação de integridade é direta.

### 13.1 Verificação de Integridade (arquivo não corrompido)

Confirma que o arquivo baixado é byte-a-byte o que foi certado. Compare o hash calculado com o **hash final (pós-metadados)** do PDF (para vídeos) ou com o **Hash SHA-256** (para não-vídeos).

```bash
sha256sum video.mp4
# saída: <hash>  video.mp4
# compare com "Hash final (pós-metadados)" no certificado PDF
```

No Windows (PowerShell):

```powershell
Get-FileHash video.mp4 -Algorithm SHA256
```

Se os dois valores forem idênticos, o arquivo está **íntegro**.

### 13.2 Verificação de Autenticidade (é o vídeo enviado pelo dono)

O paradeiro da autenticidade está **dentro do próprio vídeo** nos metadados embutidos pelo `ffmpeg`. Além do hash, o sistema grava um campo `comment` com o código de verificação, o hash original, o share e o proprietário.

Extraia os metadados do vídeo:

```bash
ffprobe -v error -show_entries format_tags=title,comment -of default=noprint_wrappers=1 video.mp4
```

A saída do `comment` tem este formato:

```
Certificado de autenticidade | Código: 953f6d90-366d-30b8-97e6-3009d573cc20 | Hash SHA-256 (original): <hash> | Share: <shareId> | Proprietário: <nome> | E-mail: <email>
```

Compare **três valores** entre o metadado do vídeo e o certificado PDF:

| Campo no `comment` do vídeo | Campo no PDF | Comparação |
|---|---|---|
| `Código: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXX` | "Código para verificação" | Deve ser idêntico |
| `Hash SHA-256 (original): <hash>` | "Hash SHA-256" | Deve ser idêntico |
| `Share: <id>` | ID no campo "Documento" ou na URL do share | Deve ser idêntico |

Se todos baterem, o vídeo é **autêntico** — foi certado por este sistema, para este share, por este proprietário.

### 13.3 Atalho de Pertinência (vídeo ↔ certificado ↔ share)

A verificação mais rápida, sem calcular hash, é conferir apenas o **código de verificação** — ele é derivado deterministicamente de `sha256(share.id + ":" + fileId)` e formado como UUID:

```
verificationCode = sha256(shareId + ":" + fileId).slice(0, 36)
formattedCode    = UUID(verificationCode)  # XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXX
```

O mesmo código aparece:

1. No **certificado PDF** (campo "Código para verificação")
2. No **metadado `comment`** do vídeo (extraído via `ffprobe`)
3. Pode ser recalculado a partir do `shareId` + `fileId` (IDs listados no próprio PDF)

Se os três valores forem idênticos, o par vídeo + certificado pertence ao mesmo share/fileId — **não é preciso calcular nenhum hash**.

### 13.4 Resumo prático

| Objetivo | Ferramenta | Comparação |
|---|---|---|
| **Integridade** (não corrompido) | `sha256sum video.mp4` | resultado vs "Hash final (pós-metadados)" do PDF |
| **Autenticidade** (vídeo do dono) | `ffprobe ... format_tags=comment` | `comment` do vídeo vs "Código" + "Hash SHA-256" do PDF |
| **Pertinência** (vínculo share↔vídeo) | `ffprobe ... format_tags=comment` | código no `comment` vs "Código para verificação" do PDF |
| **Leitura rápida (QR Code)** | leitor de QR Code | QR do PDF contém `SHA-256: {hash}` — deve bater com o "Hash SHA-256" impresso |

### 13.5 Verificação no Linux/macOS (script)

```bash
#!/usr/bin/env bash
# verify-cert.sh <video.mp4> <certificado.pdf>
set -euo pipefail

VIDEO="${1:?uso: verify-cert.sh <video> <certificado.pdf>}"
PDF="${2:?uso: verify-cert.sh <video> <certificado.pdf>}"

echo "=== Hash do arquivo baixado ==="
sha256sum "$VIDEO"

echo
echo "=== Metadados de autenticidade embutidos no vídeo ==="
ffprobe -v error -show_entries format_tags=title,comment -of default=noprint_wrappers=1 "$VIDEO"

echo
echo "=== Abra o certificado PDF e confira: ==="
echo "  - 'Hash final (pós-metadados)' deve ser igual ao sha256sum acima"
echo "  - 'Código para verificação' deve ser igual ao 'Código' no comment"
echo "  - 'Hash SHA-256' deve ser igual ao 'Hash SHA-256 (original)' no comment"
echo "  - O Share ID no comment deve ser igual ao 'Documento ID' do PDF"
echo
echo "PDF: $PDF"
```

---

*Fim do documento CERTIFICADO.md*