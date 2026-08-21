# Incident Response Runbook
**Versão:** 1.0  
**Última atualização:** 2026-08-21  
**Próxima revisão:** 2026-11-21 (trimestral)

---

## 1. Visão Geral

Este runbook define o processo de resposta a incidentes de segurança para o sistema **controle-share-videos**. Baseado no framework NIST SP 800-61 Rev. 2.

### 1.1 Objetivos
- Minimizar impacto de incidentes de segurança
- Garantir resposta consistente e documentada
- Preservar evidências para análise forense
- Cumprir requisitos LGPD (notificação em 48h)

### 1.2 Escopo
Aplica-se a todos os componentes:
- Backend API (NestJS + SQLite)
- Frontend (Next.js)
- Reverse Proxy (Caddy)
- Infraestrutura (Docker, volumes, rede)

---

## 2. Classificação de Incidentes

| Severidade | Definição | Exemplos | SLA Resposta | SLA Resolução | Notificação |
|------------|-----------|----------|--------------|---------------|-------------|
| **SEV-1** | Crítico - Sistema indisponível / Vazamento de dados confirmado | Ransomware, SQLi com exfiltração, Credenciais AWS comprometidas, Downtime total | **15 min** | **4 horas** | Imediata (todos canais) |
| **SEV-2** | Alto - Funcionalidade crítica degradada / Acesso não autorizado suspeito | Auth bypass, IDOR ativo, Brute force bem-sucedido, Certificado expirado | **1 hora** | **8 horas** | 30 min (Slack + Email) |
| **SEV-3** | Médio - Bug de segurança não explorado / Degradação menor | XSS stored não explorado, Rate limit bypass, Log injection | **4 horas** | **24 horas** | Próximo dia útil |
| **SEV-4** | Baixo - Melhoria / Hardening / Baixo risco | Dependência vulnerável (sem exploit), Config hardening, False positive | **Próxima sprint** | **30 dias** | Backlog |

---

## 3. Papéis e Responsabilidades

| Papel | Responsável | Backup | Contato |
|-------|-------------|--------|---------|
| **Incident Commander (IC)** | Security Lead | Backend Lead | Slack: @security-lead / Tel: +55-XX-XXXXX-XXXX |
| **Technical Lead (TL)** | Backend Lead | DevOps | Slack: @backend-lead |
| **Communications Lead (CL)** | Tech Lead | Security Lead | Slack: @tech-lead |
| **Forensics Analyst** | DevOps | Backend Lead | Slack: @devops |
| **Executive Sponsor** | CTO/CEO | - | Email: cto@empresa.com |

### 3.1 Matriz de Escalação
```
SEV-1: IC → TL + CL (paralelo) → Executive Sponsor (em 30 min)
SEV-2: IC → TL → CL (se impacto externo)
SEV-3: IC → TL (next business day)
SEV-4: TL (backlog)
```

---

## 4. Canais de Comunicação

| Canal | Uso | Acesso |
|-------|-----|--------|
| **#sec-incidents** (Slack) | Comando principal, tempo real | IC, TL, CL, Forensics, Exec |
| **#sec-incidents-public** | Atualizações para equipe geral | Todos da engenharia |
| **Email: security@empresa.com** | Registro formal, evidências | IC, CL, Legal |
| **PGP Keys** | Evidências sensíveis (credenciais, PII) | Ver keybase.io/team/empresa |

### 4.1 Templates de Comunicação

#### Alerta Inicial (SEV-1/2) - Slack #sec-incidents
```
🚨 INCIDENTE SEV-[1/2] - [Título breve]
**Horário:** [ISO 8601]
**Componente:** [API/Frontend/Caddy/Infra]
**Impacto:** [Descrição do impacto usuário/negócio]
**IC:** @pessoa
**TL:** @pessoa
**Status:** INVESTIGATING
**Próxima atualização:** [T+30min]
```

#### Atualização Periódica
```
🔄 UPDATE SEV-[1/2] - [Título]
**Horário:** [ISO 8601]
**Status:** INVESTIGATING | CONTAINING | ERADICATING | RECOVERING | POSTMORTEM
**Progresso:** [O que foi feito]
**Próximos passos:** [Ações planejadas]
**Próxima atualização:** [T+X]
```

#### Resolução
```
✅ RESOLVIDO SEV-[1/2] - [Título]
**Horário início:** [ISO 8601]
**Horário resolução:** [ISO 8601]
**Duração:** [Xh Ym]
**Causa raiz:** [Resumo]
**Ação corretiva:** [O que foi feito]
**Postmortem:** [Link/agendado para DD/MM]
```

---

## 5. Fases de Resposta

### FASE 1: DETECÇÃO E ANÁLISE (T+0 a T+15min SEV-1)

#### 5.1 Fontes de Detecção
- Alertas Prometheus/Alertmanager (auth failures, 5xx, disk, cert)
- Logs de auditoria (audit_log table)
- Relato de usuário / suporte
- Scan de vulnerabilidade / pen test
- Threat intel feeds

#### 5.2 Triagem Inicial (IC)
```bash
# Checklist rápido (executar em < 5 min)
□ Confirmar se é falso positivo
□ Identificar componente afetado
□ Classificar severidade (SEV-1 a 4)
□ Notificar TL e CL
□ Criar issue de tracking no GitHub
□ Iniciar timeline no documento do incidente
```

#### 5.3 Evidências Iniciais (Forensics)
```bash
# Capturar estado atual (não alterar sistema!)
# 1. Snapshot de volumes (AWS/GCP)
aws ec2 create-snapshot --volume-id vol-xxx --description "IR-SEV1-$(date +%s)"

# 2. Exportar logs recentes (últimas 24h)
sqlite3 /opt/app/backend/data/controle-videos.db \
  "SELECT * FROM audit_log WHERE createdAt > datetime('now', '-1 day');" > audit_export_$(date +%s).csv

# 3. Capturar conexões de rede atuais
ss -tunap > netstat_$(date +%s).txt

# 4. Processos em execução
ps auxf > processes_$(date +%s).txt
```

---

### FASE 2: CONTEMÇÃO (T+15min a T+1h SEV-1)

#### 5.4 Contenção de Curto Prazo (Imediata)
| Incidente | Ação de Contenção |
|-----------|-------------------|
| Credencial AWS comprometida | `aws iam delete-access-key`, rotacionar keys, revogar sessões |
| SQL Injection ativo | Ativar WAF rule, bloquear IP atacante no Caddy/SG |
| Ransomware/Arquivo malicioso | Isolar volume, parar container backend |
| Sessão hijacking | Revogar refresh tokens do usuário, forçar reauth |
| Certificado expirado | Renovar via Caddy (force) ou emitir manual |

#### 5.5 Comandos de Contenção Rápida
```bash
# Revogar TODAS as sessões de um usuário
sqlite3 /opt/app/backend/data/controle-videos.db \
  "DELETE FROM refresh_token WHERE userId = 'USER_ID';"

# Bloquear IP no Caddy (adicionar ao Caddyfile e reload)
# deny 192.168.1.100

# Parar backend (mantém volumes para forense)
docker compose stop backend

# Isolar volume suspeito (snapshot + detach)
aws ec2 create-snapshot --volume-id vol-xxx --description "IR-isolation-$(date +%s)"
```

#### 5.6 Contenção de Longo Prazo (Pós-estabilização)
- Aplicar patches / config fixes
- Rotacionar segredos expostos
- Atualizar regras de firewall/WAF
- Revisar permissões RBAC

---

### FASE 3: ERRADICAÇÃO (T+1h a T+4h SEV-1)

#### 5.7 Identificar Causa Raiz
- Análise de logs (audit_log, access logs, error logs)
- Revisão de código (commit recente, dependências)
- Análise de configuração (env vars, Caddyfile, Docker)
- Entrevista com equipe (o que mudou recentemente?)

#### 5.8 Remoção da Ameaça
| Vetor | Erradicação |
|-------|-------------|
| Código vulnerável | Deploy fix + rollback se necessário |
| Credencial vazada | Rotacionar + revogar todas derivadas |
| Malware em upload | Quarentena + scan AV + limpeza |
| Config insegura | Hardening + IaC update |
| Dependência vulnerável | Upgrade + patch ou substituição |

#### 5.9 Validação da Erradicação
- [ ] Vulnerabilidade não mais explorável (teste manual)
- [ ] Scan de vulnerabilidade passa
- [ ] Testes de segurança (security.e2e-spec.ts) passam
- [ ] Logs não mostram atividade suspeita por 30 min

---

### FASE 4: RECUPERAÇÃO (T+4h a T+24h SEV-1)

#### 5.10 Restauração de Serviços
```bash
# 1. Verificar integridade do banco (se restaurado)
sqlite3 /opt/app/backend/data/controle-videos.db "PRAGMA integrity_check;"

# 2. Verificar backups recentes
./scripts/backup/restore.sh sqlite latest  # DRY RUN first!

# 3. Subir serviços em staging
docker compose -f docker-compose.staging.yml up -d

# 4. Smoke tests
curl -f https://staging.empresa.com/api/health
./run-security-tests.sh

# 5. Deploy produção (blue/green ou rolling)
docker compose up -d --force-recreate backend
```

#### 5.11 Monitoramento Pós-Recuperação
- [ ] Alertas silenciosos por 2 horas
- [ ] Métricas normais (latency, error rate, throughput)
- [ ] Logs de auditoria sem anomalias
- [ ] Feedback de usuários/suporte

---

### FASE 5: LIÇÕES APRENDIDAS (T+24h a T+5 dias)

#### 5.12 Postmortem Obrigatório (SEV-1/2)
**Prazo:** 5 dias úteis após resolução  
**Template:** `docs/runbooks/postmortem-template.md`  
**Participantes:** IC, TL, CL, Forensics, Stakeholders

#### 5.13 Itens de Ação
- Cada item → Issue no GitHub com label `postmortem-action`
- Owner + Due date obrigatórios
- Revisão semanal até fechamento

---

## 6. Procedimentos Específicos por Cenário

### 6.1 Vazamento de Credencial (AWS, SMTP, JWT, DB)
```bash
# 1. Identificar escopo (qual credencial, onde usada)
# 2. Rotacionar IMEDIATAMENTE
# JWT Secret:
./scripts/rotate-jwt-secret.sh  # (criar script)

# AWS Keys:
aws iam create-access-key --user-name app-user
aws iam delete-access-key --user-name app-user --access-key-id OLD_KEY

# SMTP:
# Atualizar no painel do provedor + env var + reload

# 3. Revogar sessões ativas
sqlite3 $DB "DELETE FROM refresh_token; DELETE FROM session;"

# 4. Auditar uso da credencial antiga (CloudTrail, logs SMTP)
# 5. Notificar se dados acessados (LGPD Art. 48)
```

### 6.2 Acesso Não Autorizado a Dados (IDOR, BOLA)
```bash
# 1. Identificar dados expostos (query audit_log)
sqlite3 $DB "SELECT * FROM audit_log WHERE eventType='SHARE_ACCESS' AND result='success' AND userId != ownerId;"

# 2. Quantificar impacto (quantos usuários, quais shares)
# 3. Notificar titulares se dados pessoais (LGPD 48h)
# 4. Aplicar fix no código + deploy
# 5. Revisar todos guards (ShareOwnerGuard, StrictShareOwnerGuard)
```

### 6.3 Ransomware / Criptografia de Volumes
```bash
# 1. ISOLAR IMEDIATAMENTE (rede + parar containers)
docker compose down
# 2. Snapshot forense dos volumes ANTES de qualquer ação
aws ec2 create-snapshot --volume-id vol-xxx --description "FORENSIC-RANSOMWARE-$(date +%s)"
# 3. NÃO PAGUE RESGATE
# 4. Restaurar de backup offsite (testado!)
./scripts/backup/restore.sh all latest
# 5. Investigar vetor inicial (phishing, vuln, credencial)
# 6. Hardening completo antes de voltar online
```

### 6.4 Certificado TLS Expirado / Comprometido
```bash
# Caddy auto-renova, mas se falhar:
# 1. Verificar logs Caddy
docker logs controle-share-videos-caddy | grep -i tls

# 2. Forçar renovação manual
docker exec controle-share-videos-caddy caddy run --config /etc/caddy/Caddyfile --force-renewal

# 3. Se chave privada comprometida:
#    - Revogar certificado (Let's Encrypt: certbot revoke)
#    - Gerar nova chave + CSR
#    - Solicitar novo certificado
#    - Atualizar Caddy + reload
```

---

## 7. Checklists de Prontidão

### 7.1 Diário (Automatizado via Cron)
- [ ] Backup offsite completou com sucesso (verificar logs)
- [ ] Alertas Prometheus ativos (nenhum "firing" não resolvido > 1h)
- [ ] Certificados válidos > 30 dias
- [ ] Espaço em disco < 80%

### 7.2 Semanal
- [ ] Revisar logs de auditoria (anomalias)
- [ ] Verificar restore de backup (sample mensal)
- [ ] Atualizar dependências (npm audit)
- [ ] Revisar access logs (top IPs, 4xx/5xx)

### 7.3 Mensal
- [ ] Tabletop exercise (15 min)
- [ ] Revisar runbook (atualizar contatos, comandos)
- [ ] Testar rotação de segredos
- [ ] Verificar MFA Delete no bucket backup

### 7.4 Trimestral
- [ ] DR Drill completo (restore em env limpo)
- [ ] Pen test interno (OWASP ZAP)
- [ ] Revisar matriz de classificação de incidentes
- [ ] Atualizar contatos de escalação

---

## 8. Anexos

### 8.1 Contatos de Emergência
| Serviço | Contato | SLA |
|---------|---------|-----|
| AWS Support | Enterprise: 15min / Business: 1h | Per contract |
| Let's Encrypt | Automated (no direct support) | N/A |
| Provedor SMTP | Per contract | Per contract |
| Autoridade LGPD (ANPD) | https://www.gov.br/anpd | 48h para notificação |

### 8.2 Ferramentas de Investigação
```bash
# Análise de logs SQLite
sqlite3 $DB "SELECT * FROM audit_log WHERE eventType='LOGIN_FAILURE' GROUP BY ipAddress HAVING COUNT(*) > 10;"

# Buscar IPs suspeitos
grep -r "192.168.1.100" /var/log/nginx/ /opt/app/backend/logs/

# Verificar integridade de arquivos (sha256)
find /opt/app/backend/data/uploads -type f -exec sha256sum {} \; > current_hashes.txt
diff baseline_hashes.txt current_hashes.txt
```

### 8.3 Referências
- NIST SP 800-61 Rev. 2 - Computer Security Incident Handling Guide
- LGPD Lei 13.709/2018 - Art. 48 (Notificação de incidente)
- OWASP Incident Response Playbook
- CISA Incident Response Playbooks

---

## 9. Histórico de Versões

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-08-21 | Security Lead | Versão inicial |

---

**APROVAÇÃO:**
- Security Lead: _________________ Data: ____/____/____
- Tech Lead: _____________________ Data: ____/____/____
- CTO: ___________________________ Data: ____/____/____