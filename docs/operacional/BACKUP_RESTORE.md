# Backup e Restore — Controle Share Videos (D05/H-02)

> **Objetivo**: documentar o procedimento de backup, restore e o restore test
> automatizado que valida a integridade dos backups antes que sejam necessários.
> Fecha a pendência **D05** da auditoria (backup sem restore test).

---

## 1. Visão Geral

O banco de dados é **SQLite** (arquivo único `controle-videos.db`). O backup é
feito com o `.backup` do sqlite3 (snapshot consistente via WAL), comprimido com
gzip e, em produção, criptografado e assinado com GPG.

```
controle-videos_YYYYMMDD_HHMMSS.db        (snapshot sqlite3)
controle-videos_YYYYMMDD_HHMMSS.db.gz     (gzip)
controle-videos_YYYYMMDD_HHMMSS.db.gz.gpg (gpg --encrypt --sign — produção)
controle-videos_YYYYMMDD_HHMMSS.db.gz.sig (gpg --detach-sign — dev/test)
```

## 2. Backup

### 2.1 Execução manual

```bash
NODE_ENV=production \
GPG_RECIPIENT=<email-ou-key-id> \
BACKUP_DIR=/opt/app/backups \
DB_FILE=/opt/app/backend/data/controle-videos.db \
./scripts/backup.sh
```

- `NODE_ENV=production` **sem** `GPG_RECIPIENT` → fail-closed: o script aborta
  (não produz backup legível/descriptografado em produção).
- Rotação automática: backups mais antigos que `RETENTION_DAYS` (default 30)
  são removidos.

### 2.2 Backup pré-deploy

O `scripts/deploy/deploy-prod.sh` executa o backup automaticamente antes de
cada deploy quando chamado com `RUN_BACKUP=1` (é o padrão do job `deploy` do
CI). Se o backup falhar, **o deploy é abortado**.

### 2.3 Agendamento regular (cron)

Backup diário no host (root crontab):

```
0 3 * * * cd /opt/controle-share-videos-v1.0 && \
  NODE_ENV=production GPG_RECIPIENT=<chave> \
  ./scripts/backup.sh >> /var/log/controle-share-videos-backup.log 2>&1
```

## 3. Restore Test Automatizado (D05 — resolvido)

O `scripts/restore-test.sh` valida que o backup **mais recente** é restaurável,
sem tocar no banco de produção:

1. Seleciona o backup mais recente em `BACKUP_DIR`.
2. Descriptografa (`.gpg`) / verifica assinatura (`.sig`) / descomprime (`.gz`)
   em diretório temporário.
3. Executa `PRAGMA integrity_check` (deve retornar `ok`).
4. Valida o **schema**: as 10 tabelas do Prisma presentes
   (User, RefreshToken, LoginToken, ResetPasswordToken, Share,
   ShareRecipient, File, ShareSecurity, Config, DownloadLog).
5. Valida **counts mínimos** de sanidade (User ≥ 1, Config ≥ 1) — detecta
   backup vazio/incompleto.

Fail-closed: qualquer falha acima sai com código **1**, permitindo que o
monitoramento alerte sobre backup corrompido.

### 3.1 Execução manual

```bash
BACKUP_DIR=/opt/app/backups GPG_RECIPIENT=<chave> ./scripts/restore-test.sh
```

### 3.2 Agendamento (cron) — semanal

```
30 4 * * 1 /opt/controle-share-videos-v1.0/scripts/restore-test.sh \
  >> /var/log/controle-share-videos-restore-test.log 2>&1
```

Um job semanal é suficiente para detectar backups quebrados; se o log não
estiver vazio ou o exit code for 1, investigar imediatamente.

### 3.3 Monitoramento

- O restore test escreve em `stdout` e sai com 0/1. Integrar o exit code a um
  agente de monitoramento (ex.: script de verificação do Prometheus `node`
  exporter custom, ou `cron` com e-mail de erro) para alertar em falha.
- Complementa o alerta `SqliteIntegrityFailure` do
  `scripts/monitoring/alerts.yml`, que cobre a integridade do banco **vivo**.

## 4. Restore Manual (recuperação de desastre)

### 4.1 Restaurar o backup mais recente

```bash
set -euo pipefail
BACKUP_DIR=/opt/app/backups
APP_DATA=/opt/app/backend/data

# 1. Localizar o backup mais recente
LATEST=$(ls -1t "${BACKUP_DIR}"/controle-videos_*.db.gz.gpg | head -n1)

# 2. Descriptografar + descomprimir
gpg --decrypt "${LATEST}" | gzip -dc > /tmp/controle-videos-restore.db

# 3. Parar o backend (evita escrita concorrente no SQLite)
docker compose -f docker-compose.prod.yml stop backend

# 4. Restaurar (backup de produção do arquivo atual antes de sobrescrever)
cp "${APP_DATA}/controle-videos.db" "${APP_DATA}/controle-videos.db.pre-restore"
sqlite3 "${APP_DATA}/controle-videos.db" ".restore '/tmp/controle-videos-restore.db'"

# 5. Validar integridade
sqlite3 "${APP_DATA}/controle-videos.db" "PRAGMA integrity_check;"   # -> ok

# 6. Reiniciar o backend
docker compose -f docker-compose.prod.yml start backend
```

### 4.2 Validação pós-restore

```bash
docker compose -f docker-compose.prod.yml ps   # backend healthy
curl -fs http://127.0.0.1:8080/api/health      # 200
```

## 5. Checklist Operacional

| Item | Ferramenta | Frequência |
|---|---|---|
| Backup criptografado | `scripts/backup.sh` | Diário (cron) + pré-deploy |
| Restore test (integridade do backup) | `scripts/restore-test.sh` | Semanal (cron) |
| Integridade do banco vivo | `scripts/verify-db.sh` / alerta Prometheus | Contínuo |
| Teste de restore manual (DR drill) | §4 | Trimestral |