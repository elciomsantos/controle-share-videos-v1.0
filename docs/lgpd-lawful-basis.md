# LGPD Lawful Basis Mapping
**Versão:** 1.0  
**Data:** 2026-08-21  
**Responsável:** Legal/DPO + Security Lead  
**Base Legal:** LGPD Art. 7, Art. 11 (dados sensíveis)

---

## Mapeamento de Atividades de Processamento

| # | Atividade | Descrição | Dados Envolvidos | Base Legal Principal (Art. 7) | Base Legal Sensíveis (Art. 11) | Finalidade Específica | Compartilhamento | Retenção | Medidas de Segurança |
|---|-----------|-----------|------------------|-------------------------------|-------------------------------|----------------------|------------------|----------|---------------------|
| 1 | **Registro de Usuário (Sign Up)** | Criação de conta via email/username/senha | Email, Username, Password hash, Activation token | **Consentimento (I)** + **Contrato (V)** | - | Criar identidade digital, permitir login | Interno | 7 anos pós-inativação | Argon2id, TLS, Rate limit, Email verification |
| 2 | **Autenticação (Login)** | Verificação credenciais + emissão sessão | Email/Username, Password, TOTP (se MFA), IP, UA | **Contrato (V)** + **Legítimo Interesse (IX)** | **Obrigação Legal - Segurança (Art. 11, II-a)** | Autenticar usuário, criar sessão segura | Interno | Sessão: config `sessionDuration` + `sessionIdleTimeout` | Argon2id verify, Rate limit, JWT opaco, TLS, CSRF |
| 3 | **Autenticação MFA (TOTP)** | Verificação código TOTP / Recovery code | TOTP secret (hash), Recovery codes (hash), IP, UA | **Legítimo Interesse (IX)** | **Obrigação Legal - Segurança (Art. 11, II-a)** | Segundo fator, proteção conta | Interno | TOTP secret: até desabilitar MFA; Recovery codes: uso único | SHA-256 hash, Single-use recovery codes, TLS |
| 4 | **Recuperação de Senha** | Solicitação + reset via token email | Email, Reset token (hash), IP, UA | **Legítimo Interesse (IX)** + **Consentimento (I)** | - | Permitir recuperação acesso legítimo | SMTP (envio email) | Token: 1 hora | Token hash SHA-256, Expiração curta, Single-use, TLS |
| 5 | **Criação de Share** | Upload arquivos + configuração share | Arquivos (nome, conteúdo, metadados), Share config (senha, expiração), Destinatários | **Consentimento (I)** + **Contrato (V)** | - | Compartilhamento controlado de arquivos | Destinatários (email), Auditoria interna | Config `fileRetentionPeriod` | Magic bytes validation, Ext allowlist, Senha share (Argon2), TLS |
| 6 | **Acesso/Download de Share** | Acesso público/protegido + download arquivos | Arquivos, Share token (hash), IP, UA, Referer, Destinatário | **Consentimento (I)** + **Contrato (V)** + **Legítimo Interesse (IX)** | - | Entregar arquivos aos destinatários autorizados | Destinatários + Criador (notificação) | Logs: config `downloadLogRetentionDays` | Token opaco SHA-256, Rate limit, Range requests, TLS |
| 6 | **Notificações por Email** | Envio emails (verificação, reset, convites, downloads) | Email, Nome, Conteúdo template, IP (headers) | **Consentimento (I)** + **Contrato (V)** + **Legítimo Interesse (IX)** | - | Comunicação transacional/operacional | Provedor SMTP externo | Metadados email: 1 ano | TLS (SMTP), Template sem PII sensível, Unsubscribe link |
| 7 | **Auditoria e Logs de Segurança** | Registro eventos: login, acesso, admin, downloads, erros | User ID, Session ID, Event type, IP, UA, Resource, Result, Request ID, Metadata | **Obrigação Legal (II)** + **Legítimo Interesse (IX)** | **Obrigação Legal - Segurança (Art. 11, II-a)** | Rastreabilidade, compliance, detecção anomalias, forense | Interno (admin) | **7 anos** (Art. 16 LGPD) | WORM storage, Hash chaining, TLS, Criptografia repouso, Acesso restrito admin |
| 8 | **Administração de Usuários** | CRUD usuários, roles, quotas, suspensão | User data (email, username, role, isAdmin, quota), Admin actor ID | **Legítimo Interesse (IX)** + **Contrato (V)** | - | Gestão identidades e acessos | Interno (admin) | 7 anos pós-inativação | RBAC (admin only), Audit log, TLS, MFA obrigatório admin |
| 9 | **Configuração do Sistema** | Gestão configs (SMTP, tema, limites, retenção) | Config values (podem conter secrets), Admin actor ID | **Legítimo Interesse (IX)** | - | Operação e tuning do sistema | Interno (admin) | 7 anos | RBAC (admin only), Secrets em .env/KMS, Audit log, TLS |
| 10 | **Monitoramento e Métricas** | Coleta métricas: latency, errors, throughput, disk, certs | Métricas agregadas (sem PII), Cert expiry, Alertas | **Legítimo Interesse (IX)** | - | Observabilidade, alerta, capacity planning | Prometheus/Grafana/Alertmanager | 90 dias (métricas), 7 anos (alertas) | TLS, Sem PII em métricas, Acesso restrito |
| 11 | **Backup e Disaster Recovery** | Backup automatizado DB + arquivos + restore test | DB completo (todos dados), Arquivos, Configs | **Obrigação Legal (II)** + **Legítimo Interesse (IX)** | **Obrigação Legal (Art. 11, II-a)** | Continuidade, recuperação, compliance | S3/GCS (encrypted), KMS | Conforme retenção dados originais | AES-256 (SSE-KMS), MFA Delete, Object Lock, Restore testado |
| 12 | **Gestão de Certificados TLS** | Renovação Let's Encrypt, monitoramento expiração | Domínio, Certificado, Chave privada, Email ACME | **Obrigação Legal (II)** + **Legítimo Interesse (IX)** | - | Disponibilidade HTTPS, confiança | Let's Encrypt (ACME), DNS | Cert: 90 dias; Chave: rotação anual | Private key em memória, HSTS, OCSP Stapling |
| 13 | **Atendimento Direitos Titular (DSR)** | Exportação/Exclusão dados por solicitação | Todos dados do titular (conforme Art. 18 LGPD) | **Obrigação Legal (II)** - **Direito do Titular (Art. 18)** | **Obrigação Legal (Art. 11, II-a)** | Cumprir Art. 18 LGPD (acesso, retificação, eliminação, portabilidade) | Titular (export) | Conforme solicitação + log auditoria 7 anos | Verificação identidade (MFA), Log auditoria, TLS, Criptografia export |

---

## Resumo de Bases Legais por Artigo

| Art. 7 LGPD | Descrição | Atividades Aplicáveis |
|-------------|-----------|----------------------|
| **I - Consentimento** | Manifestação livre, informada, inequívoca | 1, 5, 6, 13 |
| **II - Obrigação Legal** | Cumprimento obrigação legal/regulatória | 3, 7, 11, 13 |
| **III - Política Pública** | Execução política pública | - |
| **IV - Pesquisa** | Realização estudos por órgão pesquisa | - |
| **V - Contrato** | Execução contrato/procedimentos pré-contratuais | 1, 2, 5, 6, 8 |
| **VI - Exercício Regular** | Exercício direito em processo judicial/admin | - |
| **VII - Vida** | Proteção vida/integridade física | - |
| **VIII - Tutela Saúde** | Tutela saúde, por profissionais saúde | - |
| **IX - Legítimo Interesse** | Interesses legítimos controlador/terceiros | 2, 3, 4, 6, 7, 8, 9, 10, 11, 12 |

| Art. 11 LGPD (Dados Sensíveis) | Descrição | Atividades Aplicáveis |
|-------------------------------|-----------|----------------------|
| **I - Consentimento Específico** | Consentimento específico e destacado | - (não usado para TOTP - usamos II-a) |
| **II-a - Obrigação Legal** | Cumprimento obrigação legal/regulatória | **2, 3, 11, 13** |
| **II-b - Tratamento Compartilhado** | Tratamento compartilhado para execução políticas públicas | - |
| **II-c - Proteção Vida** | Proteção vida/integridade física | - |
| **II-d - Tutela Saúde** | Tutela saúde, por profissionais saúde | - |
| **II-e - Prevenção Fraude** | Prevenção fraude/segurança do titular | **2, 3** (MFA como segurança) |

---

## Testes de Proporcionalidade e Necessidade (LIA - Legitimate Interest Assessment)

### Atividade 2: Autenticação (Base: Legítimo Interesse)
| Critério | Avaliação |
|----------|-----------|
| **Finalidade Legítima** | Segurança da conta, prevenção acesso não autorizado |
| **Necessidade** | Essencial - sem autenticação não há controle de acesso |
| **Proporcionalidade** | Mínimo necessário (email/username + password + opcional TOTP) |
| **Balanceamento** | Benefício segurança > impacto privacidade (dados mínimos) |
| **Salvaguardas** | Argon2id, Rate limit, TLS, MFA opcional/obrigatório admin, Audit log |
| **Direitos Titular** | Acesso, retificação, eliminação, oposição (Art. 18) |

### Atividade 3: MFA TOTP (Base: Obrigação Legal + Legítimo Interesse)
| Critério | Avaliação |
|----------|-----------|
| **Finalidade Legítima** | Segundo fator - segurança reforçada, prevenção account takeover |
| **Necessidade** | Recomendado por normas segurança (NIST, OWASP), obrigatório admin |
| **Proporcionalidade** | Apenas secret hash + recovery codes hash (mínimo) |
| **Balanceamento** | Segurança significativa > pequeno armazenamento hash |
| **Salvaguardas** | Hash SHA-256, Recovery codes single-use, TLS, DPIA concluída |
| **Direitos Titular** | Pode desabilitar (exceto admin), exportar secret, eliminação |

### Atividade 7: Auditoria (Base: Obrigação Legal + Legítimo Interesse)
| Critério | Avaliação |
|----------|-----------|
| **Finalidade Legítima** | Compliance LGPD Art. 16, segurança, forense, accountability |
| **Necessidade** | Obrigatório por lei - accountability principle |
| **Proporcionalidade** | Apenas metadados necessários (sem conteúdo arquivos/senhas) |
| **Balanceamento** | Retenção 7 anos (mínimo legal) vs necessidade investigação |
| **Salvaguardas** | WORM storage, Hash chaining, Criptografia, Acesso admin only, DPIA |
| **Direitos Titular** | Acesso aos próprios logs, retificação se incorreto, oposição limitada (obrigação legal) |

---

## Registro de Operações de Tratamento (ROP) - Art. 37 LGPD

### Formato Resumido para Preenchimento

| Campo | Preenchimento |
|-------|---------------|
| **Controlador** | [Nome da organização], CNPJ [XX.XXX.XXX/XXXX-XX], Endereço [Completo], Email [dpo@empresa.com] |
| **Encarregado (DPO)** | [Nome], Email [dpo@empresa.com], Telefone [+55 XX XXXXX-XXXX] |
| **Finalidades** | Ver tabela "Atividades" acima (13 finalidades) |
| **Categorias Titulares** | Usuários registrados, Destinatários shares, Administradores |
| **Categorias Dados** | Ver matriz classificação (Pessoal, Sensível, Pseudonimizado, Anonimizado) |
| **Categorias Destinatários** | Interno (backend, frontend, admin, devops), Externo (SMTP, S3/GCS, Let's Encrypt, DNS, GitHub) |
| **Transferência Internacional** | [Sim/Não] - Se sim: país, mecanismo (SCC, BCR, decisão adequação) |
| **Retenção** | Ver coluna "Retenção" por atividade |
| **Medidas Segurança** | Ver coluna "Medidas de Segurança" + WORM, Criptografia, RBAC, MFA, TLS, Rate Limit |
| **DPIA** | Concluída para: TOTP secret, Metadados arquivo, Auditoria. Pendente: DSR endpoint. |

---

## Checklist de Conformidade por Atividade

### Para CADA atividade acima, validar:

#### Base Legal
- [ ] Base legal Art. 7 identificada e documentada
- [ ] Se dado sensível: base Art. 11 identificada
- [ ] Consentimento: livre, informado, inequívoco, específico (se aplicável)
- [ ] Legítimo Interesse: LIA documentado (finalidade, necessidade, proporcionalidade, salvaguardas)

#### Princípios (Art. 6)
- [ ] **Finalidade:** Específica, legítima, explícita
- [ ] **Adequação:** Compatível com finalidade informada
- [ ] **Necessidade:** Mínimo necessário para finalidade
- [ ] **Livre Acesso:** Titular pode consultar (DSR endpoint)
- [ ] **Qualidade:** Dados exatos, atualizados, relevantes
- [ ] **Transparência:** Info clara sobre tratamento (Política Privacidade)
- [ ] **Segurança:** Medidas técnicas/organizacionais (ver coluna)
- [ ] **Prevenção:** Medidas para evitar incidentes (ver coluna)
- [ ] **Não Discriminação:** Tratamento não discriminatório
- [ ] **Responsabilização:** Documentação, DPIA, ROP, Encarregado

#### Direitos do Titular (Art. 18)
- [ ] **Confirmação/Existe:** DSR endpoint retorna se trata dados
- [ ] **Acesso:** DSR export retorna todos dados do titular
- [ ] **Retificação:** Admin pode corrigir / Titular pode solicitar
- [ ] **Anonimização/Bloqueio/Eliminação:** DSR delete + anonimização logs
- [ ] **Portabilidade:** DSR export em formato estruturado (JSON/CSV)
- [ ] **Eliminação:** DSR delete + backup retention respected
- [ ] **Informação Compartilhamento:** ROP documenta destinatários
- [ ] **Revogação Consentimento:** Se base consentimento - fácil revogação
- [ ] **Oposição:** Se base legítimo interesse - direito oposição
- [ ] **Revisão Decisão Automatizada:** Se houver - direito revisão humana

---

## Próximos Passos (Action Items)

| Item | Responsável | Prazo | Status |
|------|-------------|-------|--------|
| Legal revisar e aprovar bases legais por atividade | Legal/DPO | 2026-09-01 | ☐ |
| Security implementar DSR endpoint (`/api/privacy/dsr`) | Backend Lead | 2026-09-15 | ☐ |
| Security completar DPIA para TOTP secret + Metadados arquivo | Security Lead | 2026-09-15 | ☐ |
| Legal elaborar Política de Privacidade (Art. 9) | Legal | 2026-09-01 | ☐ |
| Legal elaborar Termo de Consentimento (se base consentimento) | Legal | 2026-09-01 | ☐ |
| DevOps habilitar WORM no bucket backup + Object Lock | DevOps | 2026-09-01 | ☐ |
| Security registrar ROP completo (Art. 37) | Security Lead | 2026-09-15 | ☐ |
| Treinamento equipe em LGPD (direitos titular, DSR, breach) | Security + Legal | 2026-09-30 | ☐ |