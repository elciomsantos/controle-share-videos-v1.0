# Controle Share Videos

Sistema de compartilhamento seguro de arquivos para uso interno restrito, em PT-BR. Fork independente do Pingvin Share X v1.21.1, adaptado para upload exclusivamente pelo dono autenticado e armazenamento apenas local (servidor Ubuntu).

> **Documentação:** ver `docs/Visao-geral.md` (visão arquitetural) e `docs/Padronizacao.md` (programa de padronização — 11 temas).

## Funcionalidades

### Compartilhamento

- Compartilhamento via link com token UUID v4
- Tamanho de arquivo ilimitado (restrito apenas pelo espaço em disco)
- Data de expiração configurável por share
- Shares protegidos por senha + limite de visitantes e downloads
- **Geração automática de senha forte** (comprimento configurável via `share.generatedPasswordLength`) exibida separadamente no modal de upload completado
- Limites por share: máximo de visualizações, máximo de downloads, expiração
- Página exclusiva de visualização por link (sem cabeçalho/rodapé do painel admin)
- Destinatários de e-mail (smtp opcional)

### Upload e armazenamento

- Upload apenas pelo dono autenticado (sem reverse shares — removido intencionalmente)
- Armazenamento **exclusivamente local** no servidor (sem buckets S3 — removido)
- Upload chunked multipart com progresso e retomada
- Integração opcional com **ClamAV** para varredura antivírus (Decidido — `docs/Padronizacao-07-clamav.md`)

### Auditoria

- Log completo de views e downloads (IP, user-agent, timestamp, sucesso/falha)
- Dashboard admin em `/admin/download-logs` com filtros (shareId, usuário, evento, período, status) e paginação
- Eventos auditados: `view` (acesso via link) e `download` (arquivo único ou ZIP), incluindo tentativas com falha

### Usuários e permissões (RBAC)

- Controle de acesso por papéis: `admin` / `operador` / `auditor`
- Apenas `admin` cria usuários via `POST /api/users` escolhendo o papel
- Senha temporária forte (12 chars) exibida uma única vez no modal, ou enviada por e-mail se SMTP habilitado
- **Troca obrigatória de senha no primeiro login** (`passwordMustChange` + Guard)
- Detecção de usuário duplicado com inline field error + debounce pre-validation (admin/signup) — `docs/Padronizacao-11-usuario-duplicado.md`

### UX de erro (Tema 10 — `docs/Padronizacao-10-popups-erro.md`)

- **Inline field error** — credenciais inválidas no login, link em uso na criação do share
- **Modal bloqueante** — conta não ativada (com botão "Reenviar verificação"), rate-limit 429 com countdown lendo header `Retry-After`, falha de servidor/rede, `completeShare` 500 (Tentar novamente / Descartar), erro de rede em `isShareIdAvailable`
- **Toast persistente agrupado** — falha de chunks ("Falha ao enviar N. Toque para detalhes") com ID fixo, sem `cleanNotifications()` global
- Helper reutilizável `showBlockingErrorModal` em `frontend/src/components/core/`
- Lacunas i18n corrigidas (PT-BR em `common.error.unknown`, `verify.*`, `signin.*`, `upload.dropzone.description`, `share.notify.copy-*`)

### Outros

- PWA (Service Worker via Serwist, instalação offline-first)
- Painel administrativo (shares, usuários, logs, configurações, saúde do sistema)
- Configuração persistida no banco (categorias: general, appearance, share, cache, email, smtp, legal)
- Healthcheck em `/api/health`, Swagger em `/api/swagger` (dev only)
- Cron jobs de limpeza (shares expirados, arquivos temporários, tokens, usuários não ativados)
- PT-BR como único idioma ativo

## Setup

### Instalação com Docker (recomendado)

1. Baixe o arquivo `docker-compose.yml`
2. Execute `docker compose up -d`

O sistema estará disponível em `http://localhost:3000`.

### Setup manual (desenvolvimento)

#### Backend

1. Entre na pasta `backend`
2. Instale as dependências com `npm install`
3. Aplique o schema ao banco com `npx prisma db push`
4. Popule o banco com `npx prisma db seed`
5. Inicie o backend com `npm run dev`

#### Frontend

1. Inicie o backend primeiro
2. Entre na pasta `frontend`
3. Instale as dependências com `npm install` (use `--legacy-peer-deps` em instalação limpa — ver `docs/Padronizacao.md` §8.3)
4. Inicie o frontend com `npm run dev`

Pronto!

#### Lint e build

- `npm run lint` (em cada workspace: `backend` e `frontend`)
- `npm run build` (em cada workspace)
- Observação: o Prisma Client precisa ser regenerado após mudanças no `schema.prisma` (`npx prisma generate` no `backend`)

#### Testes

No momento existem apenas testes de sistema para o backend. Para rodá-los, execute `npm run test:system` na pasta `backend`.

## Documentação

- `docs/Visao-geral.md` — visão arquitetural completa
- `docs/Padronizacao.md` — programa de padronização (11 temas), com links para documentos específicos por tema
- `docs/Padronizacao-02-link-seguro.md` — link seguro com geração automática de senha
- `docs/Padronizacao-03-auditoria-logs.md` — auditoria e logs de vídeo
- `docs/Padronizacao-04-usuarios-permissoes.md` — gestão de usuários e RBAC
- `docs/Padronizacao-05-limite-tamanho.md` — limite de tamanho via painel admin
- `docs/Padronizacao-07-clamav.md` — integração ClamAV (Decidido, código pendente)
- `docs/Padronizacao-10-popups-erro.md` — popups de erro em três camadas
- `docs/Padronizacao-11-usuario-duplicado.md` — detecção de usuário duplicado



# Setup teste em desenvolvimento

- docker compose -f docker-compose.local.yml down
- rm data/controle-videos.db
- docker compose -f docker-compose.local.yml up -d --build

docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml up --build -d

docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d


docker compose up --build -d

Acesso:  http://localhost:3000
