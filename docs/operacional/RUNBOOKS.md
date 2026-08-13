# RUNBOOKS — Resposta a Incidentes

> Procedimentos operacionais para incidentes comuns. Cada seção é autossuficiente:
> diagnóstico → mitigação → validação → pós-incidente.
> Versão do documento: 1.0 · Atualizado em 2026-08-12

---

## 1. SQLite Lock Contention / `database is locked`

**Sintoma:** Logs do backend mostram `SQLITE_BUSY` ou `database is locked` repetidos,
healthcheck `/api/health` falha intermitentemente, uploads falham.

**Causa comum:**
- Muitos processos tentando escrever no SQLite simultaneamente (backup + cron jobs + uploads).
- Arquivo WAL (`-wal` / `-shm`) corrompido ou lock residual.

**Diagnóstico:**
```bash
docker logs controle-share-videos-backend 2>&1 | grep -iE "SQLITE_BUSY|database is locked" | tail -10
docker exec controle-share-videos-backend ls -la /opt/app/backend/data/
# Verifica se -wal e -shm existem junto ao .db
```

**Mitigação (ordem de preferência):**
1. **Aguarde 30s** — o WAL checkpoint costuma resolver sozinho.
2. **Reinicie apenas o backend:**
   ```bash
   docker compose restart backend
   # aguarda healthcheck voltar a healthy
   watch -n3 'docker ps --filter name=controle-share-videos-backend --format "{{.Status}}"'
   ```
3. **Se persistir** — pare backend + Caddy, faça checkpoint manual:
   ```bash
   docker compose stop backend caddy
   docker exec controle-share-videos-backend sh -c 'sqlite3 /opt/app/backend/data/controle-videos.db "PRAGMA wal_checkpoint(TRUNCATE);"'
   docker compose start backend caddy
   ```
4. **Último recurso** — restore do backup mais recente (ver BACKUP_RESTORE.md §4).

**Validação:**
```bash
docker exec controle-share-videos-backend curl -fs http://127.0.0.1:8080/api/health
# deve retornar OK
```

**Pós-incidente:**
- Verificar se `RETENTION_DAYS` do backup não está muito alto gerando arquivos grandes.
- Considerar migrar para Redis cache (v1.3) ou PostgreSQL se frequência > 1/dia.

---

## 2. Backend `unhealthy` / Falha no healthcheck

**Sintoma:** `docker ps` mostra `(unhealthy)` para o backend; `/api/health` retorna
`500` ou timeout.

**Diagnóstico:**
```bash
docker logs controle-share-videos-backend --tail 100
# Procure: PrismaClientInitializationError, EACCES, ENOENT, OutOfMemory, stack trace
```

**Causas comuns e ações:**

| Causa | Ação |
|---|---|
| `PrismaClientInitializationError: database is locked` | Ver RUNBOOKS §1 |
| `PrismaClientInitializationError: table ... does not exist` | Migração incompleta → `docker compose logs backend` para ver `prisma migrate deploy` |
| `EACCES` / `EROFS` no `/opt/app/backend/data` | Permissão do volume: `ls -la /srv/controle-share-videos/data` (deve ser UID 1002:1002) |
| `OutOfMemory` / `OOMKilled` | Aumentar `limits.memory` no compose (prod.yml: 2G) ou reiniciar host |
| `JWT_SECRET not configured` | Variável `.env` ausente → ver DEPLOY.md §3 |

**Mitigação geral:**
```bash
docker compose restart backend
# se não resolver:
docker compose down
docker compose up -d --build
# se schema mudou e precisa rollback → BACKUP_RESTORE.md §4
```

**Validação:**
```bash
docker exec controle-share-videos-backend curl -fs http://127.0.0.1:8080/api/health
```

---

## 3. Job de limpeza falhou (`deleteExpiredShares` / `deleteOrphanFiles`)

**Sintoma:** Logs mostram erro em `JobsService.deleteExpiredShares` ou
`JobsService.deleteOrphanFiles` (cron `@Cron` a cada minuto/hora).

**Diagnóstico:**
```bash
docker logs controle-share-videos-backend 2>&1 | grep -iE "deleteExpiredShares|deleteOrphanFiles|cleanup|cleanOrphan" | tail -20
```

**Causas comuns:**
- Permissão no volume de uploads (arquivos órfãos não podem ser removidos).
- Transação SQLite abortada por lock (ver RUNBOOKS §1).
- `fileRetentionPeriod` configurado como `-1` (desabilitado) — ok, log apenas.

**Ação:**
1. Se erro de permissão: verificar ownership do volume (`UID 1002:1002`).
2. Se lock: RUNBOOKS §1.
3. Se erro de schema: rodar `npx prisma db push` no container (dev) ou rebuild.

**Validação:**
```bash
# Aguardar próximo ciclo (1 min para deleteExpiredShares, 6h para deleteOrphanFiles)
# Verificar logs novamente — deve não aparecer erro
```

---

## 4. Disco cheio / Volume > 80%

**Sintoma:** `df -h /srv/controle-share-videos` mostra uso > 80%; Caddy/backend
podem falhar com `ENOSPC`.

**Diagnóstico:**
```bash
df -h /srv/controle-share-videos
docker exec controle-share-videos-backend du -sh /opt/app/backend/data
docker system df
```

**Mitigação:**
1. **Limpeza de Docker** (imagens/containers parados):
   ```bash
   docker system prune -f --volumes
   ```
2. **Backup antigo** (ver BACKUP_RESTORE.md §2.3 cron):
   ```bash
   find /opt/app/backups -name 'controle-videos_*.db.gz.gpg' -mtime +30 -delete
   ```
3. **Uploads expirados não limpos** (job falhou → RUNBOOKS §3).
4. **Log rotation** — já configurado no compose (`max-size: 10m`, `max-file: 5`).

**Se crítico (> 95%):**
```bash
docker compose down
# libera espaço
docker compose up -d
```

---

## 5. Frontend `unhealthy` / porta 3333 não responde

**Sintoma:** `docker ps` mostra frontend `(unhealthy)`; Caddy retorna `502`
para requests de UI.

**Diagnóstico:**
```bash
docker logs controle-share-videos-frontend --tail 100
# Procure: Error: listen EADDRINUSE, build errors, Node OOM, NEXT_RUNTIME errors
```

**Causas comuns:**
- Build falhou (frontend não compilou) → `docker compose logs frontend` durante build.
- Porta 3333 ocupada internamente → restart resolve.
- Variável `JWT_SECRET` ausente → frontend middleware falha na verificação.

**Ação:**
```bash
docker compose restart frontend
# se não resolver:
docker compose up -d --build frontend
```

**Validação:**
```bash
docker exec controle-share-videos-frontend curl -fs http://127.0.0.1:3333
```

---

## 6. 401 em massa / Sessões inválidas após restart

**Sintoma:** Usuários recebem `401 Unauthorized` em todas as requests logo após
reinício ou deploy.

**Causa:** `JWT_SECRET` mudou entre restarts (variável não persistida ou
secrets dessincronizados).

**Ação:**
```bash
# Verificar consistência
docker exec controle-share-videos-backend  env | grep JWT_SECRET
docker exec controle-share-videos-frontend env | grep JWT_SECRET
docker exec controle-share-videos-caddy    env | grep JWT_SECRET
# Devem ser IDÊNTICOS (ou o frontend lê do arquivo /run/secrets/jwt_secret)
```

**Mitigação:**
1. Ajustar `.env` / Docker secrets para valor consistente.
2. `docker compose restart backend frontend caddy`
3. Comunicar usuários para **fazer login novamente** (sessões antigas são
   invalidadas — comportamento esperado após rotação de segredo).

---

## 7. Caddy não emite certificado TLS (Let's Encrypt)

**Sintoma:** Acesso via HTTPS falha; logs do Caddy mostram `unable to obtain
certificate` / `rate limited` / `DNS problem`.

**Diagnóstico:**
```bash
docker logs controle-share-videos-caddy --tail 50
# Procure: "acme: error", "DNS problem", "rate limited"
```

**Ações:**
| Erro | Solução |
|---|---|
| `DNS problem: NXDOMAIN` | `dig +short <DOMAIN>` — A/AAAA deve apontar para IP do host |
| `rate limited` (Let's Encrypt) | Aguardar ~1h; usar staging `ca https://acme-staging-v02.api.letsencrypt.org/directory` para testar |
| `ACME_EMAIL` inválido | Corrigir `.env` e `docker compose restart caddy` |
| Porta 80/443 bloqueada no firewall | `ufw allow 80,443/tcp` ou security group da nuvem |

**Workaround rápido (sem TLS):**
```bash
# Usar compose local ou editar Caddyfile para HTTP only
# (apenas para teste interno — NÃO em produção)
```

---

## 8. Rate limit 429 excessivo no edge (Caddy)

**Sintoma:** Usuários legítimos recebem `429 Too Many Requests` em operações
normais (login, upload, listagem).

**Diagnóstico:**
```bash
docker logs controle-share-videos-caddy 2>&1 | grep -c '429'
# ou
docker logs controle-share-videos-caddy | jq -r '.status' | grep 429 | wc -l
```

**Mitigação:**
- Aumentar limites em `reverse-proxy/Caddyfile.prod`:
  - Zona `dynamic`: `events 200` / `window 10s` (era 100/10s)
  - Zona `auth`: `events 20` / `window 60s` (era 10/60s)
- Aplicar: `docker compose restart caddy`

---

## 9. Upload falha / Chunks não completam

**Sintoma:** Progresso de upload para em % < 100; erro `unexpected_chunk_index`
repetido; `completeShare` falha.

**Diagnóstico:**
```bash
docker logs controle-share-videos-backend | grep -iE "chunk|upload|completeShare" | tail -20
# Verifique: tamanho do arquivo vs maxSize, chunkSize, disco cheio
```

**Causas comuns:**
- Arquivo > `share.maxSize` (default 1 GB, max 50 GB via config).
- `share.chunkSize` muito pequeno para arquivo grande → muitos requests.
- Disco cheio (RUNBOOKS §4).
- Rede instável entre frontend → Caddy → backend.

**Ação:**
1. Verificar configs: `Administração → Configurações → share.maxSize`,
   `share.chunkSize`.
2. Se arquivo muito grande, aumentar `maxSize` ou dividir.
3. Verificar espaço em disco.
4. Tentar novamente (o frontend tem retry automático de 5s no chunk).

---

## 10. SMTP falha / E-mails não chegam

**Sintoma:** Convite de usuário, reset de senha ou notificação de download não
chegam; logs mostram erro SMTP.

**Diagnóstico:**
```bash
docker logs controle-share-videos-backend | grep -iE "smtp|email|mailer" | tail -20
docker exec controle-share-videos-backend env | grep -i smtp
```

**Configuração (via UI: Administração → Configurações → smtp):**
| Campo | Obrigatório | Exemplo |
|---|---|---|
| `smtp.host` | ✅ | `smtp.gmail.com` |
| `smtp.port` | ✅ | `587` (STARTTLS) ou `465` (SSL) |
| `smtp.secure` | ✅ | `false` (587) / `true` (465) |
| `smtp.auth.user` | ✅ | `usuario@dominio.com` |
| `smtp.auth.pass` | ✅ | `app-password` (NÃO a senha da conta) |
| `email.from` | ✅ | `Controle Share <no-reply@dominio.com>` |

**Problemas comuns:**
- Gmail: usar **App Password** (não a senha da conta) + `port 587` + `secure=false`.
- Porta 465 com SSL: `secure=true`.
- Firewall bloqueia porta de saída → `telnet smtp.host 587` do host.

---

## 11. Rollback de versão problemática

**Quando usar:** Deploy introduziu bug crítico (500 em API, frontend branco,
migração ruim).

```bash
# 1. Identificar commit estável anterior
git log --oneline -10
git checkout <commit-anterior-estavel>

# 2. Rebuild
docker compose up -d --build

# 3. Se migração Prisma subiu (sem down()): RESTAURAR BACKUP
docker compose down
docker run --rm -v controle-share-videos-backend-data:/data \
  -v "$PWD/backup:/backup" alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/db-<data>.tgz -C /data"
docker compose up -d
```

> ⚠️ O rollback **descarta shares criados após o backup**. Programe em janela
> de baixo uso. Ver BACKUP_RESTORE.md §4.

---

## 12. Comunicação pós-incidente

Para **qualquer incidente** com impacto em usuários:

1. Registrar no runbook interno: data/hora, duração, causa raiz, mitigação.
2. Atualizar este documento se houver novo cenário não coberto.
3. Se foi deploy ruim → adicionar teste no CI ou gate de validação.
4. Se foi infra → revisar alertas e capacity planning.

---

## Referências cruzadas

- `docs/operacional/DEPLOY.md` — upgrade, rollback, healthchecks
- `docs/operacional/BACKUP_RESTORE.md` — procedimentos de restore
- `docs/operacional/MONITORAMENTO.md` — healthchecks, logs, alertas
- `docs/auditoria/ROADMAP.md` — itens v1.2/v1.3 que resolvem recorrências
- `backend/src/app.controller.ts:10` — `/api/health` implementation
- `backend/src/jobs/jobs.service.ts` — cron jobs de limpeza
- `reverse-proxy/Caddyfile.prod` — rate limits, health check interno
