# DR Drill — Teste Trimestral de Recuperação de Desastre (SEC-4.8)

**Versão:** 1.0  
**Data:** 2026-08-21  
**Owner:** DevOps  
**Frequência:** Trimestral (agenda: 1ª semana de jan/abr/jul/out)  
**Duração estimada:** 2–3h  
**Integração:** `docs/operacional/BACKUP_RESTORE.md` §4–5, `docs/runbooks/incident-response.md`

---

## 1. Objetivos e Metas

| Métrica | Alvo | Como medir no drill |
|---------|------|---------------------|
| **RTO** (Recovery Time Objective) | ≤ 4h | Cronometrar do início do drill até `/api/health` = 200 |
| **RPO** DB (Recovery Point Objective) | ≤ 24h | Idade do backup restaurado (`now - timestamp do backup`) |
| **RPO** arquivos (uploads) | ≤ 24h | Delta entre último arquivo no volume original vs. restaurado |
| Integridade dos dados | 100% | `PRAGMA integrity_check` + counts + validação de amostra |

> Se o RTO/RPO medido exceder o alvo em 2 drills consecutivos, reavaliar
> arquitetura de backup (frequência, automação) — ver §6.

---

## 2. Pré-requisitos (semana anterior)

- [ ] Agendar janela com stakeholders (o drill NÃO afeta produção — env isolado)
- [ ] Host/env limpo disponível (VM ou container host separado; **nunca** o host de produção)
- [ ] Backups mais recentes acessíveis a partir do env de teste (`scripts/backup.sh` output)
- [ ] Versão da aplicação anotada (tag/commit que rodava quando o backup foi gerado)
- [ ] Cronômetro/documentação pronta (formulário §5)

---

## 3. Procedimento do Drill

### Fase A — Provisionar ambiente limpo (T+0)

```bash
# Registrar início oficial do RTO
date -u +%s > /tmp/dr-drill-start.epoch

# Env limpo: sem dados pré-existentes
mkdir -p /opt/dr-drill/data/backend && cd /opt/dr-drill
# Copiar apenas código/config (git clone checkout <tag>) — NUNCA dados
```

### Fase B — Restaurar banco de dados (T+~15min)

```bash
set -euo pipefail
BACKUP_DIR=/caminho/backups        # backup MAIS ANTIGO permitido pela política? Não: o mais RECENTE
APP_DATA=/opt/dr-drill/data/backend

LATEST=$(ls -1t "${BACKUP_DIR}"/controle-videos_*.db.gz.gpg | head -n1)
echo "Backup selecionado: ${LATEST} ($(stat -c %y "${LATEST}"))"   # ← base do RPO

gpg --decrypt "${LATEST}" | gzip -dc > /tmp/dr-restore.db
sqlite3 "${APP_DATA}/controle-videos.db" ".restore '/tmp/dr-restore.db'"
sqlite3 "${APP_DATA}/controle-videos.db" "PRAGMA integrity_check;"   # deve retornar "ok"
```

### Fase C — Restaurar arquivos/uploads (T+~30min)

```bash
# Backup de arquivos gerado por scripts/backup/backup-files.sh
tar -xzpf uploads_backup.tar.gz -C /opt/dr-drill/data/
# Anotar horário do snapshot de arquivos usado → RPO de arquivos
```

### Fase D — Subir a stack completa (T+~45min)

```bash
cd /opt/dr-drill   # checkout da mesma tag usada em produção
cp .env.example .env && vi .env   # credenciais de TESTE (nunca as de produção)
docker compose -f docker-compose.prod.yml up -d
```

### Fase E — Validação funcional (T+~60min)

```bash
# 1. Saúde
docker compose -f docker-compose.prod.yml ps          # todos healthy
curl -fs http://127.0.0.1:8080/api/health             # 200

# 2. Autenticação ponta-a-ponta
#    Login com usuário conhecido do backup → 200

# 3. Integridade referencial (amostra)
sqlite3 data/backend/controle-videos.db "
  SELECT 'users', COUNT(*) FROM User UNION ALL
  SELECT 'shares', COUNT(*) FROM Share UNION ALL
  SELECT 'files', COUNT(*) FROM File UNION ALL
  SELECT 'audit', COUNT(*) FROM AuditLog;"
# Comparar com counts coletados em PRODUÇÃO antes do drill (Fase 2 dos pré-reqs)

# 4. Download E2E de um share de amostra via UI/API
```

### Fase F — Encerrar e cronometrar (T+final)

```bash
START=$(cat /tmp/dr-drill-start.epoch)
END=$(date -u +%s)
echo "RTO medido: $(( (END - START) / 60 )) minutos"
# Preencher formulário da seção 5 e arquivar em docs/runbooks/dr-drill-log.md
```

---

## 4. Critérios de Aprovação do Drill

- [ ] `PRAGMA integrity_check` → ok
- [ ] Health check 200 em todos os serviços healthy
- [ ] Login funcional com usuário do backup
- [ ] Counts de tabelas compatíveis com produção (± delta do RPO esperado)
- [ ] Download E2E de share funcionou
- [ ] **RTO medido ≤ 4h** | **RPO DB ≤ 24h** | **RPO arquivos ≤ 24h**
- [ ] Formulário §5 preenchido e arquivado

**Resultado:** ✅ APROVADO / ❌ REPROVADO (se reprovado → action items com prazo)

---

## 5. Formulário de Registro (preencher a cada drill)

```markdown
## DR Drill — YYYY-QX (data: YYYY-MM-DD)
| Item | Valor |
|------|-------|
| Executor | nome |
| Tag/commit testado | vX.Y.Z |
| Backup usado | controle-videos_YYYYMMDD_HHMMSS.db.gz.gpg |
| Idade do backup (RPO DB real) | Xh Ym |
| RPO arquivos real | Xh Ym |
| RTO real (início → health 200) | Xh Ym |
| Fases com problema | [lista] |
| Resultado | APROVADO/REPROVADO |
```

Histórico consolidado: `docs/runbooks/dr-drill-log.md` (criar na 1ª execução).

---

## 6. Pós-Drill (SEC-4.8.3 — melhoria contínua)

1. Reunião de 30min: revisar formulário + gargalos encontrados.
2. Criar issues para cada gap (label `dr`, owner + due date).
3. Atualizar este runbook e `docs/operacional/BACKUP_RESTORE.md` conforme achados.
4. Se RTO/RPO excedidos 2× consecutivas: escalar para revisão de arquitetura
   (ex.: aumentar frequência de backup, automatizar provisionamento, S3 lifecycle).

---

## Arquivos Relacionados

- Backup diário: `scripts/backup.sh`, `scripts/backup/`
- Restore test semanal automatizado: `scripts/restore-test.sh`
- Restore manual: `docs/operacional/BACKUP_RESTORE.md` §4
