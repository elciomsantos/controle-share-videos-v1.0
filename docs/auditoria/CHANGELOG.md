# CHANGELOG — Controle Share Videos v1.0

> **Fase 17**: Registro de mudanças
> **Data**: 2026-08-10
> **Auditor**: Opencode (agente automatizado)
> **Comparação**: Conforme decisão do usuário, **não comparar com baseline anterior**. Foco em estado atual para go-live.

---

## v1.2 — Certificado de Assinaturas SHA-256 (2026-08-14)

### Resumo
Nova funcionalidade: geração automática de certificado PDF (replicando `docs/certificado.pdf`) para cada arquivo ao concluir um share. Documentação completa em `docs/CERTIFICADO.md`.

### Implementado
- `CertificateService` (`backend/src/certificate/`) — gera PDF A4 com `pdfkit`, calcula o hash SHA-256 do arquivo original e salva em `{shareId}/{fileId}.certificado.pdf`.
- `CertificateModule` — provido/exportado e importado no `ShareModule`.
- `ShareService.complete()` — dispara `generateCertificates()` (fire-and-forget, falha não bloqueia a conclusão).
- Registro do certificado como `File` no banco — **aparece na listagem do share** e é baixável pelo endpoint padrão.
- `LocalFileService.resolveDiskPath()` — resolve o caminho real do certificado no disco para download/remoção.
- Datas localizadas em pt-BR (`dayjs().locale("pt-br")`).

### Correções de bugs (v1.2.1)
- **`LocalFileService.getFileZip()`** usava `${shareId}/${fileId}` em vez de `resolveDiskPath()`. Para arquivos com subpasta no nome (ex.: `video/arquivo.mp4.certificado.pdf`), o download retornava 404/erro porque o id do certificado não existe no disco. Corrigido para usar `resolveDiskPath()`.
- **`JwtGuard.canActivate()`** retornava `true` para rotas `@Public()` **sem popular `request.user`**. O `ShareSecurityGuard` nunca reconhecia admin (`allowAdminAccessAllShares`) nem o criador → 403 `share_password_required` em shares com senha. Corrigido com `authenticateOptional()`: popula `request.user` a partir do cookie `access_token` em rotas públicas, sem nunca bloquear visitante anônimo.
- **Certificado não conta para o limite de downloads** (`FileController.getFile`): o certificado (`*.certificado.pdf`) **ignora o `DownloadLimitGuard` e não incrementa `share.downloads`**. Apenas o vídeo/arquivos originais contam para `maxDownloads`. Regra de negócio: após usar a senha para liberar o acesso, o certificado fica sempre baixável; o bloqueio vale apenas para o vídeo.
- Remoção de logs de depuração (`[DEBUG] Raw body parser`) em `main.ts`.

### Validado
- E2E via API: create → upload → complete → certificado listado → download (PDF válido) e visualização (200, `Content-Type: application/pdf`).
- Fluxo no navegador: página do share carrega para admin logado (200, sem 403), certificado aparece na listagem com visualização funcionando.
- Hash SHA-256 conferido (arquivo original = certificado).
- Build, lint e **207 testes unitários verdes** (18 suites).

---

## v1.2.2 — Reformulação do fluxo de certificado (2026-08-14)

### Resumo
Reformulação para atender `docs/PLANO-CERTIFICADO.md`: um share de upload de 1 vídeo passa a conter **somente o vídeo (com metadados embutidos in-place) + 1 certificado PDF**, sem o artefato intermediário `.assinado`. O certificado registra os hashes **original e final** (pós-metadados) e o tamanho final quando os bytes do vídeo mudam.

### Implementado
- `CertificateService.embedCertificateInVideo()` — embute o certificado de autenticidade (código/hash/share/proprietário) **diretamente no vídeo** via `ffmpeg -metadata` (in-place, substituindo o arquivo original, sem criar `.assinado`). Retorna `{ originalHash, finalHash, finalSize }`.
- `CertificateService.generateCertificate()` — agora aceita `hashes` (original/final) e `finalSizeBytes`; o PDF exibe **"Hash final (pós-metadados)"** e **"Tamanho final"** quando diferem do original.
- `ShareService.generateCertificates()` — chama `embedCertificateInVideo` primeiro e gera o certificado **uma única vez** com ambos os hashes; pula artefatos já gerados (`.certificado.pdf`, `.assinado.`).
- **BUG-FIX "baixar tudo"** (`ShareService.complete()`): a contagem `share.files.length` era do share antes da geração de certificados. Agora recontar via `prisma.file.count` após `generateCertificates()` → para 1 vídeo o zip agora é gerado e o "Transferir tudo" funciona.

### Correções de layout do PDF (v1.2.2)
- **Cabeçalho desalinhado**: `doc.text(text, centerX, y, { align: "center", width })` centraliza **dentro de `[x, x+width]`**, começando em `centerX` o texto terminava fora da página. Centralizado com `x = margin` e `width = pageWidth - 100` (offset +0 do centro da página).
- **4 páginas → 1 página**: conteúdo terminava em y≈855 (além do limite de texto do PDFKit). Layout compactado (linhas 18pt, seções de sistema/eventos enxutas, rodapé em `pageHeight - margin - 12`).

### Validado
- E2E via API + UI: share com 1 vídeo lista **2 arquivos** (vídeo + certificado, sem `.assinado`).
- Vídeo com metadados embutidos (ffprobe confirma comment com hash original).
- Certificado PDF com **1 página**, cabeçalho centralizado (offset +0) e ambos os hashes (`Hash SHA-256` original / `Hash final (pós-metadados)`) + `Tamanho` / `Tamanho final`.
- "Transferir tudo" (UI) baixa `archive.zip` válido com vídeo+PDF; download individual do vídeo gera zip vídeo+PDF.
- Build, lint e **208 testes unitários verdes** (18 suites).

---

## v1.2.3 — Correções de tela cheia e fuso horário do certificado (2026-08-14)

### Resumo
Duas correções pontuais: (1) a tarja de segurança do preview de vídeo passa a permanecer visível em tela cheia; (2) as datas exibidas no certificado passam a refletir o horário de Brasília (UTC-3), independentemente do fuso do servidor.

### Implementado

#### fix(share): tarja de proteção visível em tela cheia
- `frontend/src/components/share/FilePreview.tsx`
  - Helpers `getFullscreenElement` / `requestFullscreen` / `exitFullscreen` com fallback `webkit*` (Safari antigo).
  - `wrapperRef` envolve vídeo + tarja; botão customizado (`ActionIcon` com `TbArrowsMaximize`/`TbArrowsMinimize`) coloca o **wrapper** (e não apenas o `<video>`) em fullscreen, mantendo a tarja visível.
  - Handler `fullscreenchange` com guarda `wrapperFullscreenRef` evita reentrar em fullscreen durante a transição de saída do Chrome (que passa pelo `<video>` e causava prisão em tela cheia).
  - Estado `isFullscreen` alterna o `aria-label` entre "Entrar"/"Sair" da tela cheia.
- `frontend/src/styles/global.style.tsx` — `video::-webkit-media-controls-fullscreen-button { display: none !important; }` oculta o botão nativo (Chromium).
- `frontend/src/i18n/translations/pt-BR.ts` — chaves `share.video.fullscreen-enter` / `share.video.fullscreen-exit`.

#### fix(certificado): horário de Brasília (UTC-3) nas datas
- `backend/src/certificate/certificate.service.ts`
  - Plugins dayjs `utc` + `timezone` estendidos (mirando o padrão já usado em `email.service.ts`).
  - Constante `BRASILIA_TIMEZONE = "America/Sao_Paulo"`.
  - `nowLabel` (geração) e `shareCreated` (criação do share) formatados com `.tz(BRASILIA_TIMEZONE)` — antes saíam em UTC embora a legenda afirmasse "horário de Brasília".

### Motivação
- O container/servidor roda em UTC; o certificado tinha a legenda "horário de Brasília" mas as datas eram impressas em UTC (+3h).
- A tarja de proteção sumia em tela cheia porque o botão nativo do `<video>` entra em fullscreen apenas no elemento de vídeo (a tarja é irmã do `<video>`), e a tentativa anterior de redirecionar para o wrapper falhava com `TypeError: Permissions check failed` (ausência de user activation) e prendia o usuário em tela cheia.

### Validado
- **Certificado (E2E)**: share criado → vídeo enviado → complete → certificado gerado e baixado. Extração do PDF confirma `14 de agosto de 2026, 19:36:34` (Brasília) com servidor em `22:36 UTC` (diferença de 3h confirmada); rodapé e cabeçalho exibem "horário de Brasília - Brasil".
- **Fullscreen (UI)**: no app real, em fullscreen o wrapper é o `fullscreenElement`; a tarja (`<Text>` filha do wrapper) permanece visível; botão alterna os rótulos; saída limpa sem prisão em tela cheia.
- Backend: `eslint` ✅, `nest build` ✅, `share.service.spec.ts` (45 testes) ✅. Container `controle-videos-local-backend` reconstruído e healthy; fix confirmado no bundle (`grep America/Sao_Paulo`).
- Frontend: `eslint` ✅, `tsc --noEmit` ✅, `next build` ✅, `vitest run` (14 testes) ✅. Container `controle-videos-local-frontend` reconstruído e healthy.

### Commits
- `32de153` — `fix(certificado): exibe horário de Brasília (UTC-3) nas datas do certificado`
- `c7fc53b` — `fix(share): mantém tarja de proteção visível em tela cheia no preview de vídeo`

---

## v1.2.4 — QR Code no certificado + correção do ZIP e autenticidade (2026-08-15)

### Resumo
Adiciona um **QR Code** com o hash SHA-256 do arquivo no certificado PDF (leitura rápida da integridade sem decifrar o hash impresso) e corrige a geração do ZIP ("Transferir tudo") para incluir os certificados, além de alinhar o título do PDF à finalidade de autenticidade.

### Implementado
- `CertificateService` (`backend/src/certificate/certificate.service.ts`)
  - **QR Code**: gera o QR com conteúdo `SHA-256: {originalHash}` via `qrcode` (`QRCode.toBuffer`, 200px, margin 2, centralizado, 70x70pt) posicionado entre os eventos e o rodapé.
  - **Título do PDF**: alterado de "Certificado de assinaturas" para **"Certificado de Autenticidade"** (tanto no PDF quanto no metadata `info.Title`).
  - Legenda sob a data de geração: **"Horário oficial de Brasília (UTC−3)"** (reforço do fuso já aplicado em v1.2.3).
- `ShareArchiveService.getFileZip()` (`backend/src/share/share-archive.service.ts`)
  - **BUG-FIX**: o ZIP do share era gerado apenas com as rows `File` do banco — os certificados (`*.certificado.pdf`), cujo `id` da row não corresponde ao caminho no disco (`{originalFileId}.certificado.pdf`), ficavam **fora do archive.zip**. Agora o serviço lista o diretório do share (`listDirectory`), detecta os PDFs de certificado, soma seus tamanhos à proteção contra zip-bomb (limite de arquivos/bytes) e os anexa com nome amigável `<nomeDoVideo>.certificado.pdf`.
- `ShareService.complete()` — mensagem de erro de zip ajustada (PT-BR).
- `docs/MANUAL.md` — limpeza de conteúdo (removidas seções duplicadas de PowerShell; mantido o manual de limpeza do Docker).

### Correções de CI (PR `fix/...`)
- Backend: mock de `listDirectory` adicionado ao `ShareArchiveService` nos testes (18 suites, **208 testes** verdes).
- E2E: filtro `hasNotText(".certificado.pdf")` na listagem pública para evitar `strict mode violation` no teste de download individual.
- Frontend: adicionado `@types/uuid` (build do Next.js falhava com "Cannot find module 'uuid'").
- GitHub Actions: `actions/checkout@v4→v5`, `actions/setup-node@v4→v6`, `actions/upload-artifact@v4→v5` — elimina o warning de deprecação do Node.js 20 (remoção marcada para 16/09/2026).

### Validado
- Backend: 18 suites / **208 testes** verdes; lint ✅; build ✅.
- Frontend: 14 testes (vitest) verdes; lint ✅; build ✅.
- E2E Playwright: suíte completa verde (6 testes) — inclui download individual com o certificado na listagem.
- ZIP do share com 1 vídeo + 1 certificado: archive.zip contém ambos os arquivos, com o PDF nomeado `<video>.certificado.pdf`.

### Commits
- `eb2a24d` — `correção autenticidade` (título + zip com certificados)
- `d0e5522` — `QRcode` (QR Code SHA-256 no PDF)
- `c23c552` — `fix(ci): corrige falhas em testes, build frontend e E2E`
- `d62d7de` — `ci: atualiza actions para rodar em Node 24`

---

## v1.0 — Auditoria de Prontidão para Produção (2026-08-10)

### Resumo
Auditoria completa do estado atual do Controle Share Videos v1.0 (fork de Pingvin Share) validada para ir para produção **com condições**, nota geral **7.5/10**.

### Estado Técnico Atual

#### ✅ Funcionalidades Validadas
- Backend NestJS 11 + Prisma 6 + SQLite com 10 models validados
- JWT com rotação híbrida (kid + timeline + mutex + AES-256-GCM)
- Guards globais fail-closed: ThrottlerGuard, JwtGuard, RolesGuard, PasswordMustChangeGuard
- RBAC fino com 3 papéis (`admin`, `auditor`, `operador`) e decorators semânticos
- Frontend Next.js 16 + Mantine 9 com middleware jose para JWT
- Upload concorrente limitado (QAL-06: UPLOAD_CONCURRENCY=3)
- Decomposição ShareService (R05 ✅): ShareMapper + ShareArchiveService + FileStorageService
- ConfigService tipado (R06 ✅): ConfigTypeMap elimina `any`
- Jobs com batching (R04 ✅)
- Docker multi-stage (8 stages, non-root UID 1002, node:24-alpine)
- Caddy reverse proxy com TLS, HSTS, filtro `pwd=`
- CI/CD GitHub Actions com deploy SSH + scripts de backup/hardening
- Observabilidade: Prometheus + Grafana + Loki
- `pnpm audit` limpo (0 CVE)

#### ⚠️ Pendências (com plano de remediação em v1.1)
- **D02**: Sem testes E2E — **Resolvido (H-04)**: Playwright integrado ao CI
- **D05**: Backup sem restore test automatizado — **Resolvido (H-02)**: criado `scripts/restore-test.sh` (restaura backup mais recente em DB temporário, valida integrity_check + schema + counts), procedimento e cron documentados em `docs/operacional/BACKUP_RESTORE.md`

#### ✅ Correções v1.1 executadas (2026-08-11/12)
- **S-05/D04**: CSP header adicionado no Caddy (H-01) — validado com `caddy validate`
- **D03**: Branch `fix/producao-v1.1.0` verificada (100% mergeada em main) e removida do remoto (H-03)
- **R02**: `IUploadRepository` extraída — camada `backend/src/storage/` com `FilesystemUploadRepository`; `LocalFileService`, `ShareArchiveService`, `JobsService` e `FileStorageService` agora injetam a interface (sem `fs`/`SHARE_DIRECTORY` direto)
- **R01**: `AuthService` decomposto em `LoginService`, `TokenService`, `RefreshService` e `VerificationService` (`backend/src/auth/service/`); AuthService virou orquestrador fino e `AuthTotpService` passou a injetar os services isolados. 4 specs novos (+31 testes, 109→140). Sem regressão (build, lint, unit e e2e verdes)
- **D02**: Playwright E2E integrado ao CI (H-04) — job `e2e` no ci.yml boota backend/frontend de teste, instala chromium e roda a suíte (`e2e/`); deploy depende do job E2E
- **S-01**: Docker Secrets aplicado a todos os serviços (backend, frontend, caddy, grafana) — nenhum `env_file` remanescente
- **S-06**: `rate_limit` no Caddyfile.prod — zona `dynamic` (100 req/10s) + zona `auth` (10 req/60s)
- **H-02**: `scripts/restore-test.sh` criado (restore test automatizado, D05) — valida backup mais recente em DB temporário (GPG/assinatura/gzip, integrity_check, schema e counts); documentação em `docs/operacional/BACKUP_RESTORE.md`
- **Docs v1.1**: `docs/operacional/DEPLOY.md`, `MONITORAMENTO.md`, `RUNBOOKS.md` criados; `BACKUP_RESTORE.md` revisado; `README.md` hardenado (referências corrigidas, seção Segurança/Limitações) — fecha item "Docs operacional + README hardening" do ROADMAP

#### 📋 Limitações Aceitas
- **A-06/D01**: SQLite em produção (single-writer, sem replica) — Aceito com monitoramento Prometheus + ROADMAP PostgreSQL em v1.3

### Histórico Git (Commits Relevantes)
- `6a29928` — 13 correções documentadas
- `973bdc1` — QAL-06 (concorrência upload + modais decompostos)
- `6c84d71` — Rotação JWT híbrida
- `4c81acc` — Monitoramento Prometheus/Grafana/Loki
- `31221f2` — CI/CD deploy SSH

### Refatorações Concluídas
- ✅ R01 — Decompor AuthService (`LoginService`/`TokenService`/`RefreshService`/`VerificationService`)
- ✅ R02 — Extrair UploadRepository (`IUploadRepository` + `FilesystemUploadRepository`)
- ✅ R03 — Tipagem de controllers
- ✅ R04 — Batching de jobs
- ✅ R05 — Decomposição ShareService
- ✅ R06 — ConfigService tipado

### Refatorações Pendentes
- (nenhuma — R01..R06 concluídas)

### Artefatos gerados nesta auditoria (13/13)
1. ✅ DISCOVERY.md
2. ✅ ARCHITECTURE_REVIEW.md
3. ✅ SECURITY_REPORT.md
4. ✅ PERFORMANCE_REPORT.md
5. ✅ TECH_DEBT.md
6. ✅ REFACTORING_PLAN.md
7. ✅ ROADMAP.md
8. ✅ DEPENDENCY_AUDIT.md
9. ✅ TEST_PLAN.md
10. ✅ AUDIT_MATRIX.md
11. ✅ EVIDENCE_INDEX.md
12. ✅ CHANGELOG.md (este)
13. ✅ AUDIT_REPORT.md (consolidador)

### Decisões de Auditoria
- Não comparar com baseline anterior (decisão explícita do usuário)
- Foco em validar estado atual para produção
- Pendências não bloqueiam go-live desde que explicitamente aceitas com plano de remediação v1.1

---

*Fim do CHANGELOG.md*
