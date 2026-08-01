# Plano de Ajuste para o Modelo Final de Implantação

> **Status:** Rascunho — documento de planejamento (não é o guia final).
> Objetivo: consolidar as divergências entre o plano acordado e o código
> real do repositório, e listar os ajustes necessários nos arquivos antes
> de reescrever `docs/Implantacao/Implantacao.md` e `conf-dominio.md`.

## 1. Verificações já feitas no código real

Foram lidos diretamente do repositório:

- `docker-compose.prod.yml` — 3 serviços (backend, frontend, caddy), rede
  `app-network` bridge `internal: false`, **somente caddy expõe 80/443**,
  secrets externos (`admin_email`, `admin_username`, `admin_password`,
  `smtp_password`, `acme_email`, `domain`), volumes `backend-data` e
  `frontend-images` **nomeados** (não bind mounts hoje), `entrypoint.sh`
  roda `prisma migrate deploy` + seed, healthcheck em
  `http://127.0.0.1:8080/api/health` (backend) e `:3333` (frontend).
- `Dockerfile` — multistage, grupo/usuário criado em `1002:1002`
  (linhas 90-91), `EXPOSE 3000`, healthcheck decide
  `CADDY_DISABLED`. Caddy é instalado na imagem do `runner`.
- `reverse-proxy/Caddyfile.prod` — usa `{$DOMAIN}` e `{$ACME_EMAIL}`,
  TLS 1.2/1.3, headers de segurança, `rate_limit`, `/api/*` → `backend:8080`,
  health interno só responde para redes privadas, `handle` → `frontend:3333`.
  Não há `localhost` — usa os nomes de serviço da rede Docker.
- `scripts/docker/entrypoint.sh` — copia default images; escolhe
  `Caddyfile.trust-proxy` se `TRUST_PROXY=true`, `Caddyfile.prod` se
  `NODE_ENV=production`, senão `Caddyfile`; sobe Next.js standalone
  (`server.js`) em `:3333`; roda `prisma migrate deploy`, `prisma db seed`,
  `tsx prisma/seed/user.seed.ts`, depois `node dist/src/main`.
  **Observação:** o `entrypoint.sh` sobe o **Caddy interno** da imagem
  (porta `3000`/`Caddyfile.prod`) — em adição ao serviço `caddy` externo
  do compose. Isso é uma divergência importante (ver §3, item D).
- `scripts/docker/create-user.sh` — `PUID/PGID` default `1002` (linhas 6-7),
  `chown` recursivo em `data` e `frontend/public`, troca para não-root via
  `su-exec`.
- `scripts/backup.sh` — **fail-closed**: exige `GPG_RECIPIENT` em produção
  (caso contrário aborta), `sqlite3 .backup` → `gzip -9` →
  `gpg --encrypt --sign`, retenção 30 dias. Bom; alinhado com o plano.
- `scripts/verify-db.sh` — `PRAGMA integrity_check`. Bom.
- `scripts/provision/hardening.sh` — UFW (22, 80, 443; `limit` em 22),
  fail2ban (sshd + filter `caddy`), SSH hardening. **Falta SMB no UFW** — deve
  ser acrescentado conforme plano (LAN-only).
- `scripts/provision/grafana-secret.sh` — gera senha Grafana em
  `scripts/secrets/grafana_admin_password` (gitignored). Bom.
- `docker-compose.monitoring.yml` — prometheus/grafana/loki/promtail/
  node-exporter, rede `monitoring-network` bridge; **volumes nomeados**
  (`prometheus-data`, `grafana-data`, `loki-data`), **não bind em
  `/srv/...`**. Diverge do plano (que quer `/srv/controle-share-videos/
  monitoring/`). **Não existe `docker-compose.logging.yml`** — Loki+Promtail
  já estão no `monitoring.yml`.
- `backend/prisma/seed/config.seed.ts` — `general.appUrl` default
  `http://localhost:3000`, `secret=false`. `internal.jwtSecret` é gerada
  (`crypto.randomBytes(256)`) e `locked=true` (não é Docker secret).
- `backend/src/config/config.service.ts` — `loadYamlConfig()` lê
  `CONFIG_FILE` (`backend/config.yaml`) e **sobrescreve o valor do banco a
  cada boot** se a chave estiver no YAML. Logo, para definir `appUrl` de
  forma persistente pela UI, **não deve haver `config.yaml` com a chave
  `general.appUrl`** (ou ele reverte o boot seguinte).
- `backend/src/email/email.service.ts:116` — links de compartilhamento
  saem como `${general.appUrl}/s/${shareId}`. Frontend usa fallback
  `window.location.origin` quando `appUrl == default`.
- Tabela física SQLite: `"Config"` (PK composta `name_category`).
- `data/` na raiz do repo é dono `1002:1002` (correto).
- `.gitignore` já ignora `/scripts/secrets/` e `secrets/`.
- `reverse-proxy/` tem 3 Caddyfiles: `Caddyfile`, `Caddyfile.prod`,
  `Caddyfile.trust-proxy`. O `entrypoint.sh` decide qual usar.

## 2. Modelo final acordado (resumo)

- **3 containers**: `backend` (NestJS `:8080`), `frontend` (Next.js `:3333`),
  `caddy` externo (`:80/:443`) na imagem oficial `caddy:2.9-alpine`.
- **Rede** `app-network` (bridge, `internal: false` — só caddy expõe portas).
- **UID/GID `1002:1002`** (não `100999`).
- **Docker secrets externos** para `admin_email`, `admin_username`,
  `admin_password`, `smtp_password`, `acme_email`, `domain`.
- **Disco 1 (HD)**: Ubuntu + Docker + código em `/opt/controle-share-videos-v1.0`.
- **Disco 2 (RAID6 14TB)** em `/srv/controle-share-videos/`:
  `data/{controle-videos.db,images,uploads/{_temp,shares}}`,
  `backups/{sqlite,uploads,images}`, `monitoring/{prometheus,grafana,loki}`.
- **Bind mounts** (não volumes nomeados):
  `/srv/controle-share-videos/data` → `/opt/app/backend/data`,
  `/srv/controle-share-videos/data/images` → `/opt/app/frontend/public/img`.
- **`/etc/fstab`** por UUID com `nofail`.
- **Domínio grátis (No-IP)** sem DUC (IP fixo); Caddy provê Let's Encrypt
  automaticamente. `general.appUrl = https://<host>.ddns.net` no banco.
- **Samba autenticado** (usuário `uploader`, UID `1102` no host) — share
  `[videos]` → `/srv/controle-share-videos/data/uploads/shares`, `force group
  = 1002`, `create mask = 0664`, `directory mask = 2775`,
  `hosts allow = 192.168.0.0/16 10.0.0.0/8 172.16.0.0/12`, veto de
  `.bat/.exe/.scr`.
- **Isolamento de dados**: updates via `down/git pull/build/up -d` nunca
  tocam `/srv/...`. Backup pré-update. Rollback via `git checkout <tag>`.
- **Limpeza de `_temp`**: cron diário 3h (`find ... -mmin +1440 -delete`).
- **Backup** GPG fail-closed, cron 2h diário.
- **Hardening** via `scripts/provision/hardening.sh` (+ UFW SMB LAN-only).
- **Monitoramento** opcional, refs. a `docker-compose.monitoring.yml`.

## 3. Divergências críticas entre o plano e o código atual

Estas são as pendências técnicas que precisam ser resolvidas **antes** ou
**durante** a reescrita. Cada uma recebe uma proposta de ajuste.

### A. Volumes `backend-data` e `frontend-images` são **nomeados**

- **Hoje** (`docker-compose.prod.yml:54-56, 95-96, 144-152`):
  ```yaml
  volumes:
    - backend-data:/opt/app/backend/data:rw,z
    - frontend-images:/opt/app/frontend/public/img:rw,z
  volumes:
    backend-data: { driver: local }
    frontend-images: { driver: local }
  ```
- **Plano final**: bind mounts apontando para o RAID6:
  ```yaml
  volumes:
    - /srv/controle-share-videos/data:/opt/app/backend/data:rw,z
    - /srv/controle-share-videos/data/images:/opt/app/frontend/public/img:rw,z
  ```
  e **remover** os volumes nomeados da seção `volumes:`.
- **Justificativa**: dados devem viver fora do ciclo de vida do container,
  no RAID6. Volumes nomeados ficam em `/var/lib/docker/volumes/...` no disco
  do sistema, não no RAID.
- **Ação**: editar `docker-compose.prod.yml` (backend e frontend).

### B. Caddy externo (`caddy:2.9-alpine`) **versus** Caddy interno da imagem

- **Hoje** o `entrypoint.sh` também sobe um Caddy interno (imbutido na
  imagem `runner`) ouvindo em `:3000`, escolhendo `Caddyfile.prod` quando
  `NODE_ENV=production`. Ao mesmo tempo, o compose sobe **outro** container
  `caddy:2.9-alpine` ouvindo `:80/:443` e fazendo `reverse_proxy backend:8080`
  e `frontend:3333`.
- **Conflito**: dois proxies em série — o Caddy externo recebe HTTPS, decode
  e faz proxy para `backend:8080`/`frontend:3333` direto. O Caddy interno do
  `runner` (porta `3000`) **não é usado** externamente, mas o `entrypoint.sh`
  ainda tenta iniciá-lo (sem bind de porta pública, pois só `:80/:443` estão
  expostos pelo serviço `caddy`). Isso pode deixar um processo órfão dentro
  do container backend/frontend.
- **Decisão a tomar** (escolher uma):
  1. **Manter só o Caddy externo** (recomendado pela clareza do plano):
     - No backend, setar `CADDY_DISABLED=true` (já previsto em
       `docker-compose.prod.yml` e no `entrypoint.sh`)
       → `entrypoint.sh` pula o Caddy interno. ✅
     - Backend expõe só NestJS `:8080`; frontend expõe só Next.js `:3333`,
       ambos acessíveis pela rede Docker via nome de serviço.
     - Caddy externo faz TLS + headers + rate limit + reverse proxy.
  2. Ou remove o Caddy interno da imagem (mais intrusivo, mexe no Dockerfile).
- **Ação recomendada**: adicionar `CADDY_DISABLED=true` no `environment` do
  serviço `backend` no `docker-compose.prod.yml` (já está `"false"` hoje!) e
  documentar que o Caddy interno fica desligado em produção. **Hoje está
  `CADDY_DISABLED=false`** (`docker-compose.prod.yml:40`) — divergência real.

### C. `EXPOSE 3000` no Dockerfile desatualizado

- **Hoje** (`Dockerfile:115`): `EXPOSE 3000` (porta do Caddy interno).
- **Plano final**: container `runner` expõe `8080` (NestJS) e `3333`
  (Next.js) — sem Caddy interno.
- **Ação**: ajustar `Dockerfile` para `EXPOSE 8080 3333` (ou remover o
  `EXPOSE`, já que o compose não publica estas portas). Decidir.
- **Healthcheck** (`Dockerfile:118-119`) verifica `CADDY_DISABLED` — alinhar
  caso `CADDY_DISABLED=true` seja o default de produção.

### D. `TRUST_PROXY=true` no backend

- Hoje (`docker-compose.prod.yml:37`): `TRUST_PROXY=true` faz o
  `entrypoint.sh` usar `Caddyfile.trust-proxy` (config do Caddy interno).
- **No modelo final**, com `CADDY_DISABLED=true`, `TRUST_PROXY` deve
  continuar `true` para o NestJS confiar nos headers `X-Forwarded-*`
  enviados pelo Caddy **externo**. Mas o `entrypoint.sh` usa `TRUST_PROXY`
  só para escolher o Caddyfile interno — essa lógica fica sem efeito com
  `CADDY_DISABLED=true`. Ok, apenas garantir consistência.
- **Ação**: manter `TRUST_PROXY=true` e `CADDY_DISABLED=true` juntos no
  backend. Documentar.

### E. `hardening.sh` não abre SMB no UFW (somente LAN)

- **Hoje** (`scripts/provision/hardening.sh`): abre 22/80/443, não 445.
- **Plano final**: UFW com `deny 445 default` + `allow from
  192.168.0.0/16 to any port 445`.
- **Ação**: editar `hardening.sh` para incluir SMB (LAN-only) e fail2ban do
  Samba (se houver filtro). **Decidir** se `hardening.sh` é o lugar certo
  ou se a configuração do Samba vive num outro script/provisionamento.
- **Observação**: o `hardening.sh` atual faz `ufw --force reset`, o que
  apaga regras manuais. Documentar ordem: configurar Samba **depois** de
  rodar `hardening.sh`, ou estender `hardening.sh` para o SMB.

### F. `docker-compose.monitoring.yml` usa volumes nomeados, não `/srv/...`

- **Hoje**: `prometheus-data`, `grafana-data`, `loki-data` são **volumes
  nomeados** — vivem no disco do sistema.
- **Plano final**: volumes apontados para
  `/srv/controle-share-videos/monitoring/{prometheus,grafana,loki}`.
- **Ação**: trocar por bind mounts no `docker-compose.monitoring.yml`
  (opcional — émonitoramento, mas plano pede explícito).
- *Observação:* o plano menciona "docker-compose.logging.yml", que **não
  existe** no repo (Loki+Promtail estão dentro do `monitoring.yml`).
  Reescrever como referência única ao `monitoring.yml`.

### G. Configuração persistente de `general.appUrl`

- **Risco**: `config.service.ts` sobrescreve o banco a cada boot se houver
  `backend/config.yaml` com `general.appUrl`. Em produção, se o operador
  definir `appUrl` pela UI admin e alguém colocar `config.yaml`, o boot
  reverte.
- **Ação**: documentar no `Implantacao.md` (seção 10) que produção **não
  deve** conter `/opt/app/backend/config.yaml` nem
  `/opt/controle-share-videos-v1.0/backend/config.yaml`. Se houver, remover
  ou omitir a chave `general.appUrl` nele. Preferir definir `appUrl` pela
  UI admin (escreve no banco e persiste) ou via SQL direto na tabela
  `"Config"` (`UPDATE "Config" SET "value"='https://...' WHERE
  "name"='appUrl' AND "category"='general'`).
- **Ação complementar**: confirmar que `entrypoint.sh` não injeta
  `CONFIG_FILE` apontando para YAML de produção. Hoje `config.service.ts`
  lê `backend/config.yaml` (relativo) — se não existir, segue só o banco.

### H. Dono/permissões do `/srv/controle-share-videos/data`

- Plano pede `UID/GID 1002:1002` consistente com o container.
- **Risco Samba**: o usuário host `uploader` (UID `1102`) precisa gravar em
  `/srv/.../data/uploads/shares`, mas o container roda como `1002:1002`.
  Solução do plano: `force group = 1002` + `create mask = 0664` +
  `directory mask = 2775` no Samba, e o diretório `shares` com GID `1002`
  e `setgid` (`chmod g+s`).
- **Ação**: documentar `chown -R 1002:1002` e `chmod 2775` em `shares/`, e
  sobre ACLs `setfacl` se necessário. O usuário Samba `uploader` (UID `1102`)
  entra no grupo `1002` (ou via grupo compartilhado) — especificar como.

### I. `hardening.sh` faz `ufw reset` — destrói regras pós-passo

- Se o operador adicionar manualmente regras de SMB depois de rodar
  `hardening.sh` e rodar `hardening.sh` de novo, perde tudo.
- **Ação**: documentar rodar `hardening.sh` uma única vez no provisionamento
  inicial, e SMB ser adicionado por script separado **após**. Ou tornar
  `hardening.sh` idempotente sem `reset`. (Decisão: manter `reset` por
  segurança e documentar ordem.)

### J. `docker-compose.prod.yml` não referencia `docker-compose.logging.yml`

- Confirmado: arquivo inexistente. Plano se referia a ele; ajustar docs para
  citar só `docker-compose.monitoring.yml` (que já inclui Loki + Promtail).

## 4. Lista de arquivos a ajustar (modelo final)

### Edits diretos no código

1. **`docker-compose.prod.yml`**
   - Substituir `backend-data` e `frontend-images` por **bind mounts** para
     `/srv/controle-share-videos/data` e `/srv/.../data/images`.
   - Remover os volumes nomeados correspondentes da seção `volumes:`.
   - Setar `CADDY_DISABLED=true` no `backend` (desliga Caddy interno).
   - Garantir `TRUST_PROXY=true` (mantém).
   - (Opcional) Adicionar comment explicando usa do serviço `caddy` externo.

2. **`Dockerfile`**
   - Ajustar `EXPOSE 3000` → `EXPOSE 8080 3333` (ou remover).
   - Revisar `HEALTHCHECK` para refletir o cenário com `CADDY_DISABLED=true`
     (já cobre este caso em `:118-119`).

3. **`scripts/provision/hardening.sh`**
   - Adicionar regras UFW para SMB LAN-only:
     `ufw deny 445` + `ufw allow from 192.168.0.0/16 to any port 445`
     + `10.0.0.0/8` + `172.16.0.0/12`.
   - (Opcional) Adicionar jail do Samba no `fail2ban` (`samba` ou filtro
     custom).

4. **`docker-compose.monitoring.yml`** (opcional)
   - Trocar `prometheus-data`, `grafana-data`, `loki-data` para bind em
     `/srv/controle-share-videos/monitoring/{prometheus,grafana,loki}`.

5. **(Novo) `scripts/provision/samba.sh`** — recomendado
   - Provisionar usuário `uploader` (UID `1102`), `/etc/samba/smb.conf`
     share `[videos]`, `force group = 1002`, máscaras, `hosts allow`, veto,
     e abrir UFW 445 LAN-only (em vez de mexer no `hardening.sh`).
   - Mantém `hardening.sh` focado em firewall base + SSH + fail2ban.

6. **(Novo) `scripts/backup.sh` já existe** — apenas documentar uso com
   `GPG_RECIPIENT` e cron.

7. **(Novo) `scripts/maintenance/cleanup-temp.sh`** (ou inline no cron)
   - Limpeza diária de `_temp` (`find ... -mmin +1440 -delete`).
   - Opcional: `VACUUM` SQLite mensal.

### Reescrita de documentação

8. **`docs/Implantacao/Implantacao.md`** — reescrita completa nas 23 seções
   do plano.
9. **`docs/Implantacao/conf-dominio.md`** — reescrita completa nas 9 seções
   do plano.

## 5. Ordem de execução sugerida

1. **Ajustar `docker-compose.prod.yml`** (bind mounts + `CADDY_DISABLED=true`).
2. **Ajustar `Dockerfile`** (`EXPOSE`).
3. **Criar `scripts/provision/samba.sh`**.
4. **Estender `hardening.sh`** para SMB/fail2ban-samba (ou apenas
   referenciar `samba.sh`).
5. **Ajustar `docker-compose.monitoring.yml`** (bind mounts em `/srv`).
6. Criar `scripts/maintenance/cleanup-temp.sh`.
7. Reescrever `docs/Implantacao/Implantacao.md` refletindo os passos 1-6.
8. Reescrever `docs/Implantacao/conf-dominio.md`.

## 6. Pontos ainda em aberto (decisões pendentes)

- **`EXPOSE` no Dockerfile**: manter/remover? (baixo impacto, só metadados).
- **`hardening.sh`**: incorporar SMB ou delegar a `samba.sh`? (sugiro
  `samba.sh` separado, `hardening.sh` documenta a regra UFW esperada).
- **`config.yaml` de produção**: proibir explicitamente? Documentar que NÃO
  deve existir em `/opt/.../backend/config.yaml` em produção; `appUrl` via
  UI/SQL.
- **ACLs `setfacl`**: obrigatórias ou `force group` do Samba basta?
  (Sugiro `force group = 1002` + `chmod 2775` + chown `1002:1002`; setfacl
  só se houver multi-usuário Samba.gid).
- **`network_mode: host` no `node-exporter`** do monitoramento — manter?
  (Sim, é necessáriopara ler `/proc` do host.)

---

Após confirmação dos itens de §6, prossegue-se com os ajustes do §4 na
ordem do §5, e então a reescrita dos dois documentos (itens 8-9).
