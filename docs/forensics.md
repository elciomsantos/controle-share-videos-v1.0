# Preservação de Evidências & Chain of Custody

**Versão:** 1.0  
**Data:** 2026-08-21  
**Owner:** Security Lead + Backend Lead  
**Integração:** `docs/runbooks/incident-response.md` (Fase 1 — Detecção, §5.3)

---

## 1. Objetivo

Padronizar a captura, custódia e análise de evidências digitais durante e após
incidentes de segurança (SEV-1/2), garantindo:

- **Integridade** — evidências não podem ser alteradas sem detecção (hashes SHA-256).
- **Rastreabilidade** — toda transferência/acesso registrado no Custody Log.
- **Admissibilidade** — cadeia de custódia válida para fins legais/LGPD.

> **Regra de ouro:** em incidente ativo, capture o estado volátil ANTES da contenção.
> Desligar/reiniciar destrói memória, conexões ativas e timestamps.

---

## 2. Ferramenta Padrão

`scripts/incident/forensic-snapshot.sh` — executa no host Docker:

```bash
sudo ./scripts/incident/forensic-snapshot.sh \
  --incident INC-2026-001 \
  --output /var/evidence \
  --upload          # opcional: envia para bucket imutável ($EVIDENCE_BUCKET)
```

### O que é capturado (ordem de prioridade)

| # | Categoria | Conteúdo | Por quê primeiro |
|---|-----------|----------|------------------|
| 1 | Volátil | processos, sockets, interfaces, logins, `docker inspect/logs/top`, crontab | Perde-se no reboot |
| 2 | Database | SQLite `.backup` consistente (+ WAL/SHM se sqlite3 ausente) | Estado dos dados/sessões/auditoria |
| 3 | Volumes | tar de `uploads/` com timestamps/permissões preservados | Arquivos compartilhados |
| 4 | Manifest | `MANIFEST.sha256` + `manifest.json` (hashes + metadados) | Baseline de integridade |

---

## 3. Procedimento de Cadeia de Custódia

### 3.1 Coleta

1. Disparar snapshot via script acima **imediatamente** após classificar SEV-1/2
   (runbook IR, Fase 1).
2. Registrar na issue do incidente: caminho do diretório, hash do `MANIFEST.sha256`,
   horário UTC e operador.
3. Se envolver disco físico/mídia: usar write-blocker; nunca montar rw a mídia original.

### 3.2 Transferência

- Copiar apenas sobre mídia somente leitura ou repositório imutável
  (bucket S3/GCS com Object Versioning + retenção legal/WORM).
- Verificar hashes no destino: `cd <destino> && sha256sum -c MANIFEST.sha256`.
- Registrar cada transferência no Custody Log (abaixo).

### 3.3 Armazenamento

| Item | Requisito |
|------|-----------|
| Local primário | Bucket imutável (`evidence/`), criptografado SSE-KMS |
| Acesso | Role dedicada "Evidence Keeper" — separada da role de app |
| Retenção | Mínimo até fechamento legal do incidente; LGPD: conforme orientação jurídica |
| Permissão de delete | Negada ao app e aos admins operacionais |

### 3.4 Análise

- Analisar **apenas cópias** — nunca os artefatos originais.
- Documentar ferramentas usadas, versões e comandos no postmortem
  (`docs/runbooks/postmortem-template.md`, seção Evidências).

---

## 4. Custody Log (template)

Registrar por evidência/diretório:

```markdown
## Chain of Custody — INC-2026-001

| # | Data/Hora (UTC) | Ação | Responsável | De → Para | Hash MANIFEST |
|---|-----------------|------|-------------|-----------|---------------|
| 1 | 2026-08-21T14:05Z | Coleta inicial (snapshot.sh) | alice | host-prod → /var/evidence | abc123... |
| 2 | 2026-08-21T14:20Z | Upload bucket imutável | alice | /var/evidence → s3://…/evidence/ | abc123... |
| 3 | 2026-08-21T16:00Z | Cópia p/ análise | bob | s3://…/evidence/ → workstation-análise | abc123... (verificado ✅) |
```

---

## 5. Checklist Rápido (SEV-1)

- [ ] Snapshot forense executado ANTES da contenção (`--incident`)
- [ ] `sha256sum -c MANIFEST.sha256` passou no destino
- [ ] Issue do incidente atualizada com caminho + hash + horário
- [ ] Custody Log iniciado (transferência nº 1)
- [ ] Artefatos originais intactos (nada foi editado)
- [ ] Postmortem referenciará as evidências coletadas

---

## Arquivos Relacionados

- Script: `scripts/incident/forensic-snapshot.sh`
- Runbook IR: `docs/runbooks/incident-response.md`
- Template postmortem: `docs/runbooks/postmortem-template.md`
- Backups (rotina): `scripts/backup/`
