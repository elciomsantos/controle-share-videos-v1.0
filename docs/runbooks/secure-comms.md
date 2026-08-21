# Secure Communications Protocol for Incident Response

**Versão:** 1.0  
**Classificação:** CONFIDENCIAL - Acesso restrito a equipe de IR

---

## 1. Princípios

1. **Need-to-know:** Apenas participantes ativos do incidente têm acesso
2. **Criptografia obrigatória:** Toda comunicação sensível deve ser criptografada
3. **Não-repúdio:** Assinaturas digitais para decisões críticas
4. **Retenção:** Comunicações de incidente retidas por 7 anos (auditoria)

---

## 2. Canais por Classificação

| Classificação | Canal | Criptografia | Exemplo de Uso |
|---------------|-------|--------------|----------------|
| **PÚBLICO** | Slack #general, Email corporativo | TLS apenas | Status page updates, comunicados usuários |
| **INTERNO** | Slack #sec-incidents-public | TLS + E2E (Slack EKM) | Coordenação equipe, updates gerais |
| **CONFIDENCIAL** | Slack #sec-incidents (privado) | TLS + E2E + PGP para arquivos | Evidências, credenciais, IPs, PII |
| **RESTRITO** | Email PGP + Keybase/Signal | PGP (AES-256) + Forward Secrecy | Chaves privadas, segredos, decisões exec |

---

## 3. Infraestrutura de Chaves

### 3.1 PGP Keys da Equipe
| Papel | Nome | Key ID | Fingerprint | Keybase |
|-------|------|--------|-------------|---------|
| Security Lead | [Nome] | 0xABCD1234 | XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX | @security-lead |
| Backend Lead | [Nome] | 0xEFGH5678 | XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX | @backend-lead |
| DevOps | [Nome] | 0xIJKL9012 | XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX | @devops |
| Tech Lead | [Nome] | 0xMNOP3456 | XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX | @tech-lead |
| CTO | [Nome] | 0xQRST7890 | XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX | @cto |

> **Importante:** Verificar fingerprints **fora de banda** (telefone, presencial) na primeira troca.

### 3.2 Geração e Backup de Chaves
```bash
# Gerar chave PGP (se não tiver)
gpg --full-generate-key
# Tipo: RSA/RSA, 4096 bits, expira em 2 anos
# Exportar pública:
gpg --armor --export "seu@email.com" > publickey.asc
# Backup seguro da chave privada (offline, criptografado):
gpg --export-secret-keys "seu@email.com" | gpg --symmetric --cipher-algo AES256 > privatekey_backup.gpg
```

### 3.3 Rotação de Chaves
- **Frequência:** Anual ou após incidente SEV-1 envolvendo credenciais
- **Processo:** Gerar nova → Assinar com antiga → Publicar → Revogar antiga após 30 dias
- **Emergência:** Revogação imediata via servidor de chaves + notificação equipe

---

## 4. Procedimentos de Comunicação

### 4.1 Início de Incidente (SEV-1/2)
```bash
# 1. IC cria tópico criptografado no Slack #sec-incidents
# 2. Envia chave de sessão PGP para participantes:
gpg --encrypt --recipient "security@empresa.com" \
    --recipient "backend@empresa.com" \
    --recipient "devops@empresa.com" \
    --armor --output session_key.asc <<EOF
SESSION_KEY: $(openssl rand -base64 32)
INCIDENT_ID: INC-$(date +%Y%m%d-%H%M)
EOF

# 3. Todos confirmam recebimento e descriptografia
```

### 4.2 Compartilhamento de Evidências Sensíveis
```bash
# Arquivo com credenciais, IPs, PII, etc.
# 1. Comprimir + criptografar com chave de sessão
tar -czf - evidencia/ | gpg --symmetric --cipher-algo AES256 --output evidencia.tar.gz.gpg

# 2. Ou criptografar para múltiplos destinatários
gpg --encrypt --recipient "security@empresa.com" \
    --recipient "backend@empresa.com" \
    --armor --output evidencia.asc evidencia.txt

# 3. Enviar via Slack DM ou email (anexo .asc/.gpg)
# 4. NUNCA colar segredos em texto plano no Slack/email
```

### 4.3 Assinatura de Decisões Críticas
```bash
# Decisões: "Autorizo rollback produção", "Notifico ANPD", "Pago resgate (NÃO)"
# 1. Documentar decisão em arquivo texto
cat > decisao_$(date +%s).txt <<EOF
INCIDENT: INC-20260821-001
DECISION: Rollback database to backup 20260820_020000
REASON: Ransomware encryption detected on primary volume
AUTHORIZED_BY: CTO
TIMESTAMP: $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

# 2. Assinar digitalmente
gpg --clearsign --armor decisao_$(date +%s).txt

# 3. Arquivar .asc no repositório de evidências do incidente
```

---

## 5. Ferramentas Aprovadas

| Finalidade | Ferramenta | Configuração |
|------------|------------|--------------|
| Chat em tempo real | Slack (Enterprise Grid) | EKM habilitado, retention 7 anos |
| Email criptografado | GnuPG + Thunderbird/Outlook | Enigmail / GpgOL |
| Mensagens efêmeras | Signal (Desktop) | Disappearing messages: 1h |
| Compartilhamento arquivos | Magic-Wormhole / age | `wormhole send arquivo.gpg` |
| Armazenamento evidências | S3 com SSE-KMS + Object Lock | WORM, retenção 7 anos |
| Videoconferência | Jitsi Meet (self-hosted) | E2E encrypt, gravação opcional |

### 5.1 Configuração Rápida - GnuPG
```bash
# ~/.gnupg/gpg.conf
default-key 0xABCD1234
keyserver hkps://keys.openpgp.org
keyserver-options auto-key-retrieve=no
require-cross-certification
personal-cipher-preferences AES256 AES192 AES CAMELLIA256
personal-digest-preferences SHA512 SHA384 SHA256
cert-digest-algo SHA512
default-preference-list SHA512 SHA384 SHA256 AES256 AES192 AES CAMELLIA256
```

---

## 6. Procedimentos de Emergência

### 6.1 Comprometimento de Canal
```bash
# Se Slack/Email comprometido:
# 1. Mover comunicação para Signal/Keybase (out-of-band)
# 2. Rotacionar chaves PGP da equipe afetada
# 3. Revogar tokens Slack/API comprometidos
# 4. Notificar equipe via canal alternativo verificado
```

### 6.2 Perda de Chave Privada
```bash
# 1. Revogar certificado imediatamente
gpg --gen-revoke 0xABCD1234 > revoke_cert.asc
gpg --import revoke_cert.asc
gpg --send-keys 0xABCD1234  # Enviar para keyserver

# 2. Gerar nova chave
gpg --full-generate-key

# 3. Assinar nova chave com chave de colega (web of trust)
# 4. Distribuir nova chave pública
```

---

## 7. Verificação de Identidade (Out-of-Band)

**SEMPRE verificar identidade antes de compartilhar segredos:**

| Método | Como Fazer |
|--------|------------|
| **Telefone/Video** | Ligar para número conhecido, confirmar fingerprint PGP |
| **Presencial** | Encontro físico, comparar fingerprint impresso |
| **Signal Safety Number** | Comparar Safety Number no app |
| **Keybase** | Verificar proofs (GitHub, Twitter, site) |

> **Regra:** Nunca confiar em chave recebida apenas por email/Slack sem verificação out-of-band.

---

## 8. Retenção e Destruição

| Tipo de Comunicação | Retenção | Destruição |
|---------------------|----------|------------|
| Slack #sec-incidents | 7 anos (policy) | Auto-expire |
| Emails PGP | 7 anos | `gpg --shred` anexos |
| Arquivos evidência | 7 anos (WORM S3) | Legal hold → shred |
| Chaves de sessão | 30 dias pós-incidente | `shred -n 3` |
| Decisões assinadas | Permanente (arquivo) | N/A |

---

## 9. Treinamento e Testes

| Atividade | Frequência | Responsável |
|-----------|------------|-------------|
| Workshop PGP (gerar, assinar, criptografar) | Semestral | Security Lead |
| Drill comunicação IR (simulado) | Trimestral | IC |
| Verificação fingerprints | Anual | Todos |
| Teste restore backup criptografado | Mensal | DevOps |

---

## 10. Checklist Rápido (Laminado para Mesa)

```
☐ Canal correto para classificação?
☐ Destinatários verificados (fingerprint)?
☐ Arquivo criptografado antes de enviar?
☐ Assinatura digital em decisões críticas?
☐ Evidência arquivada em S3 WORM?
☐ Chave de sessão destruída pós-incidente?
☐ Log de comunicação salvo no incidente?
```

---

**APROVAÇÃO:**
- Security Lead: _________________ Data: ____/____/____
- CTO: ___________________________ Data: ____/____/____