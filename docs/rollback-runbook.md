# Rollback Procedure Runbook
**Versao:** 1.0
**Data:** 2026-08-21
**Responsavel:** DevOps
**Revisao:** Mensal (drill) / Apos cada deploy

---

## Visao Geral

Este runbook documenta os procedimentos de rollback para todos os componentes do sistema controle-share-videos.

**RTO Alvo:** < 10 minutos
**RPO:** 1 hora (DB) / 24 horas (arquivos)

---

## Componentes e Estrategias de Rollback

| Componente | Estrategia | Tempo Estimado | Automatizado? |
|------------|------------|----------------|---------------|
| Backend API | Docker image tag rollback | < 2 min | Sim |
| Frontend | Docker image tag rollback | < 2 min | Sim |
| Caddy | Config rollback + reload | < 1 min | Sim |
| Database (SQLite) | Restore from backup | < 5 min | Semi (script) |
| Uploads Volume | Restore from backup | < 10 min | Semi (script) |
| Config/Secrets | Git revert + redeploy | < 3 min | Sim |

---

## 1. Backend Rollback

### Cenario: Deploy com bug critico em producao

```bash
# 1. Identificar tag anterior funcional
docker images controle-share-videos-backend --format "table {{.Tag}}\t{{.CreatedAt}}"

# 2. Rollback imediato (blue/green via docker compose)
docker compose up -d --force-recreate backend:v1.2.3

# 3. Verificar health
curl -f https://api.seu-dominio.com/api/health

# 4. Verificar logs
docker logs controle-share-videos-backend --tail 50
```

### Rollback via Git (se imagem nao existe localmente)

```bash
# 1. Checkout tag anterior
git checkout v1.2.3

# 2. Build e deploy
docker compose build backend
docker compose up -d --force-recreate backend

# 4. Voltar para main
git checkout main
```

### Verificacao Pos-Rollback
- [ ] /api/health retorna 200
- [ ] Login funciona
- [ ] API endpoints principais respondem
- [ ] Logs sem erros criticos

---

## 2. Frontend Rollback

```bash
# 1. Verificar tags disponiveis
docker images controle-share-videos-frontend --format "table {{.Tag}}\t{{.CreatedAt}}"

# 2. Rollback
docker compose up -d --force-recreate frontend:v1.2.3

# 3. Verificar
curl -f https://seu-dominio.com
```

### Verificacao Pos-Rollback
- [ ] Pagina carrega sem erros JS
- [ ] Login/Logout funciona
- [ ] Navegacao principal OK

---

## 3. Database (SQLite) Rollback

### Cenario: Migracao Prisma com problema / Corrupcao / Dados errados

### Opcao A: Restore from Backup (Recomendado)

```bash
# 1. PARAR aplicacao (CRITICO)
docker compose stop backend

# 2. Identificar backup mais recente valido
ls -la /backups/sqlite/
# Ex: controle-videos_full_20260821_020000.db.enc

# 3. Restaurar (script automatico)
/opt/scripts/backup/restore.sh sqlite latest

# 4. Verificar integridade
sqlite3 /opt/app/backend/data/controle-videos.db "PRAGMA integrity_check;"

# 4. Reiniciar aplicacao
docker compose start backend

# 5. Verificar
curl -f https://api.seu-dominio.com/api/health
```

### Opcao B: Prisma Migrate Down (Se migracao recente)

```bash
# Apenas se ultima migracao causou problema E backup nao necessario
cd backend

# Verificar migracoes aplicadas
npx prisma migrate status

# Reverter ultima migracao (CUIDADO: perde dados!)
npx prisma migrate down 1

# Reaplicar seed se necessario
npx prisma db seed

# Reiniciar
docker compose restart backend
```

### Verificacao Pos-Rollback DB
- [ ] PRAGMA integrity_check retorna ok
- [ ] Contagem de registros principal (users, shares) condiz
- [ ] Aplicacao conecta e query basica funciona
- [ ] Audit logs recentes presentes

---

## 5. Config/Secrets Rollback

### Via Git (Config YAML)
```bash
# 1. Ver historico
git log --oneline -10 config.yaml

# 2. Reverter commit especifico
git revert <commit-hash> --no-edit

# 3. Deploy config
docker compose up -d --force-recreate backend
```

### Secrets (KMS/Vault)
```bash
# Rotacionar segredo comprometido
/opt/scripts/security/rotate-jwt-secret.sh

# Para outros secrets (SMTP, DB, AWS):
# 1. Gerar novo no provedor
# 2. Atualizar no KMS/Vault
# 3. Atualizar variavel de ambiente no deploy
# 5. Redeploy afetado
docker compose up -d --force-recreate backend
```

---

## 6. Caddy Rollback

```bash
# 1. Verificar config atual
docker exec controle-share-videos-caddy caddy validate --config /etc/caddy/Caddyfile

# 2. Rollback config (se versionado no git)
git checkout HEAD~1 -- reverse-proxy/Caddyfile.prod

# 3. Reload Caddy (zero downtime)
docker exec controle-share-videos-caddy caddy reload --config /etc/caddy/Caddyfile

# 5. Verificar
curl -I https://seu-dominio.com
```

---

## Drill Mensal de Rollback (Obrigatorio)

### Agenda: Primeira Segunda-feira do mes, 10:00 BRT

#### Checklist do Drill

| Etapa | Responsavel | Tempo Max | Status |
|-------|-------------|-----------|--------|
| 1. Anunciar drill no #ops | DevOps Lead | 1 min | [ ] |
| 2. Backup DB atual (snapshot) | DevOps | 2 min | [ ] |
| 3. Simular bug critico (flag feature) | Backend Lead | 1 min | [ ] |
| 5. Executar rollback backend | DevOps | 3 min | [ ] |
| 6. Verificar health + smoke tests | QA | 2 min | [ ] |
| 7. Rollback DB (restore backup) | DevOps | 5 min | [ ] |
| 8. Verificar integridade dados | Backend Lead | 2 min | [ ] |
| 9. Restaurar estado normal | DevOps | 2 min | [ ] |
| 10. Documentar tempo real (RTO) | DevOps | 1 min | [ ] |
| 11. Post-drill notes no GitHub | DevOps Lead | 5 min | [ ] |

**RTO Alvo Total: < 10 minutos**

#### Metricas de Sucesso
- RTO backend < 2 min
- RTO DB < 5 min
- Zero perda de dados (RPO respeitado)
- Zero downtime percebido pelos usuarios (blue/green)

---

## Runbook de Emergencia (Quick Reference)

### Comandos Rapidos (Colar no terminal)

```bash
# BACKEND ROLLBACK (2 min)
docker compose up -d --force-recreate backend:v1.2.3 && curl -f https://api.dominio.com/api/health

# FRONTEND ROLLBACK (2 min)
docker compose up -d --force-recreate frontend:v1.2.3 && curl -f https://dominio.com

# DB RESTORE (5 min)
docker compose stop backend && /opt/scripts/backup/restore.sh sqlite latest && docker compose start backend && curl -f https://api.dominio.com/api/health

# FULL ROLLBACK (10 min)
docker compose up -d --force-recreate backend:v1.2.3 frontend:v1.2.3 && /opt/scripts/backup/restore.sh all latest
```

---

## Comunicacao Durante Rollback

| Canal | Quando | Modelo |
|-------|--------|--------|
| #ops (Slack) | Inicio imediato | ROLLBACK INICIADO: [componente] - Razao: [motivo] - ETA: [tempo] |
| #ops (Slack) | Conclusao | ROLLBACK CONCLUIDO: [componente] - Tempo real: [X min] - Status: [OK/ISSUES] |
| Email stakeholders | Se downtime > 5 min | Template em docs/templates/rollback-notification.md |
| Status page | Se downtime > 2 min | Atualizar statuspage.io |

---

## Metricas de Acompanhamento

| Metrica | Alvo | Atual | Responsavel |
|---------|------|-------|-------------|
| RTO Backend | < 2 min | TBD | DevOps |
| RTO Database | < 5 min | TBD | DevOps |
| RTO Full Stack | < 10 min | TBD | DevOps |
| RPO Database | 1 hora | TBD | DevOps |
| RPO Files | 24 horas | TBD | DevOps |
| Drill Success Rate | 100% | TBD | DevOps Lead |

---

## Checklist Pos-Rollback (Obrigatorio)

- [ ] Health checks passando
- [ ] Smoke tests principais passando
- [ ] Logs sem erros criticos (ultimos 10 min)
- [ ] Metricas Prometheus normais
- [ ] Alertas resolvidos
- [ ] Comunicacao enviada para stakeholders
- [ ] Issue GitHub criada com root cause
- [ ] Postmortem agendado (se SEV-1/2)
- [ ] Runbook atualizado se gaps encontrados

---

**Proximo Drill Agendado:** Primeira segunda de Setembro 2026, 10:00 BRT
