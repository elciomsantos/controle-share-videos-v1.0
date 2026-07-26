# Padronização — Programa Completo

> **Sistema de Compartilhamento Seguro de Arquivos — Controle Share Videos**
> Documento de decisão de padronização — programa 11 temas

**Versão:** 2.2.0
**Data:** 2026-07-25
**Status:** Em andamento — Temas 1–5, 10 e 11 executados, 7 documentado, 8/9 pendentes
**Branch de trabalho:** `main`

---

## 1. Contexto

O `Controle Share Videos` (fork independente do Pingvin Share X v1.21.1) herda do upstream duas funcionalidades que não fazem sentido para o uso interno restrito a que o sistema se destina:

1. **Reverse Shares** — links públicos para terceiros (sem conta) enviarem arquivos ao dono do link.
2. **Armazenamento S3** — provider de storage compatível com AWS S3 / MinIO / Cloudflare R2.

A `docs/Visao-geral.md` v2.0.0 já sinalizava, em notas entre parênteses, a intenção de remover essas funções:

> *Reverse shares — links de upload reverso para terceiros enviarem arquivos ao dono (Remover esta função videos seram carregado somente pelo dono e disponibilizado via link com senha limite de visualização e donwlouds)*
>
> *Suporte a armazenamento S3 (AWS, MinIO, R2, etc.) além do sistema de arquivos local (Armazenamento somente local em servidor ubuntu server drive D:)*

Este documento formaliza a decisão como passo **3** de um programa mais amplo de padronização (itens 1–9 listados no final deste arquivo). A remoção de Reverse Shares + S3 é o tema **1** do programa.

---

## 2. Decisão

### 2.1 Remover Reverse Shares

**Motivo:** o sistema passa a ter upload exclusivamente pelo dono do share (operador/admin). Videos são carregados pelo dono e disponibilizados via link com senha, limite de visualização e limite de downloads. Não há cenário de uso interno que justifique que terceiros sem conta enviem arquivos ao dono.

**Alcance da remoção (a executar em fase de código):**

| Camada | Ação |
|--------|------|
| Backend | Apagar `backend/src/reverseShare/` (controller, service, module, dto, guards). |
| Backend | Remover dependências em `share.service.ts`, `share.controller.ts`, `share.module.ts`, `share/guard/createShare.guard.ts`, `share/guard/shareSecurity.guard.ts`. |
| Backend | Remover cookie `reverse_share_token` em controller/share. |
| Backend | Remover e-mail `sendMailToReverseShareCreator` em `email.service.ts` + template i18n `pt-BR`. |
| Backend | Remover cron `deleteExpiredReverseShares` em `jobs.service.ts`. |
| Backend | Remover categorias/keys de config relacionadas (se houver) em `config.seed.ts`. |
| Schema | No `schema.prisma`: remover model `ReverseShare`; remover coluna `Share.reverseShareId` + FK. |
| Schema | Criar **nova migration Prisma** (drop) preservando o histórico de migrations existente. |
| Frontend | Apagar `frontend/src/pages/upload/[token]/` (página de upload via reverse share). |
| Frontend | Apagar `frontend/src/pages/account/reverseShares*` e componentes associados. |
| Frontend | Remover `showCreateReverseShareModal` e afins. |
| Frontend | Remover entradas de menu/links para reverse shares. |
| i18n | Apagar chaves `reverseShare.*` em `backend/src/i18n/pt-BR/` e `frontend/src/i18n/translations/pt-BR.ts`. |

### 2.2 Remover S3 (storage provider)

**Motivo:** o armazenamento passa a ser **exclusivamente local** no servidor Ubuntu (drive D: — caminho configurável via `SHARE_DIRECTORY`), montado no volume `./data/` do container. Sem necessidade de buckets externos, mantendo soberania dos dados e operação em rede isolada (air-gapped).

**Alcance da remoção (a executar em fase de código):**

| Camada | Ação |
|--------|------|
| Backend | Apagar `backend/src/file/s3.service.ts`. |
| Backend | Refatorar `backend/src/file/file.service.ts` e `file.module.ts` para manter apenas `LocalFileService`. |
| Backend | Ajustar `share.service.ts`: `storageProvider` passa a ser sempre `"LOCAL"` (remover ternário `s3.enabled ? "S3" : "LOCAL"`). |
| Backend | Ajustar `clamscan.service.ts`: remover branch `storageProvider === "S3"` (mantém apenas branch local). |
| Backend | Ajustar `system.service.ts`: remover `if (this.configService.get("s3.enabled"))`. |
| Backend | Desinstalar dependência `@aws-sdk/client-s3` do `backend/package.json`. |
| Schema/Seed | Remover a categoria `s3` de `backend/prisma/seed/config.seed.ts` (~30 chaves). |
| Schema/Seed | Criar nova migration Prisma que remove as chaves de `s3.*` da tabela `Config` (via seed `migrateConfigVariables`) — sem alterar schema relacional. |
| Docker | Verificar `docker-compose*.yml`: remover volumes/vars relacionados a S3 (se houver). |
| Variáveis | Remover `S3_*` das tabelas de environment nos docs e de `config.example.yaml`. |

### 2.3 Política de banco de dados

**Decisão:** criar **nova migration Prisma** que dropa a tabela `ReverseShare` e a coluna `Share.reverseShareId` (com FK). Histórico de migrations existente é preservado. Em banco com dados de produção, recomenda-se backup do `data/controle-videos.db` antes de aplicar.

---

## 3. Impacto esperado (após execução no código)

| Dimensão | Antes | Depois |
|-----------|-------|--------|
| Modelos Prisma | 11 (incluindo `ReverseShare`) | 10 |
| Tabelas no banco | Com `ReverseShare` | Sem `ReverseShare` |
| Coluna `Share.reverseShareId` | Existente (FK cascade) | Removida |
| Features de upload | Upload do dono + reverse share (público) | Apenas upload do dono (autenticado) |
| Providers de storage | Local + S3 | Apenas Local |
| Deps backend afetadas | `@aws-sdk/client-s3` | Removida |
| Cron jobs | `deleteExpiredReverseShares` ativo | Removido |
| Páginas frontend | `/upload/[token]`, `/account/reverseShares` | Removidas |
| Endpoints API afetados | `POST/GET/DELETE /api/reverseShares`, `GET /api/reverseShares/:token` | Removidos |
| Categoria de config | `s3.*` (~30 chaves), possíveis keys de reverse share | Removidas |

---

## 4. Validação (critério de aceite para a fase de código)

Após executar a remoção no código, o sistema deve passar em:

- [x] `npm run lint` em backend e frontend → 0 erros, 0 warnings.
- [x] `tsc --noEmit` em backend → 0 erros.
- [ ] `tsc --noEmit` em frontend → 2 erros preexistentes (TS2307 markdown-to-jsx, TS2305 dayjs — ver §8.1, §8.2).
- [ ] `npm audit` em backend e frontend → 15 + 11 vulns preexistentes (ver §8.6).
- [x] `docker compose -f docker-compose.local.yml up -d --build` → container healthy.
- [x] `GET /api/health` → 200.
- [x] `POST /api/auth/signUp` → 201 (primeiro usuário, isAdmin: true).
- [x] `POST /api/shares` (criar share autenticado) → 201.
- [ ] `POST /api/shares/:shareId/files` (upload chunk) → 200 com gravação local em `data/`.
- [ ] `POST /api/shares/:shareId/complete` → 200.
- [ ] `GET /api/shares/:shareId/files/zip` → 200 (download).
- [x] `GET /api/reverseShares` → 404 (endpoint removido).
- [x] `GET /api/configs/admin/s3` → 200 com array vazio (sem configs da categoria s3).
- [x] Página `/upload/[token]` qualquer → 404.
- [x] Página `/account/reverseShares` → 307 redirect para signIn (protegida, rota não existe).
- [x] Schema Prisma sem `ReverseShare` e sem `Share.reverseShareId`.
- [x] Migration apply (`prisma migrate deploy`) ✅ sem erros.

---

## 5. Documentação afetada (passo: documentação primeiro)

Documento-alvo | Ação
---|---
`docs/Visao-geral.md` | Atualizado para refletir remoção de reverse shares + S3, e armazenamento only-local em servidor Ubuntu (drive D:).
`README.md` | Removidas as duas linhas (Reverse shares; Different file providers: local storage and S3).
`docs/Analise-sistema.md` | Adicionada nota no topo apontando para este `Padronizacao.md` (conteúdo histórico preservado).
`docs/EVOLUCAO.md` | **Preservado** como registro histórico.
`docs/Achados-pos-evolucao.md` | **Preservado** como registro histórico.

---

## 6. Programa de padronização (itens 1–10)

A padronização documental contempla os seguintes temas, derivados das notas entre parênteses na `Visao-geral.md` v2.0.0:

| # | Tema | Status |
|---|------|--------|
| 1 | Remoção de Reverse Shares + S3 (este documento) | Executado — commit `f4a9842` |
| 2 | Compartilhamento por link seguro (geração automática de senha + link, limites de views/downloads, tela exclusiva de visualização) | Executado — commits `191ea0a`, `d798d9d`; ver `Padronizacao-02-link-seguro.md` |
| 3 | Auditoria e logs de vídeo (tamanho, datas, usuário IP/data/hora) | Executado — commit `ec971dc`; ver `Padronizacao-03-auditoria-logs.md` |
| 4 | Gestão de usuários e permissões (admin cria usuários; troca de senha no primeiro acesso) | Executado — commit `d798d9d`; ver `Padronizacao-04-usuarios-permissoes.md` |
| 5 | Limite de tamanho de arquivo via painel administrativo | Executado — sem mudança de código; ver `Padronizacao-05-limite-tamanho.md` |
| 6 | Tela exclusiva de visualização por link (sem tela inicial) | Coberto pelo Tema 2 — ver `Padronizacao-02-link-seguro.md` §3.3 |
| 7 | Integração ClamAV (daemon compose, toggle admin, i18n, status endpoint, bloquear download se scan pendente) | Decidido — ver `Padronizacao-07-clamav.md`; código pendente |
| 8 | Refino do documento `Visao-geral.md` como um todo | Pendente |
| 9 | Atualização final de README | Pendente |
| 10| Popups de erro — login (credenciais, conta não ativada, 429, 500/rede) e upload (completeShare, chunk, isShareIdAvailable); helper `showBlockingErrorModal`; correção de i18n ausente | Executado — commit `9e53ff9`; ver `Padronizacao-10-popups-erro.md` |
| 11| Usuário duplicado — contrato de erro `field` no backend, inline field error, debounce pre-validation (admin), i18n nova | Executado — commit `0caba85`; ver `Padronizacao-11-usuario-duplicado.md` |


Cada tema terá seu próprio documento de decisão (em `docs/Padronizacao-XX-*.md`) ou seção única consolidada, conforme evacuação.

---

## 7. Referências (código)

Pontos do código onde a remoção precisará atuar (levantamento inicial — pode haver pontos adicionais durante a execução):

- `backend/src/reverseShare/` — todo o diretório.
- `backend/src/share/share.service.ts` — imports e métodos `create()`, `complete()`, notificação reverse share.
- `backend/src/share/share.controller.ts` — cookies `reverse_share_token`.
- `backend/src/share/share.module.ts` — import `ReverseShareModule`.
- `backend/src/share/guard/createShare.guard.ts` — validação de reverse share token.
- `backend/src/share/guard/shareSecurity.guard.ts` — regras de `share.reverseShare`.
- `backend/src/file/s3.service.ts` — todo o arquivo.
- `backend/src/file/file.service.ts` — Branch S3.
- `backend/src/file/file.module.ts` — providers `S3FileService`.
- `backend/src/clamscan/clamscan.service.ts` — branch `S3`.
- `backend/src/system/system.service.ts` — `if (this.configService.get("s3.enabled"))`.
- `backend/src/jobs/jobs.service.ts` — `deleteExpiredReverseShares`.
- `backend/prisma/schema.prisma` — model `ReverseShare`, `Share.reverseShareId`.
- `backend/prisma/seed/config.seed.ts` — categoria `s3`.
- `backend/prisma/migrations/20241218145829_add_s3_support/migration.sql` — referência histórica (não remover).
- `backend/package.json` — dependência `@aws-sdk/client-s3`.
- `frontend/src/pages/upload/[token]/` — página de reverse share.
- `frontend/src/pages/account/reverseShares*` — lista de reverse shares.
- `frontend/src/components/share/modals/showCreateReverseShareModal.tsx` — modal de criação.
- `frontend/src/components/upload/modals/showCreateUploadModal.tsx` — referências.
- `frontend/src/i18n/translations/pt-BR.ts` — chaves `reverseShare.*` e `s3.*`.
- `backend/src/i18n/pt-BR/*.json` — chaves `reverseShare.*` e `file.s3*`.
- `config.example.yaml` — variáveis `S3_*`.
- `docker-compose*.yml` — volumes/vars relacionados a S3 (verificar).

---

## 8. Erros e inconsistências encontrados durante a execução do Tema 1

Erros abaixo foram encontrados durante a implementação e validação do Tema 1. Não são causados pela remoção Reverse Shares + S3, mas foram documentados aqui para correção futura.

### 8.1 — Frontend: módulo `markdown-to-jsx/react` não encontrado (TS2307)

**Arquivo:** `frontend/src/components/admin/card/CardTitle.tsx:1`
**Erro:** `Cannot find module 'markdown-to-jsx/react' or its corresponding type declarations.`
**Causa:** Provável incompatibilidade de peer dependency do pacote `markdown-to-jsx` com React 19. O `import ... from "markdown-to-jsx/react"` não resolve.
**Impacto:** `tsc --noEmit` retorna erro TS2307, mas `next build` ignora e compila normalmente (turbopack).
**Reprodução:** `cd frontend && npx tsc --noEmit 2>&1 | grep TS2307`
**Gravidade:** Média — build passa, mas lint/typeserver ficam com erro.

### 8.2 — Frontend: `dayjs` ausente no `node_modules` após instalação limpa

**Arquivo:** `frontend/src/components/account/AccountActivity.tsx:2`
**Erro:** `Module '"dayjs"' has no exported member 'Dayjs'.` — `dayjs` não instalado automaticamente.
**Causa:** `dayjs` não está no `package.json` do frontend; é dependência transitiva que o npm não instala por padrão.
**Impacto:** `tsc --noEmit` retorna erro TS2305. Build passa porque next importa em runtime.
**Correção temporária:** `npm install dayjs` manual no diretório `frontend/`.
**Gravidade:** Média — precisa de干预 manual a cada instalação limpa.

### 8.3 — Frontend: falha `npm install` sem `--legacy-peer-deps`

**Erro:** `npm ERR! code ERESOLVE` — conflito de peer dependencies (React 19 vs dependências que pedem React 17/18).
**Impacto:** `npm install` falha sem flag `--legacy-peer-deps`.
**Correção temporária:** `npm install --legacy-peer-deps`
**Gravidade:** Média — qualquer CI/CD ou instalação limpa precisa da flag.

### 8.4 — Seed não define valores default para configs existentes

**Cenário:** Ao rodar `docker compose up` com banco vazio, a seed apaga configs obsoletos (s3, reverseShare) mas **não define** `share.allowRegistration = "true"` nem `email.enableEmailVerification = "false"` para configs já existentes.
**Impacto:** `POST /api/auth/signUp` retorna 400 "Um usuário com este field já existe" mesmo com 0 users no banco, porque `allowRegistration` é `null`.
**Correção:** `config.seed.ts` precisa de lógica que, ao detectar configs com valor `null`, defina o default correto (ex: `upsert` com `defaultValue`).
**Gravidade:** Alta — bloqueia cadastro de novos usuários em instalação limpa.

### 8.5 — Formato de `expiration` no `POST /api/shares` não documentado

**Endpoint:** `POST /api/shares`
**Erro:** `{"message":"Data de expiração inválida"}` ao enviar strings como `"1 day"`, `"-1days"`, `"1"`.
**Causa:** O `ShareCompleteDto` espera formato específico (ex: `"never"` ou timestamp ISO). Valores arbitrários não são aceitos.
**Impacto:** Impossível criar share via API sem saber o formato exato. Não há documentação no swagger.
**Gravidade:** Média — funcional, mas opaco para uso via API.

### 8.6 — Vulnerabilidades npm preexistentes

**Backend:** 15 vulnerabilidades (1 low, 10 moderate, 4 high) — incluindo valibot (Prisma 7) e undici ( NestJS internals).
**Frontend:** 11 vulnerabilidades (11 high) — incluindo minimatch (dev dep), next, cookies-next.
**Causa:** Pré-existentes ao Tema 1, não introduzidas pela remoção.
**Gravidade:** Alta — require ação dedicada (upgrade dependências ou patch).

### 8.7 — Docker: container com DB stale de execução anterior

**Cenário:** Ao rodar `docker compose up` com um banco `.db` de execução anterior, a seed e migrations podem conflitar (tabela `ReverseShare` já removida no código mas presente no DB).
**Impacto:** Container healthy mas funcionalidade comprometida. É necessário `docker compose down` + apagar `data/*.db` manualmente antes de reiniciar.
**Gravidade:** Baixa — esperado em dev, mas deve ser documentado no README de setup.

---

*Documento gerado em 2026-07-25 — maintainer do projeto.*
