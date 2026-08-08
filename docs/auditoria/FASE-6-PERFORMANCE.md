# Fase 6 — Auditoria de Performance

**Status:** ✅ Concluída
**Data:** 2026-08-04
**Escopo:** auditoria baseada em padrões de performance para Node.js/NestJS/Next.js: paginação e carga de dados (N+1, `includes`), caminho quente de upload/complete/download (zip, e-mails, streaming), latência de respostas, jobs agendados (blocking I/O, falta de batching), cache (in-memory, service worker, Next), concorrência de uploads e suporte a HTTP Range para mídia. Referências cruzadas com BDB-02/BDB-03/BDB-04 (Fase 4).

---

## 6.1 Resumo Executivo

A base é **bem comportada no essencial**: configurações são cacheadas em memória (recarregadas apenas em atualização), downloads são transmitidos por stream (sem bufferizar arquivo inteiro em RAM), uploads têm concorrência limitada a 3 no frontend, a API nunca é cacheada pelo service worker, o Next.js roda com `images.unoptimized` e sem cache em memória, e os jobs de expiração de tokens/logs usam `deleteMany` em lote. Entretanto, há **quatro pontos de degradação estrutural**: as **listagens de shares não têm paginação** e carregam todos os arquivos/destinatários em memória; o `complete()` **envia e-mails sequencialmente**; o `createZip()` **abre até 10.000 streams de arquivo simultâneos** com compressão nível 9 rodando inline no processo; e o **download de arquivos não suporta HTTP Range (206)**, o que quebra o *seek*/retomada de vídeo — crítica para um fork de compartilhamento de vídeos. Foram identificados **7 achados**:

| Severidade | Qtd |
|---|---|
| Alto | 1 |
| Médio | 4 |
| Baixo | 2 |
| **Total** | **7** |

**Principal gargalo:** `getShares()`/`getSharesByUser()` (share.service.ts:272-301) executam `findMany` sem `take`/cursor com `include: { files, creator, security, recipients }` — a carga cresce linearmente com o acervo e satura memória/DB em escala (mesma família do BDB-03 da Fase 4).

---

## 6.2 Critérios Avaliados

| Critério | Status |
|---|---|
| Paginação nas listagens (shares/logs) | ⚠️ Parcial (PERF-01 — shares sem paginação; logs paginados ✅) |
| Carga N+1 / `includes` pesados | ⚠️ Parcial (PERF-01 — listagens com joins completos) |
| Latência do `complete()` (upload finalizado) | ✅ Corrigido (PERF-02 — e-mails em paralelo via `Promise.allSettled`) |
| Geração de ZIP (memória/descritores/CPU) | ✅ Corrigido (PERF-03 — streams lazy em lotes + deflate 6) |
| Jobs de limpeza (batching/blocking I/O) | ⚠️ Parcial (PERF-04/PERF-05; tokens/logs usam `deleteMany` ✅) |
| Download de arquivos (stream + HTTP Range) | ⚠️ Parcial (PERF-06 — stream ✅, sem Range/206 ❌) |
| Cache de configuração | ✅ Adequado (in-memory, recarga só em update) |
| Concorrência de uploads | ✅ Adequado (`pLimit(3)` no frontend) |
| Cache HTTP / Service Worker | ✅ Adequado (`NetworkOnly` para `/api`; Next sem cache em memória) |
| Proteção anti zip-bomb / limites | ✅ Adequado (maxFiles/maxTotalSize/maxRatio + guard de razão) |
---

## 6.3 Achados Detalhados

### PERF-01 — Listagens de shares sem paginação e com `includes` completos

- **Problema:** `getShares()` (admin, todos os shares) e `getSharesByUser()` (shares do usuário) executam `findMany` **sem `take`/cursor** e com `include: { files: true, creator: true, security: true, recipients: true }`. Cada share carrega todos os arquivos, destinatários e segurança na memória. O custo (memória + tempo de query) cresce linearmente com o acervo; o `transformShare()` (l.280/300) ainda processa cada item após o carregamento.
- **Localização:** `backend/src/share/share.service.ts:272-301`; controladores admin/`share.controller.ts` (listagens).
- **Evidência:**
  ```ts
  const shares = await this.prisma.share.findMany({
    orderBy: { expiration: "desc" },
    include: { files: true, creator: true, security: true, recipients: true },
  });
  return shares.map((share) => this.transformShare(share));
  ```
- **Situação Atual:** Correto para volumes pequenos (instalação interna/air-gapped típica), mas sem teto: um acervo de milhares de shares degrada o endpoint de listagem e o processo. `download-log` já faz paginação correta (download-log.service.ts:67-112, `[data, total]` em `Promise.all`), o que demonstra o padrão esperado. **Referência cruzada:** BDB-03 (Fase 4) — "paginação por cursor nas listagens".
- **Implementação (recomendada):** adicionar `take` + cursor (ou `skip`) com limite configurável; separar listagem (metadata) de detalhe (`get(id)`); remover `include` de `files`/`recipients` quando a listagem não os usa (substituir por contagem agregada `_count` do Prisma).
- **Código Atual:**
  ```ts
  findMany({ orderBy: { expiration: "desc" }, include: { files: true, creator: true, security: true, recipients: true } })
  ```
- **Código Sugerido:**
  ```ts
  findMany({
    where,
    orderBy: { expiration: "desc" },
    take: 50,
    cursor: nextCursor ? { id: nextCursor } : undefined,
    skip: nextCursor ? 1 : 0,
    select: { id, expiration, uploadLocked, description, createdAt, _count: { select: { files: true } }, security: { select: { password: true } } },
  })
  ```
- **Benefícios:** resposta e memória O(1) por página; protege o processo em acervos grandes; habilita carregamento incremental no frontend.
- **Riscos:** mudança de contrato na resposta da listagem (frontend precisa adaptar à paginação) — mitigável com DTO.
- **Compatibilidade:** quebra de compatibilidade planejada para a Fase 12 (Refatoração); Fase 3 (frontend) deve consumir o novo contrato.

---

### PERF-02 — `complete()` envia e-mails de destinatários sequencialmente

- **Problema:** No `complete()` do share, o laço `for (const recipient of share.recipients) { await sendMailToShareRecipients(...) }` aguarda cada SMTP roundtrip um a um. Com N destinatários, a resposta HTTP do `complete()` demora `N × latência_SMTP` (tipicamente 100–500 ms cada) e segura o worker.
- **Localização:** `backend/src/share/share.service.ts:235-244`.
- **Evidência:**
  ```ts
  for (const recipient of share.recipients) {
    await this.emailService.sendMailToShareRecipients(
      recipient.email, recipient.id, share.id,
      share.creator ?? undefined, share.description ?? undefined,
      share.expiration,
    );
  }
  ```
- **Situação Atual:** Listas de destinatários pequenas (1–5) passam despercebidas; listas maiores degradam a UX do upload e o throughput do servidor. A falha de um e-mail (SMTP fora) aborta o `complete()` inteiro e impede o `uploadLocked`.
- **Implementação (recomendada):** `await Promise.allSettled(share.recipients.map(r => sendMailToShareRecipients(...)))` com política de tolerância a falha por destinatário (log + prosseguir), ou enfileirar em background. Manter ordem irrelevante para e-mails.
- **Código Atual:**
  ```ts
  for (const recipient of share.recipients) { await this.emailService.sendMailToShareRecipients(...); }
  ```
- **Código Sugerido:**
  ```ts
  await Promise.allSettled(
    share.recipients.map((r) =>
      this.emailService.sendMailToShareRecipients(
        r.email, r.id, share.id,
        share.creator ?? undefined, share.description ?? undefined, share.expiration,
      ).catch((err) => this.logger.error(`Falha ao notificar ${r.email}`, err)),
    ),
  );
  ```
- **Benefícios:** latência do `complete()` ≈ máxima das notificações (não a soma); resiliência a falha parcial de SMTP; `uploadLocked` sempre atingido.
- **Riscos:** SMTP pode aplicar throttling/rate-limit em rajadas — mitigar com concorrência limitada (ex.: `p-limit(5)`) se necessário.
- **Compatibilidade:** compatível; resposta do `complete()` inalterada.
- **✅ Implementado:** `backend/src/share/share.service.ts` — e-mails enviados via `Promise.allSettled` com log de falhas por destinatário (`logger.error`); falha de e-mail não aborta mais o `complete()` nem impede `uploadLocked: true`. Atualizado também o `uploadLocked` (PERF-05/PERF-06).
---

### PERF-03 — `createZip()` abre até `zipMaxFiles` streams simultâneos com deflate nível 9 inline

- **Problema:** O laço `for (const file of files) { archive.append(fs.createReadStream(...)) }` cria **um `ReadStream` (descritor de arquivo) por arquivo, todos abertos ao mesmo tempo** enquanto o archiver consome a fila. Com o default `zipMaxFiles = 10000` (config.seed.ts:117-122), há risco real de `EMFILE: too many open files` (limite típico 1024–65536) em shares grandes. Além disso, a compressão roda no processo do servidor com `zipCompressionLevel` default **9** (config.seed.ts:112-115) — pico de CPU no threadpool do libuv, competindo com o atendimento HTTP (o zip é disparado inline no `complete()`, share.service.ts:215-232).
- **Localização:** `backend/src/share/share.service.ts:119-183` (laço em 179-183); defaults em `backend/prisma/seed/config.seed.ts:112-125`; `createZipStream()` em `backend/src/common/zip.ts:28-39`.
- **Evidência:**
  ```ts
  const MAX_FILES = this.config.get("share.zipMaxFiles") ?? 10000;      // default 10000
  ...
  for (const file of files) {
    archive.append(fs.createReadStream(`${path}/${file.id}`), { name: file.name });
  }
  ```
  ```ts
  zipCompressionLevel: { type: "number", defaultValue: "9" }
  ```
- **Situação Atual:** Share de dezenas de arquivos é OK; centenas/milhares de arquivos → descritores esgotados e/ou rajada de CPU no momento do `complete()`. O guard anti zip-bomb (share.service.ts:155-177) mitiga o *output* inflado, mas não o custo de descritores/CPU.
- **Implementação (recomendada):** (1) abrir o `createReadStream` de forma **lazy** (ex.: `archive.append(() => fs.createReadStream(...))` ou wrapper que só abre o FD quando o archiver solicita) ou limitar a concorrência com um semáforo; (2) reduzir o default de `zipCompressionLevel` para 1–6 (store/`level 0` preserva vídeos já comprimidos quase sem perda) ou manter nível alto apenas para shares pequenos; (3) avaliar gerar o zip em processo/job separado.
- **Código Atual:**
  ```ts
  archive.append(fs.createReadStream(`${path}/${file.id}`), { name: file.name });
  ```
- **Código Sugerido:**
  ```ts
  archive.append(() => fs.createReadStream(`${path}/${file.id}`), { name: file.name }); // lazy FD
  // + default zipCompressionLevel = 1 (vídeos já são mídia comprimida)
  ```
- **Benefícios:** evita `EMFILE` em shares grandes; reduz pico de CPU no `complete()`; acelera o zip de vídeos (deflate em mídia já comprimida desperdiça CPU).
- **Riscos:** archiver v6/8 (ESM `ZipArchive`) exige a forma lazy correta — validar em teste de integração; nível baixo aumenta pouco o tamanho do zip.
- **Compatibilidade:** compatível; contrato do ZIP inalterado.
- **✅ Implementado:** `backend/src/share/share-archive.service.ts` — `ReadStream` abertos em lotes de 16 (`BATCH_SIZE`), aguardando o evento `drain` do archiver entre lotes (concorrência limitada de descritores); `backend/prisma/seed/config.seed.ts` — default `zipCompressionLevel` reduzido de `"9"` para `"6"`. Testes atualizados no `share.service.spec.ts` (mock com `emitDrain`).

---

### PERF-04 — Jobs de limpeza sem batching/limite por execução

- **Problema:** `deleteExpiredShares()` roda a **cada minuto** (`@Cron("* * * * *")`, jobs.service.ts:21) e faz `findMany` de **todos** os shares expirados, deletando-os **sequencialmente** (1 `deleteAllFiles` + 1 `share.delete` por iteração, com `await`). O mesmo padrão em `deleteUnfinishedShares()` (6/6 h) e `deleteUnactivatedUsers()` (1/h, com `include: { shares: true }`). Com backlog grande, a execução dura minutos, segurando o worker e alargando a janela de corrida com a API (uploads em curso que acabam expirados).
- **Localização:** `backend/src/jobs/jobs.service.ts:21-58` (expired), `60-86` (unfinished), `167-188` (unactivated); `fileService.deleteAllFiles` em `backend/src/file/local.service.ts:318-323`.
- **Evidência:**
  ```ts
  @Cron("* * * * *")
  async deleteExpiredShares() {
    const expiredShares = await this.prisma.share.findMany({ where: { AND: [...] } });
    for (const expiredShare of expiredShares) {
      await this.fileService.deleteAllFiles(expiredShare.id);
      await this.prisma.share.delete({ where: { id: expiredShare.id } });
    }
  }
  ```
- **Situação Atual:** Funciona, mas sem teto de trabalho por execução e sem lotes (`deleteMany`). A limpeza de **tokens e logs** já é modelar: `deleteMany` em lote (jobs.service.ts:120-165). **Referência cruzada:** BDB-04 (Fase 4) — "jobs de limpeza transacionais e em lotes".
- **Implementação (recomendada):** processar em lotes — `take`/`limit` por execução (ex.: 100), usando `skip`/cursor, e/ou `deleteMany` quando a deleção de arquivos não for obrigatória por share (caso `deleteExpiredShares` deixa de depender do loop porque pode remover a pasta via `deleteAllFiles` em paralelo com `Promise.all` limitado). Considerar janela de execução única por instância (lock) para evitar dupla execução.
- **Código Atual:**
  ```ts
  for (const expiredShare of expiredShares) {
    await this.fileService.deleteAllFiles(expiredShare.id);
    await this.prisma.share.delete({ where: { id: expiredShare.id } });
  }
  ```
- **Código Sugerido:**
  ```ts
  // processar em lotes de N por execução e paralelizar a limpeza de disco
  for (const batch of chunk(expiredShares, 50)) {
    await Promise.all(batch.map((s) => this.fileService.deleteAllFiles(s.id)));
    await this.prisma.share.deleteMany({ where: { id: { in: batch.map((s) => s.id) } } });
  }
  ```
- **Benefícios:** tempo de execução limitado por ciclo; menor contenção com requisições; menor pico de I/O.
- **Riscos:** limitar o lote pode deixar backlog em instalações muito grandes — acompanhar métrica de profundidade da fila.
- **Compatibilidade:** compatível; sem mudança de contrato.
---

### PERF-05 — `deleteTemporaryFiles()` usa I/O de arquivo síncrono

- **Problema:** O job diário usa `fs.readdirSync`/`fs.statSync`/`fs.rmSync` (síncronos) em **todos** os diretórios de share e arquivos `.tmp-chunk`. I/O síncrono bloqueia o event loop inteiro durante a varredura — em um disco com milhares de shares, o servidor congela (HTTP/websocket/pings) pelo tempo do job.
- **Localização:** `backend/src/jobs/jobs.service.ts:88-118`.
- **Evidência:**
  ```ts
  const shareDirectories = fs.readdirSync(SHARE_DIRECTORY, { withFileTypes: true })...
  for (const shareDirectory of shareDirectories) {
    const temporaryFiles = fs.readdirSync(`${SHARE_DIRECTORY}/${shareDirectory}`)...
    for (const file of temporaryFiles) {
      const stats = fs.statSync(...);
      if (isOlderThanOneDay) { fs.rmSync(...); }
    }
  }
  ```
- **Situação Atual:** Aceitável em instalação pequena; perigoso em escala. Os demais jobs usam `await`/`Promise.all` corretamente.
- **Implementação (recomendada):** migrar para `fs/promises` (`readdir`, `stat`, `rm`) com `Promise.all` limitado por lote; manter a lógica idêntica.
- **Código Atual:** `fs.readdirSync(...)` / `fs.statSync(...)` / `fs.rmSync(...)`.
- **Código Sugerido:**
  ```ts
  import { promises as fsp } from "fs";
  for (const shareDirectory of shareDirectories) {
    const temporaryFiles = (await fsp.readdir(path)).filter(f => f.endsWith(".tmp-chunk"));
    const results = await Promise.all(temporaryFiles.map(async (file) => {
      const stats = await fsp.stat(path);
      if (dayjs(stats.mtime).add(1, "day").isBefore(dayjs())) { await fsp.rm(path); return 1; }
      return 0;
    }));
    filesDeleted += results.reduce((a, b) => a + b, 0);
  }
  ```
- **Benefícios:** event loop desobstruído durante a limpeza; sem latência artificial nas requisições concorrentes.
- **Riscos:** baixo; mudança mecânica.
- **Compatibilidade:** compatível.

---

### PERF-06 — Download de arquivos sem suporte a HTTP Range (206) — *seek* de vídeo quebrado

- **Problema:** O endpoint `GET /api/shares/:shareId/files/:fileId` (file.controller.ts:150-248) sempre responde **200 com o arquivo completo** (`Content-Length` total, `StreamableFile`). Não há tratamento do header `Range`/`If-Range` → nunca devolve **206 Partial Content**. Navegadores usam Range para `<video>`/`<audio>` (busca/seek, retomada) e para downloads resumíveis. No preview de vídeo do frontend (FilePreview.tsx:264-293, `<video>` nativo com `?download=false`), a falta de 206 impede o *seek* e força o browser a baixar o arquivo inteiro para iniciar a reprodução — inviável para vídeos grandes.
- **Localização:** `backend/src/file/file.controller.ts:150-248` (getFile) e `212-222` (headers, sem Range); `backend/src/file/local.service.ts:274-292` (`createReadStream` do arquivo completo); consumo em `frontend/src/components/share/FilePreview.tsx:264-293`; comentário no SW confirmando o uso de range para mídia (`frontend/src/sw.ts:21`).
- **Evidência:**
  ```ts
  const headers = {
    "Content-Type": mime?.lookup?.(...) || "application/octet-stream",
    "Content-Length": file.metaData.size,
    "Content-Security-Policy": "sandbox",
    "Cache-Control": "no-store",
    ...
  };
  res.set(headers);
  return new StreamableFile(file.file);   // sempre o arquivo completo
  ```
  (grep por `Range`/`206`/`partial content` no `src/` do backend: **zero ocorrências**)
- **Situação Atual:** downloads e previews funcionam, mas sem seek/retomada; todo arquivo trafega uma vez. Com `Cache-Control: no-store`, cada play recarrega o arquivo por inteiro. Para o domínio do fork (vídeos), é o achado de maior impacto operacional.
- **Implementação (recomendada):** adicionar suporte a `Range` no `getFile`: parsear `Range: bytes=start-end`, usar `fs.createReadStream(path, { start, end })`, responder `206` com `Content-Range` e `Accept-Ranges: bytes`; manter `CSP: sandbox` e `Cache-Control: no-store` (ou `no-cache` + `ETag` para retomada). Considerar `Content-Length` do segmento.
- **Código Atual:** `createReadStream(path)` sem opções; resposta sempre 200.
- **Código Sugerido:**
  ```ts
  const range = parseRange(req.headers.range, file.metaData.size); // ex.: start=0,end=524287
  const stream = createReadStream(path, range ?? undefined);
  res.set({
    "Content-Type": mime?.lookup?.(file.metaData.name) || "application/octet-stream",
    "Content-Length": range ? range.length : file.metaData.size,
    "Accept-Ranges": "bytes",
    "Content-Range": range ? `bytes ${range.start}-${range.end}/${file.metaData.size}` : undefined,
    "Content-Security-Policy": "sandbox",
  });
  if (range) res.status(206);
  return new StreamableFile(stream);
  ```
- **Benefícios:** *seek* e retomada de vídeo/áudio; menos banda (browser baixa só o necessário); downloads resumíveis.
- **Riscos:** contagem de views/downloads já é feita por requisição (`downloadLimitGuard`, `downloadLogService.record` em file.controller.ts:226-246) — com Range, um seek dispara múltiplas requisições; é preciso contar apenas o primeiro (ou manter por requisição e documentar). Validar interação com `?download=false` e com o guard de limite.
- **Compatibilidade:** aditiva — clientes antigos continuam recebendo 200; browsers passam a receber 206.

---

### PERF-07 — Health check lê a tabela `Config` inteira

- **Problema:** `/health` executa `prismaService.config.findMany()` (todas as linhas de configuração) apenas para provar conectividade com o banco.
- **Localização:** `backend/src/app.controller.ts:10-20`.
- **Evidência:**
  ```ts
  await this.prismaService.config.findMany();
  return "OK";
  ```
- **Situação Atual:** Irrelevante em volume (tabela pequena), mas o *probe* de health de orquestradores (K8s/Docker) roda a cada poucos segundos — leitura desnecessária e mais cara que o mínimo.
- **Implementação (recomendada):** usar `$queryRaw`/`$executeRaw` com `SELECT 1` (ou `prisma.$queryRaw\`SELECT 1\``) para o probe de liveness.
- **Código Atual:** `await this.prismaService.config.findMany();`
- **Código Sugerido:** `await this.prismaService.$queryRaw\`SELECT 1\`;`
- **Benefícios:** probe barato (1 row), padrão de health check de banco.
- **Riscos:** nenhum (SELECT 1 não expõe dados).
- **Compatibilidade:** compatível.
- **✅ Resolvido (2026-08-07, junto com DOP-08/Fase 9):** `backend/src/app.controller.ts` usa `prisma.$queryRaw\`SELECT 1\`` no probe `/api/health`. Validado por `tsc` (tsconfig.build) e lint; e2e `GET /api/health` → 200 permanece.
---

## 6.4 Fortalezas / Boas práticas já existentes (não são achados)

- **Cache de configuração:** `ConfigService` mantém `configVariables` em memória (config.service.ts:29) e recarrega **apenas** em `update()` (config.service.ts:215) — nenhum `findMany` por requisição.
- **Uploads chunked com concorrência limitada:** frontend usa `pLimit(3)` (`EditableUpload.tsx:19`, `upload/index.tsx:24`) — 3 uploads simultâneos, sem saturar o servidor.
- **Download por stream:** `StreamableFile(file.file)` (file.controller.ts:248) e `createReadStream` (local.service.ts:282) — o arquivo nunca é bufferizado inteiro em RAM.
- **Download de share como ZIP pré-gerado:** `archive.zip` criado async após `complete()` e servido por stream (`getZip`, local.service.ts:325-339) — evita recompactar a cada download.
- **Proteção anti zip-bomb:** limites `zipMaxFiles`/`zipMaxTotalSize`/`zipMaxRatio` (config.seed.ts:117-130) + guard de razão em tempo real (share.service.ts:149-177).
- **Service Worker disciplinado:** `NetworkOnly` para todo `/api` (sw.ts:24-26) — cache nunca interfere em requisições autenticadas/contadas.
- **Next.js otimizado p/ servidor de mídia:** `images.unoptimized` (sem otimização de imagem por CPU no servidor), `cacheMaxMemorySize: 0` (sem cache de memória) e `output: standalone`.
- **Expiração de tokens e logs em lote:** `deleteMany` com filtro de data (jobs.service.ts:120-165) — padrão correto de limpeza.
- **Throttling global:** `ThrottlerModule` 100 req/60 s (app.module.ts:45-48) + limites por rota sensível — protege CPU de abuso.
- **Log de downloads paginado:** `findAll` com `take`/`skip` e `[data, total]` em `Promise.all` (download-log.service.ts:67-112).

---

## 6.5 Classificação Risco × Impacto × Esforço

| ID | Achado | Risco | Impacto | Esforço | Quick Win? |
|---|---|---|---|---|---|
| PERF-01 | Listagens de shares sem paginação (includes completos) | Alto | Escala | Médio | ❌ |
| PERF-02 | E-mails sequenciais no `complete()` | Médio | Latência | Muito Baixo | ✅ |
| PERF-03 | `createZip()` — N streams simultâneos + deflate 9 | Médio | CPU/EMFILE | Baixo | ✅ (nível zip) |
| PERF-04 | Jobs de limpeza sem batching/limite | Médio | Escala | Baixo | ⚠️ parcial |
| PERF-05 | `deleteTemporaryFiles()` com fs síncrono | Baixo | Blocking I/O | Baixo | ✅ |
| PERF-06 | Downloads sem HTTP Range (206) — vídeo sem seek | Médio | Funcional/UX | Médio | ❌ |
| PERF-07 | Health check lê tabela `Config` inteira | Baixo | Trivial | Muito Baixo | ✅ |

---

## 6.6 Recomendações Prioritárias

1. **PERF-06 (Médio, maior impacto funcional no fork):** adicionar suporte a HTTP Range/206 no download de arquivos — habilita *seek* e retomada de vídeo no preview e em downloads. Alinhar a contagem de views/downloads (file.controller.ts:226-246) para contabilizar apenas a primeira requisição de um mesmo stream.
2. **PERF-02/PERF-05/PERF-07 (Quick Wins):** `Promise.allSettled` nos e-mails do `complete()`; `fs/promises` no job de temporários; `SELECT 1` no `/health`. Baixo esforço, ganho imediato. *(PERF-02 ✅ implementado; PERF-05 ✅ implementado.)*
3. **PERF-03 (Quick Win de CPU):** reduzir o default de `zipCompressionLevel` (9 → 1–6) e abrir `ReadStream` de forma lazy no `createZip()` — evita `EMFILE` e picos de CPU na finalização de shares grandes. *(✅ implementado: lotes de 16 com `drain` + default nível 6.)*
4. **PERF-01 + PERF-04 (Refatoração):** paginação por cursor nas listagens e batching nos jobs — devem entrar na Fase 12 (Refatoração) junto com BDB-03/BDB-04; a Fase 3 (frontend) precisará consumir o contrato paginado.

---

## 6.7 Notas de Execução

- **Notas de Execução (Fase 6):** originalmente nenhum achado aplicado. **Exceção (decisão do solicitante):** PERF-02, PERF-03 e PERF-05 foram implementados e validadas por testes; PERF-01 e PERF-04 permanecem para a Fase 12 (Refatoração).
- **Referências cruzadas:** PERF-01 ↔ BDB-03 e PERF-04 ↔ BDB-04 (Fase 4); PERF-01 → Fase 3 (frontend deve consumir paginação); PERF-06 → FRN (Fase 3) e Fase 9 (proxy não deve buffar/negar Range); PERF-03 → SEC-08/GAP-04 (Fase 5, zip-bomb); PERF-02 → Fase 2 (BKD, caminho quente do `complete()`).
- **Evidências coletadas em:** `share/share.service.ts`, `jobs/jobs.service.ts`, `config/config.service.ts`, `app.controller.ts`, `file/file.controller.ts`, `file/local.service.ts`, `common/zip.ts`, `prisma/seed/config.seed.ts`, `download-log/download-log.service.ts`, `frontend/src/sw.ts`, `frontend/src/components/share/FilePreview.tsx`, `frontend/src/components/upload/EditableUpload.tsx`, `frontend/next.config.js`.
- **Métricas sugeridas para o `Especificacao-final.md`:** p95 da latência do `complete()` × nº de destinatários; nº de FDs abertos vs. `zipMaxFiles`; profundidade do backlog de shares expirados por ciclo do job; % de requisições 206 após a implementação do Range.
