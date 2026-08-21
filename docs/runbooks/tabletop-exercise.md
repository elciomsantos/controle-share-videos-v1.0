# Tabletop Exercise - Incident Response
**Exercício de Mesa de Resposta a Incidentes**  
**Frequência:** Trimestral (15-30 min)  
**Participantes:** IC, TL, CL, Forensics, DevOps, Stakeholders opcionais

---

## Objetivo
Validar o runbook de IR, identificar gaps no processo, treinar a equipe em cenários realistas sem impacto em produção.

---

## Formato
1. **Apresentação do cenário** (5 min) - IC lê o cenário
2. **Discussão aberta** (15-20 min) - Equipe percorre as fases do runbook
3. **Debrief** (5 min) - O que funcionou, gaps, action items
4. **Documentação** - Registrar no template abaixo

---

## Cenários Sugeridos (Rotacionar a cada trimestre)

### Cenário A: Credencial AWS Comprometida (SEV-1)
> **Situação:** Alerta GuardDuty às 03:00: "Credencial IAM AKIA... usada de IP desconhecido (Tor exit node) para ListBuckets e GetObject em bucket de backups". Credencial tem permissão `s3:*` no bucket de backups.
>
> **Perguntas-guia:**
> 1. Qual a primeira ação do IC? (Classificação, notificação, contenção)
> 2. Como conter em < 15 min? (Delete access key, rotacionar, revogar sessões)
> 3. Qual o impacto nos backups? (Bucket comprometido - backups criptografados ajudam?)
> 4. Precisa notificar ANPD? (Art. 48 LGPD - dados pessoais nos backups?)
> 5. Como validar que backups não foram exfiltrados/excluídos?
> 6. Runbook de rotação de segredos funciona? (JWT, SMTP, DB)

### Cenário B: Ransomware no Volume de Uploads (SEV-1)
> **Situação:** Usuário relata "arquivos com extensão .locked". Logs mostram processo desconhecido criptografando `/opt/app/backend/data/uploads`. Container backend ainda responde.
>
> **Perguntas-guia:**
> 1. Ordem de contenção: parar container? isolar rede? snapshot forense primeiro?
> 2. Backup offsite existe? Último restore testado quando?
> 3. RTO real para restaurar 500GB de uploads?
> 4. Vetor inicial: phishing? vuln no upload? credencial?
> 5. Comunicação para usuários afetados (LGPD Art. 48)?
> 6. Como garantir que backup não está também criptografado?

### Cenário C: IDOR/BOLA Ativo em Produção (SEV-2)
> **Situação:** Pesquisador de segurança reporta: "Conseguindo acessar shares de outros usuários manipulando `shareId` no endpoint `/api/shares/{id}/files/{fileId}`". PoC anexado. Não há exploração em massa detectada nos logs.
>
> **Perguntas-guia:**
> 1. Classificação correta? (SEV-2 - acesso não autorizado a dados)
> 2. Contenção imediata: WAF rule? Deploy hotfix? Desabilitar endpoint?
> 3. Como quantificar exposição? (Query audit_log para acessos cross-user)
> 4. Notificar usuários afetados? (LGPD - risco alto para direitos)
> 5. Root cause: guard faltando? Teste de segurança falhou?
> 6. Como prevenir regressão? (Teste security.e2e-spec.ts)

### Cenário D: Certificado TLS Expirado (SEV-2)
> **Situação:** Monitoramento alerta "certificado expira em 2 dias". Caddy não renovou (rate limit Let's Encrypt / desafio DNS falhou). Site mostrará "Não seguro" em 48h.
>
> **Perguntas-guia:**
> 1. Runbook de certificado existe? (docs/runbooks/incident-response.md seção 6.4)
> 2. Opções: Forçar renovação Caddy? Certbot manual? Comprar certificado pago?
> 3. Impacto se expirar: HSTS preload? Clientes móveis? SEO?
> 4. Comunicação preventiva para usuários?
> 5. Como melhorar monitoramento (alertar 30 dias antes)?

### Cenário E: Vazamento de Segredo JWT no GitHub (SEV-1)
> **Situação:** Commit acidental no repo público (ou privado com acesso amplo) com `JWT_SECRET=...` no .env. Detectado por secret scanning (GitHub/GitLeaks) 2 horas após push.
>
> **Perguntas-guia:**
> 1. Rotação imediata do segredo (script rotate-jwt-secret.sh funciona?)
> 2. Revogação de TODAS as sessões ativas? (Impacto: logout forçado de todos usuários)
> 3. Histórico de segredos (jwtSecretHistory) permite transição suave?
> 4. Auditoria: quais tokens foram emitidos com segredo vazado?
> 5. Como evitar recorrência? (Pre-commit hooks, CI secret scan, .env.example only)

---

## Template de Registro do Exercício

| Campo | Preenchimento |
|-------|---------------|
| **Data** | YYYY-MM-DD |
| **Facilitador** | Nome |
| **Participantes** | Lista nomes + papéis |
| **Cenário** | A / B / C / D / E / Outro: _______ |
| **Severidade Simulada** | SEV-1 / SEV-2 / SEV-3 |
| **Duração Total** | XX min |

### Timeline do Exercício
| Minuto | Ação/Decisão | Responsável | Observação |
|--------|--------------|-------------|------------|
| 0:00 | Cenário apresentado | IC | |
| 0:05 | Classificação severidade | IC | |
| 0:10 | Contenção iniciada | TL | |
| ... | ... | ... | |

### Resultados

#### ✅ O que funcionou bem
- 
- 
- 

#### ❌ Gaps Identificados
| Gap | Severidade | Action Item | Owner | Prazo |
|-----|------------|-------------|-------|-------|
| Ex: Runbook não menciona rotação SMTP | HIGH | Atualizar seção 6.1 | Security Lead | 2026-09-15 |
| Ex: Backup health check não alerta no Slack | MEDIUM | Configurar SLACK_WEBHOOK | DevOps | 2026-09-15 |

#### 📝 Atualizações no Runbook Necessárias
- 
- 
- 

#### 🎯 Próximos Passos
| Action Item | Responsável | Prazo | Issue GitHub |
|-------------|-------------|-------|--------------|
|  |  |  |  |
|  |  |  |  |

---

## Checklist de Prontidão Pós-Exercício

- [ ] Action items criados no GitHub com label `tabletop-action`
- [ ] Runbook atualizado (versão incrementada)
- [ ] Contatos de escalação verificados
- [ ] Scripts testados (rotate-jwt-secret.sh, backup-health-check.sh, restore.sh)
- [ ] Próximo exercício agendado (trimestral)

---

## Métricas do Exercício

| Métrica | Valor |
|---------|-------|
| Tempo para classificação (SEV) | ___ min |
| Tempo para primeira contenção | ___ min |
| Tempo para identificar root cause | ___ min |
| Tempo para decisão de recuperação | ___ min |
| Número de gaps identificados | ___ |
| Participantes engajados (1-5) | ___ |

---

**Assinaturas:**
- Facilitador: _________________ Data: ____/____/____
- IC: __________________________ Data: ____/____/____
- TL: __________________________ Data: ____/____/____