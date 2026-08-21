# Postmortem Template (Blameless)

**Incidente:** [Título/ID - ex: INC-2026-001]  
**Data do Incidente:** [ISO 8601 início] → [ISO 8601 fim]  
**Severidade:** SEV-[1/2/3]  
**Autor do Postmortem:** [Nome]  
**Data do Postmortem:** [ISO 8601]  
**Participantes:** [Lista de nomes + papéis]

---

## 1. Resumo Executivo (TL;DR)
> **Máximo 3 frases.** O que aconteceu, impacto no usuário/negócio, causa raiz, ação principal.

---

## 2. Timeline Detalhada

| Horário (UTC) | Evento | Ação Tomada | Responsável | Fonte |
|---------------|--------|-------------|-------------|-------|
| 2026-08-21T10:15:00Z | Alert Prometheus: auth failures > 10/min | IC notificado via PagerDuty | - | Alertmanager |
| 2026-08-21T10:17:00Z | IC assume comando, cria issue #XXX | IC | Slack #sec-incidents |
| 2026-08-21T10:20:00Z | TL inicia investigação logs | TL | Audit logs |
| ... | ... | ... | ... | ... |

---

## 3. Impacto

### 3.1 Impacto no Usuário
- **Usuários afetados:** [Número/%]
- **Funcionalidades indisponíveis:** [Lista]
- **Dados expostos/comprometidos:** [Sim/Não - detalhar se sim]
- **Duração da indisponibilidade:** [Xh Ym]

### 3.2 Impacto no Negócio
- **Receita perdida:** [Se aplicável]
- **SLA violado:** [Quais]
- **Reputação:** [Baixa/Média/Alta]
- **LGPD/Compliance:** [Notificação necessária? Prazo?]

---

## 4. Causa Raiz (Root Cause Analysis)

### 4.1 Método Utilizado
- [ ] 5 Whys
- [ ] Fishbone / Ishikawa
- [ ] Fault Tree Analysis
- [ ] Outro: __________

### 4.2 Cadeia Causal
```
Causa Raiz (Por que?)
  ↓
Causa Contribuinte 1
  ↓
Causa Contribuinte 2
  ↓
Falha Imediata (O que falhou?)
  ↓
Sintoma Observado (Alert/Report)
```

### 4.3 Descrição da Causa Raiz
> **Exemplo:** "A rotação automática do segredo JWT falhou silenciosamente porque o cron job não tinha permissão de escrita no volume do Kubernetes. O segredo expirou sem que um novo fosse gerado, causando falha de autenticação em cascata."

---

## 5. O que Funcionou Bem
- [ ] Detecção rápida via alerta
- [ ] Runbook seguido corretamente
- [ ] Comunicação clara entre IC/TL/CL
- [ ] Backup/restore funcionou
- [ ] Contenção eficaz
- [ ] Outro: __________

---

## 6. O que NÃO Funcionou / Gaps
- [ ] Alerta não disparou / atrasou
- [ ] Runbook desatualizado / incompleto
- [ ] Falta de runbook para este cenário
- [ ] Comunicação confusa / atrasada
- [ ] Permissões insuficientes para contenção
- [ ] Backup não testado recentemente
- [ ] Dependência externa sem SLA claro
- [ ] Outro: __________

---

## 7. Ações Corretivas (Action Items)

| # | Ação | Descrição Detalhada | Owner | Prazo | Prioridade | Issue GitHub |
|---|------|---------------------|-------|-------|------------|--------------|
| 1 | Fix imediato | [O que] | [Quem] | [Data] | CRITICAL | #[num] |
| 2 | Prevenção recorrência | [O que] | [Quem] | [Data] | HIGH | #[num] |
| 3 | Melhoria detecção | [O que] | [Quem] | [Data] | MEDIUM | #[num] |
| 4 | Atualização runbook | [O que] | [Quem] | [Data] | MEDIUM | #[num] |
| 5 | Treinamento/Drill | [O que] | [Quem] | [Data] | LOW | #[num] |

> **Regra:** Cada ação DEVE ter issue no GitHub com label `postmortem-action` + milestone da fase correspondente.

---

## 8. Métricas do Incidente

| Métrica | Valor |
|---------|-------|
| **MTTD** (Mean Time to Detect) | [Minutos/Horas] |
| **MTTA** (Mean Time to Acknowledge) | [Minutos] |
| **MTTC** (Mean Time to Contain) | [Minutos/Horas] |
| **MTTR** (Mean Time to Resolve/Recover) | [Horas] |
| **Total Downtime** | [Horas:Minutos] |
| **Usuários Impactados** | [Número] |

---

## 9. Follow-up

- [ ] Action items criados no GitHub (label `postmortem-action`, owner + due date)
- [ ] Runbook atualizado (se aplicável)
- [ ] Alertas ajustados (se aplicável)
- [ ] Treinamento agendado (se aplicável)
- [ ] Próxima revisão: [Data - 30 dias após fechamento último action item]

---

## 10. Anexos
- [ ] Logs relevantes (anexar ou link S3)
- [ ] Screenshots de dashboards/alertas
- [ ] Commits/PRs relacionados
- [ ] Comunicações externas (emails, tickets suporte)

### 10.1 Evidências Forenses (SEC-4.6)

| Artefato | Localização | Hash MANIFEST | Custody Log |
|----------|-------------|---------------|-------------|
| Snapshot completo | `s3://…/evidence/INC-XXX_data/` | `[primeiros 16 chars]` | Transferência nº |
| Export de auditoria | [caminho] | [hash] | Transferência nº |

> Procedimento de custódia: `docs/forensics.md`. Evidências analisadas **apenas sobre cópias**;
> originais permanecem no repositório imutável até encerramento legal.

---

**APROVAÇÃO DO POSTMORTEM:**
- IC: _________________ Data: ____/____/____
- TL: _________________ Data: ____/____/____
- Security Lead: _______ Data: ____/____/____