# 01 - Visão Geral do Projeto

> **Sistema de Compartilhamento Seguro de Arquivos — Controle Share Videos**
> Documento de Arquitetura - Capítulo 01

**Versão:** 2.0.0
**Status:** Em Produção (Docker)
**Base histórica:** Fork independente do Pingvin Share X v1.21.1, renomeado e adaptado para uso interno restrito PT-BR

---

# 1. Introdução

## 1.1 Objetivo

Este documento apresenta a visão geral do **Controle Share Videos**, descrevendo seus objetivos, escopo, arquitetura, tecnologias empregadas, requisitos de infraestrutura e princípios de funcionamento.

Seu propósito é fornecer uma compreensão ampla do projeto para desenvolvedores, administradores de sistemas, analistas e demais envolvidos no ciclo de vida da aplicação.

---

# 2. Objetivo do Sistema

O sistema tem como finalidade gerenciar e compartilhar **arquivos de qualquer tipo** (não apenas vídeos) armazenados localmente no servidor ou em bucket S3 compatível, permitindo a distribuição controlada por meio de links seguros com autenticação, expiração, limites de download e senha.

Todo o gerenciamento é centralizado em uma interface web administrativa desenvolvida em **Next.js 16 (React 19) + Mantine 9**, consumindo API REST construída com **NestJS 11 (Node.js 24 + TypeScript 6)**.

O sistema garante:

* Segurança no compartilhamento (JWT + Argon2id + TOTP opcional)
* Controle de acesso granular por share (público, senha, expiração, limite de views/downloads)
* Registro completo de auditoria (download logs com usuário/IP/timestamp)
* Upload nativo via navegador (chunked, multipart, resumível)
* **Reverse shares** — links de upload reverso para terceiros enviarem arquivos ao dono
* Integração opcional com **ClamAV** para varredura antivírus
* Suporte a **armazenamento S3** (AWS, MinIO, R2, etc.) além do sistema de arquivos local
* Facilidade de administração via painel web
* Escalabilidade horizontal via containers Docker
* Alta disponibilidade com healthchecks e restart automático
* Facilidade de manutenção (logs estruturados, migrações Prisma, seed idempotente)

---

# 3. Problema a Ser Resolvido

Em muitos ambientes corporativos existe a necessidade de compartilhar arquivos de grande porte sem utilizar serviços externos de armazenamento em nuvem, mantendo soberania dos dados e conformidade com políticas internas.

As principais dificuldades observadas são:

* Compartilhamento manual e inseguro de arquivos (e-mail, pendrive, links públicos)
* Duplicação desnecessária de arquivos entre usuários
* Ausência de controle de acesso e rastreabilidade
* Falta de expiração automática e limites de download
* Ausência de auditoria de quem baixou o quê e quando
* Dificuldade de receber arquivos de terceiros sem conta no sistema
* Necessidade de varredura antivírus em arquivos recebidos

O sistema proposto resolve esses problemas centralizando o gerenciamento, automatizando a segurança e fornecendo trilha de auditoria completa.

---

# 4. Escopo do Projeto

O sistema é responsável por:

* **Upload de arquivos** via navegador (chunked, multipart, com progresso e retomada)
* **Criação de shares** com token UUID, senha opcional, expiração, limite de views/downloads
* **Reverse shares** — geração de tokens públicos para terceiros fazerem upload direto
* **Download** individual ou em ZIP (streaming, sem carregar tudo em memória)
* **Validações de segurança** em cada acesso (token, senha, expiração, limites, owner)
* **Registro de auditoria** (DownloadLog: usuário, IP, timestamp, share, arquivo)
* **Varredura ClamAV** assíncrona ao finalizar upload (opcional, auto-detectada)
* **Gerenciamento de usuários** (admin cria, usuário self-service: perfil, senha, TOTP)
* **Autenticação** local (usuário/senha + Argon2id) + JWT access/refresh + TOTP opcional
* **Configuração via painel** (YAML persistido no banco, categorias: general, appearance, share, cache, email, smtp, ldap, oauth, s3, legal, initUser)
* **Painel administrativo** (shares, usuários, logs, configurações, saúde do sistema)
* **Internacionalização** PT-BR (único idioma ativo, infra i18n mantida)
* **PWA** (Service Worker via Serwist, instalação offline-first)
* **Monitoramento de saúde** (`/api/health`, `/api/system/info` admin)
* **Limpeza automática** via cron jobs (shares expirados, arquivos temporários, tokens, usuários não ativados)

---

# 5. Fora do Escopo

As funcionalidades abaixo **não** fazem parte desta versão:

* Conversão/transcoding de vídeos
* Streaming de mídia adaptativo (HLS/DASH)
* Edição de vídeou/áudio
* Compressão automática de arquivos
* Integração com serviços de armazenamento em nuvem **além de S3 compatível**
* Reprodução online de vídeo no navegador (player nativo do browser apenas)
* Compartilhamento público sem autenticação (todo acesso exige token válido)
* LDAP/OAuth/Social login (removidos intencionalmente — apenas auth local)
* Telemetria, update checkers, chamadas de rede externas não configuradas

Essas funcionalidades poderão ser consideradas em versões futuras mediante demanda.

---

# 6. Público-Alvo

O sistema destina-se aos seguintes perfis de usuários:

## Administrador

Responsável pela configuração geral do sistema e gestão completa.

Permissões:

* Gerenciar usuários (criar, editar, desativar, deletar, resetar senha/TOTP)
* Configurações do sistema (todas as categorias via painel)
* Visualizar e gerenciar **todos** os shares e reverse shares
* Consultar logs de download e auditoria completa
* Emitir relatórios
* Acesso a `/api/system/info` (info de disco, memória, versão, uptime)
* Gerenciar logo/branding, páginas legais (imprint, privacy)

---

## Operador (Usuário Autenticado)

Responsável pelo gerenciamento operacional dos próprios shares.

Permissões:

* Upload de arquivos (direto ou via reverse share recebido)
* Criar, editar, renovar, bloquear, deletar **próprios** shares
* Criar, listar, deletar **próprios** reverse shares
* Consultar histórico de downloads dos próprios shares
* Gerenciar próprio perfil (senha, TOTP, avatar)
* Receber notificações por e-mail (configurável)

---

## Auditor

Responsável pela fiscalização e acompanhamento das operações (acesso somente leitura administrativo).

Permissões:

* Consultar logs de download completos
* Consultar auditoria de acessos
* Emitir relatórios de compliance
* Acompanhar estatísticas de uso (sem poder alterar)

---

# 7. Tecnologias Utilizadas

## Backend

* **NestJS 11** (Node.js 24 LTS, TypeScript 6 strict)
* **Prisma ORM 7** com adapter `@prisma/adapter-better-sqlite3`
* **@nestjs/passport** + `passport-jwt` + `passport-local` (estratégias JWT access/refresh + local)
* **Argon2id** (`argon2@0.45.1`) para hash de senhas (memoryCost=128MB, timeCost=4, parallelism=2)
* **TOTP** via `otplib@13.3.0` + `qrcode-svg` (2FA opcional por usuário)
* **@nestjs/jwt** para tokens assinados (RS256/HS256 configurável)
* **@nestjs/throttler** rate limiting (default 100 req/60s global, 5/60s login)
* **@nestjs/cache-manager** + `@keyv/redis` + `cacheable` (Redis opcional)
* **@nestjs/schedule** cron jobs (limpeza automática)
* **@nestjs/swagger** documentação OpenAPI em `/api/swagger` (dev only, gated)
* **Helmet** + CSP/COEP/COOP custom + Permissions-Policy headers
* **CORS** configurável via `CORS_ORIGIN` (credentials: true)
* **Cookie-parser** (HttpOnly, Secure, SameSite=lax)
* **ValidationPipe** global com `class-validator` + `nestjs-i18n` (mensagens PT-BR)
* **ClamAV** via `clamscan@2.4.0` (host/port via env `CLAMAV_HOST`/`CLAMAV_PORT`, auto-detect on boot)
* **AWS S3 SDK v3** (`@aws-sdk/client-s3`) para storage provider S3
* **Nodemailer** emails transacionais (SMTP configurável, templates PT-BR)
* **Sharp** processamento de imagens (thumbnails, validação)
* **Archiver** criação de ZIPs para download em lote
* **nanoid** / **uuid** geração de tokens seguros
* **dayjs** manipulação de datas
* **check-disk-space** monitoramento de espaço em disco
* **content-disposition** headers seguros para download

## Frontend

* **Next.js 16** (Pages Router, standalone output, webpack build)
* **React 19** + **React DOM 19**
* **Mantine 9** (core, hooks, form, modals, notifications, dropzone)
* **@mantine/dropzone** upload drag-and-drop com progresso chunked
* **Axios** cliente HTTP com interceptors (auth, refresh token automático)
* **react-intl** i18n (PT-BR único ativo, infra mantida)
* **Serwist 9** (Workbox) — PWA, Service Worker, cache offline
* **jose** + **jwt-decode** manipulação de JWT no cliente
* **yup** validação de formulários (schema shared com backend via types)
* **qrcode** geração de QR codes para shares/TOTP
* **@uiw/react-md-editor** editor Markdown para páginas legais
* **cookies-next** gestão de cookies (SSR + client)
* **file-saver** download de arquivos no browser
* **dayjs** + **react-icons** + **markdown-to-jsx** + **mime-types** + **p-limit**

## Banco de Dados

* **SQLite** (arquivo local `./data/controle-videos.db`) via **better-sqlite3** (padrão)
* **Prisma 7** (schema em `backend/prisma/schema.prisma`, migrations versionadas)
* **Models:** User, RefreshToken, LoginToken, ResetPasswordToken, Share, ReverseShare, ShareRecipient, File, ShareSecurity, Config, DownloadLog (11 models)
* Suporte nativo a **PostgreSQL/MySQL** trocando apenas `datasource provider` e `DATABASE_URL` (Prisma multi-provider)

## Servidor Web / Reverse Proxy

* **Caddy 2** (embutido na imagem Docker final)
* Terminação TLS automática (Let's Encrypt) ou certificado próprio
* Proxy reverso: `/` → Next.js (porta 3333), `/api/*` → NestJS (porta 8080/8090)
* Headers de segurança, compressão, static file serving
* Dois Caddyfiles: `Caddyfile` (padrão) e `Caddyfile.trust-proxy` (quando `TRUST_PROXY=true`)

## Sistema Operacional

* **Alpine Linux** (base `node:24-alpine` no Docker)
* **Ubuntu Server 24.04 LTS** (host recomendado para produção)

## Ferramentas / Ecossistema

* **Docker** multi-stage build (5 stages: frontend-deps, frontend-build, backend-deps, backend-build, runner)
* **Docker Compose** (produção: `docker-compose.yml`; dev local: `docker-compose.local.yml`; ClamAV dev: `docker-compose.dev.yml`)
* **Supervisor** (não usado — Caddy + Node processos diretos no entrypoint)
* **Cron** (via `@nestjs/schedule` no processo Node, não system cron)
* **Composer** (N/A — Node.js usa npm)
* **Git** (versionamento)
* **OpenSSL** (certificados, geração de segredos)
* **ESLint 9** (flat config, por workspace: root, backend, frontend)
* **Prettier** (formatação)
* **TypeScript 6** (strict mode, path aliases)
* **Newman** (testes de API pós-deploy via Postman collection)

---

# 8. Arquitetura Geral

O sistema segue arquitetura **monolítica modular** containerizada, com separação clara de responsabilidades:

```text
┌─────────────────────────────────────────────────────────────────┐
│                        USUÁRIO (Navegador)                       │
│                        PWA (Service Worker)                      │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         CADDY (Porta 3000/443)                   │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐   │
│  │  Static Assets          │  │  Reverse Proxy              │   │
│  │  (Next.js /_next, img)  │  │  /api/* → Backend :8080     │   │
│  │  Service Worker         │  │  /*   → Frontend :3333      │   │
│  └─────────────────────────┘  └─────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────────┐  ┌─────────────────────────────┐
│      FRONTEND (Next.js)     │  │      BACKEND (NestJS)       │
│  Porta 3333 (standalone)    │  │  Porta 8080/8090 (API)      │
│                             │  │                             │
│  Pages Router               │  │  Global Prefix: /api        │
│  React 19 + Mantine 9       │  │  Controllers                │
│  react-intl (PT-BR)         │  │  Services                   │
│  Axios + interceptors       │  │  Repositories (Prisma)      │
│  Serwist SW (PWA)           │  │  Models (Prisma Client)     │
│  Proxy dev (proxy.ts)       │  │  Jobs (@nestjs/schedule)    │
└─────────────────────────────┘  │  Middleware (auth, throttle)│
                                 │  Guards (JWT, Owner, Admin) │
                                 │  Pipes (Validation, i18n)   │
                                 │  Interceptors (serialize)   │
                                 │  Filters (exceptions, i18n) │
                                 └─────────────┬───────────────┘
                                               │
                                               ▼
                                 ┌─────────────────────────────┐
                                 │      PRISMA ORM             │
                                 │  SQLite (better-sqlite3)    │
                                 │  /data/controle-videos.db   │
                                 │  (ou PostgreSQL/MySQL)      │
                                 └─────────────┬───────────────┘
                                               │
                        ┌──────────────────────┼──────────────────────┐
                        ▼                      ▼                      ▼
               ┌───────────────┐      ┌───────────────┐      ┌───────────────┐
               │  FILE SYSTEM  │      │   CLAMAV      │      │   S3 STORAGE  │
               │  (local disk) │      │  (daemon 3310)│      │  (AWS/MinIO/  │
               │  ./data/      │      │  opcional     │      │   R2/etc)     │
               │  uploads/     │      │  auto-detect  │      │  opcional     │
               └───────────────┘      └───────────────┘      └───────────────┘
```

Essa separação facilita manutenção, testes, evolução independente e deploy em ambientes restritos (air-gapped).

---

# 9. Fluxo Geral de Funcionamento

## 9.1 Upload e Criação de Share (Usuário Autenticado)

1. Usuário acessa `/upload` (PWA instalável, funciona offline para shell)
2. Arrasta arquivos no `@mantine/dropzone` → upload **chunked** (config `share.chunkSize`, default 10MB)
3. Backend recebe chunks em `POST /api/shares/:shareId/files` (raw body, `application/octet-stream`)
4. Chunks salvos em `./data/uploads/_temp/<shareId>/` como `.tmp-chunk-N`
5. Usuário finaliza share → `POST /api/shares/:shareId/complete`
6. Backend: move chunks → arquivo final, calcula hash, atualiza `File` model, **aciona ClamAV scan** (se ativo)
7. Se scan limpo: share fica `uploadLocked=true`, disponível para download
8. Se infectado: share + arquivos deletados, log de auditoria
9. Operação registrada em `DownloadLog` (tipo upload) e audit trail

## 9.2 Compartilhamento (Link Seguro)

1. Usuário gera share → sistema cria **token UUID v4** + **senha aleatória** (se habilitado)
2. Link: `https://dominio/share/<shareId>?token=<uuid>&pwd=<senha>` (ou só token)
3. Destinatário acessa link → Frontend carrega `/share/[shareId]`
4. Backend valida: token existe, não expirado, `maxViews`/`maxDownloads` não excedidos, senha confere
5. Se válido: lista arquivos, permite download individual ou ZIP (`GET /api/shares/:shareId/files/zip`)
6. Cada download: incrementa contadores, cria `DownloadLog` (userId se autenticado, IP, user-agent, timestamp, shareId, fileId)
7. Logs visíveis no painel admin (`/admin/download-logs`)

## 9.3 Reverse Share (Upload de Terceiros)

1. Usuário autenticado cria reverse share: `POST /api/reverseShares` (define `maxShareSize`, `shareExpiration`, `remainingUses`, `publicAccess`, `sendEmailNotification`)
2. Sistema gera token único → link público: `https://dominio/upload/<token>`
3. Terceiro acessa link (sem login) → página `/upload/[token]` (versão simplificada se `simplified=true`)
4. Terceiro faz upload chunked igual ao fluxo normal
5. Arquivos vão para **conta do dono** do reverse share (share criado automaticamente ao completar)
6. Dono recebe e-mail de notificação (se habilitado)
7. Reverse share consome `remainingUses`, expira automaticamente

## 9.4 Limpeza Automática (Cron Jobs)

| Cron | Job | Ação |
|------|-----|------|
| `* * * * *` | `deleteExpiredShares` | Remove shares com `fileRetentionPeriod` expirado |
| `0 * * * *` | `deleteExpiredReverseShares` | Remove reverse shares expirados |
| `0 */6 * * *` | `deleteUnfinishedShares` | Remove shares >24h sem `uploadLocked` |
| `0 0 * * *` | `deleteTemporaryFiles` | Varre `SHARE_DIRECTORY` deletando `.tmp-chunk` >1 dia |
| `1 * * * *` | `deleteExpiredTokens` | Limpa refresh/login/reset tokens expirados |
| `0 * * * *` | `deleteUnactivatedUsers` | Remove usuários não ativados em 24h |

---

# 10. Requisitos do Servidor

## Hardware Recomendado

### Ambiente de Desenvolvimento

* 4 núcleos CPU (x86_64/ARM64)
* 8 GB RAM (mínimo 4 GB)
* 20 GB SSD livre (para container, DB, uploads temporários)
* Docker Engine 24+ / Docker Compose 2+

### Ambiente de Produção

* 4+ núcleos CPU (Intel Xeon / AMD EPYC / ARM Neoverse)
* 16+ GB RAM (recomendado 32 GB para cache Redis + ClamAV + arquivos grandes)
* SSD NVMe para sistema operacional + banco de dados
* **Disco dedicado para armazenamento** (HDD/SSD/SAN/NAS montado em `/opt/app/backend/data` ou volume Docker)
* Interface de rede 1 Gbps+ (10 Gbps para arquivos grandes)
* Backup automatizado do volume `data/` (SQLite + uploads + logs)

## Software

* **Ubuntu Server 24.04 LTS** (ou Alpine/Debian/RHEL compatível)
* **Docker Engine 24+** + **Docker Compose 2+** (plugin)
* **Git** (deploy via clone + compose up)
* **OpenSSL** (certificados, geração de segredos JWT)
* **NTP** sincronizado (chrony/systemd-timesyncd) — crítico para JWT/TOTP/expiração
* **Firewall** (ufw/iptables/nftables) — apenas portas 80/443 (Caddy) + 22 (SSH admin) expostas
* **ClamAV daemon** (opcional, container separado `docker-compose.dev.yml` ou serviço systemd)

## Configuração de Ambiente (Variáveis Principais)

| Variável | Descrição | Default |
|----------|-----------|---------|
| `BACKEND_PORT` | Porta do NestJS | `8080` |
| `API_URL` | URL interna do backend (para SSR Next) | `http://localhost:8080` |
| `CORS_ORIGIN` | Origens permitidas (CSV) | `false` (same-origin) |
| `TRUST_PROXY` | Habilita `X-Forwarded-*` headers | `false` |
| `DATABASE_URL` | Connection string Prisma | `file:./data/controle-videos.db` |
| `JWT_SECRET` | Segredo assinatura JWT (mín 32 chars) | **obrigatório** |
| `JWT_REFRESH_SECRET` | Segredo refresh token | **obrigatório** |
| `CLAMAV_HOST` / `CLAMAV_PORT` | Daemon ClamAV | `clamav` / `3310` (docker) |
| `S3_*` | Configurações bucket S3 | (opcional) |
| `SMTP_*` | Configurações e-mail | (opcional) |
| `PUID`/`PGID` | User/Group ID não-root no container | `1000`/`1000` |

---

# 11. Requisitos de Rede

* Endereço IP fixo ou DNS interno resolvível
* **HTTPS obrigatório** (Caddy provisiona Let's Encrypt automaticamente ou usa certificado próprio)
* Firewall ativo: apenas 80/443 (HTTP/HTTPS) + 22 (SSH restrito a IPs admin)
* **Zero egress não configurado** — bloquear saídas para `api.github.com`, registries Docker, update checkers, telemetria
* Sincronização de horário via **NTP** (pool.ntp.org ou servidor interno)
* Reverse proxy confiável (`TRUST_PROXY=true` se atrás de LB/Cloudflare)
* Portas internas: 3000 (Caddy), 3333 (Next), 8080/8090 (NestJS), 3310 (ClamAV), 6379 (Redis opcional)

---

# 12. Objetivos de Segurança

O sistema implementa defesa em profundidade:

* **Confidencialidade**: Arquivos nunca servidos sem token válido + validações; senhas Argon2id; JWT HS256/RS256; cookies HttpOnly+Secure+SameSite
* **Integridade**: Hash de arquivos no upload; validação de chunks; Prisma transactions; ClamAV scan
* **Disponibilidade**: Healthchecks Docker; restart `unless-stopped`; cron limpeza; monitoramento de disco; rate limiting (throttler)
* **Autenticação forte**: Local user/pass + Argon2id + JWT access (15min) + refresh (7d) + rotação + TOTP opcional
* **Autorização granular**: Guards `JwtAuthGuard`, `OwnerGuard`, `AdminGuard`, `ReverseShareOwnerGuard`, `ShareAccessGuard` (token+pwd+expiração+limites)
* **Auditoria completa**: `DownloadLog` (user/IP/UA/timestamp/share/file); logs de erro estruturados; Swagger gated (dev only)
* **Proteção web**: Helmet (CSP, HSTS, COEP, COOP, CORP, Permissions-Policy); CORS restrito; body parser limits; validation pipe whitelist
* **Segurança de containers**: Non-root user (PUID/PGID), `readOnlyRootFilesystem` onde possível, drop capabilities, no-new-privileges
* **Atualizações controladas**: Apenas patches/minors de dependências (renovate/dependabot config), majors via revisão manual

---

# 13. Escalabilidade

A arquitetura permite expansão futura:

* **Horizontal**: Múltiplas réplicas do backend (stateless, JWT shared secret, Redis para cache/rate-limit)
* **Cache distribuído**: Redis (`@keyv/redis`) para configs, sessões, rate-limit
* **Filas de processamento**: BullMQ / `@nestjs/microservices` para scan ClamAV assíncrono, e-mails, ZIPs grandes
* **Armazenamento externo**: S3 provider nativo (já implementado) + suporte a CDN (CloudFront, Cloudflare R2)
* **Replicação de banco**: Migração para PostgreSQL + Patroni/pgpool / MySQL Group Replication
* **Load balancing**: Caddy/Traefik/NGINX upstream múltiplos backends
* **Observabilidade**: OpenTelemetry + Prometheus + Grafana (endpoints `/metrics` a adicionar)

---

# 14. Disponibilidade

O sistema opera continuamente com mecanismos de resiliência:

* **Healthcheck Docker**: `curl http://localhost:3000/api/health` a cada 30s
* **Restart automático**: `unless-stopped` + `Caddy` + `Node` supervisionados por entrypoint script
* **Migrações idempotentes**: `prisma migrate deploy` no startup (zero-downtime para schema compatível)
* **Seed idempotente**: `prisma db seed` cria admin inicial se não existir
* **Monitoramento de processos**: Entrypoint verifica PID Caddy + Next + NestJS
* **Registro de eventos críticos**: Logs JSON estruturados (stdout/stderr) → Loki/ELK/Grafana
* **Backup point-in-time**: Volume `data/` (SQLite + uploads) via snapshot de disco/fs (ZFS, LVM, EBS, Longhorn)

---

# 15. Premissas do Projeto

* Todos os arquivos permanecem armazenados no servidor (volume `data/`) ou bucket S3 configurado
* Arquivos **não são modificados** pelo sistema (apenas movidos de temp para final, ZIP criado on-demand)
* Apenas usuários autenticados acessam a área administrativa e criam shares
* Todo download é registrado em `DownloadLog` (usuário identificado ou IP anônimo)
* Todo share é identificado por **UUID v4** (token) + ID numérico interno
* Todo acesso (sucesso ou falha) é auditado (logs de auth, share access, admin actions)
* **Zero dependem)
* Configuração persistida no banco (`Config` model) — alterações via painel têm efeito imediato
* PT-BR é o único idioma ativo (strings em `frontend/src/i18n/translations/pt-BR` e `backend/src/i18n/`)

---

# 16. Restrições

* O sistema depende de acesso de leitura/escrita ao volume de dados (`/opt/app/backend/data`)
* O servidor deve possuir espaço suficiente para arquivos + banco + temp + logs
* Ambiente deve possuir **Node.js 24+** (imagem Docker `node:24-alpine` garante)
* Banco de dados padrão **SQLite** — para produção com alta concorrência, migrar para **PostgreSQL 15+** ou **MySQL 8+**
* Acesso externo **deve** utilizar HTTPS (Caddy gerencia automaticamente)
* **Sem conectividade externa obrigatória** — funciona em rede isolada (air-gapped) se ClamAV, SMTP, S3, NTP forem internos
* Upload máximo limitado por `share.maxFileSize` (config) e espaço em disco (`check-disk-space`)
* ClamAV é **opcional** — sistema funciona sem ele (auto-detect, scan vira no-op)

---

# 17. Considerações Finais

Este documento reflete a **implementação real** do Controle Share Videos (versão 2.x), um fork independente do Pingvin Share X adaptado para uso interno restrito com foco em segurança, auditoria e soberania de dados.

A stack tecnológica consolidada é:

| Camada | Tecnologia |
|--------|------------|
| API Backend | NestJS 11 + TypeScript 6 + Prisma 7 |
| Frontend | Next.js 16 + React 19 + Mantine 9 |
| Banco | SQLite (better-sqlite3) / PostgreSQL / MySQL via Prisma |
| Proxy / TLS | Caddy 2 (auto-HTTPS) |
| Container | Docker multi-stage (Alpine) + Compose |
| Auth | JWT + Argon2id + TOTP (opcional) |
| Storage | Local FS + S3 compatível |
| Antivírus | ClamAV (opcional, auto-detect) |
| PWA | Serwist (Workbox) |
| i18n | PT-BR único (nestjs-i18n + react-intl) |

Os próximos documentos detalham:
* Regras de negócio e matriz de permissões
* Modelo de dados (Prisma schema) e migrações
* API endpoints (OpenAPI/Swagger em `/api/swagger`)
* Configuração (todas as chaves `Config` por categoria)
* Deploy operacional (Docker, backup, monitoramento, hardening)
* Guia de desenvolvimento (scripts, testes, lint, contribuição)

---

*Documento gerado a partir da análise do código-fonte em `main` (Jul/2026).*