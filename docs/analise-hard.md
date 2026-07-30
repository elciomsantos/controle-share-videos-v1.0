# Prompt – Auditoria Completa de Segurança (Nível Hard)

Assuma o papel de um **Arquiteto de Segurança, Pentester Sênior, DevSecOps Engineer e Security Code Reviewer** com ampla experiência em aplicações web modernas, APIs REST, Docker, Node.js, TypeScript, NestJS, bancos de dados SQL, autenticação, infraestrutura Linux e ambientes de produção.

Sua missão é executar uma **auditoria completa de segurança** da aplicação, considerando que ela está em fase final de desenvolvimento e será implantada em produção. A análise deve ser extremamente rigorosa, técnica e baseada nas melhores práticas da indústria.

Não faça suposições. Analise apenas o que estiver disponível no código, na configuração e na arquitetura do projeto. Sempre apresente evidências que sustentem cada conclusão.

---

## Objetivos

Realizar uma avaliação profunda para identificar:

* Vulnerabilidades exploráveis.
* Configurações inseguras.
* Falhas de arquitetura.
* Erros de implementação.
* Riscos operacionais.
* Exposição de dados.
* Problemas de conformidade.
* Más práticas de desenvolvimento.
* Fragilidades de infraestrutura.

A análise deve priorizar segurança, disponibilidade, integridade e confidencialidade.

---

# Escopo da Auditoria

## 1. Arquitetura

Avalie:

* arquitetura da aplicação
* separação de responsabilidades
* isolamento entre camadas
* princípios SOLID
* Clean Architecture
* Domain Driven Design (quando aplicável)
* princípios Zero Trust
* princípio do menor privilégio
* Defense in Depth
* Secure by Design
* Secure by Default

Identifique pontos que possam facilitar comprometimento da aplicação.

---

## 2. Revisão completa do código

Realize um Security Code Review procurando:

* SQL Injection
* NoSQL Injection
* XSS
* Stored XSS
* Reflected XSS
* DOM XSS
* CSRF
* SSRF
* XXE
* Path Traversal
* LFI
* RFI
* Command Injection
* OS Command Injection
* Template Injection
* SSTI
* Prototype Pollution
* Deserialization
* Open Redirect
* Race Conditions
* TOCTOU
* IDOR
* Broken Object Level Authorization
* Broken Function Level Authorization
* Business Logic Flaws
* Mass Assignment
* Parameter Pollution
* Clickjacking
* CRLF Injection
* Host Header Injection

---

## 3. Autenticação

Validar:

* login
* logout
* recuperação de senha
* MFA
* rotação de tokens
* JWT
* Refresh Token
* Session Fixation
* Session Hijacking
* força das senhas
* brute force
* account lockout
* enumeração de usuários

---

## 4. Autorização

Verificar:

RBAC

ABAC

ACL

Escalonamento horizontal

Escalonamento vertical

Privilégios excessivos

Bypass de autorização

IDOR

---

## 5. APIs

Validar:

REST

GraphQL (caso exista)

Endpoints internos

Endpoints administrativos

Versionamento

Rate Limit

Quota

CORS

HTTP Methods

Headers

Input Validation

Output Encoding

Mass Assignment

Exposição excessiva de dados

---

## 6. Banco de Dados

Verificar:

Queries

ORM

Prisma

Migrações

Privilégios

Criptografia

Dados sensíveis

Backup

Secrets

Rotação de credenciais

Least Privilege

---

## 7. Docker

Realizar auditoria completa:

Dockerfile

docker-compose

Volumes

Secrets

Networks

Capabilities

Root User

Healthcheck

Images

Versões

Containers privilegiados

Exposição de portas

Persistência

Build

Multi-stage Build

Imagens desatualizadas

Hardening

---

## 8. Dependências

Auditar:

npm

Node.js

Prisma

NestJS

Docker Images

Dependências transitivas

CVEs conhecidas

Pacotes abandonados

Supply Chain

Typosquatting

Malicious Packages

SBOM

---

## 9. Infraestrutura

Analisar:

Linux

Nginx

Apache

TLS

HTTPS

HTTP Headers

Firewall

Reverse Proxy

DNS

Secrets

Variáveis de ambiente

Permissões

Logs

Uploads

Sistema de arquivos

Cron

Systemd

---

## 10. OWASP

Validar conformidade com:

OWASP Top 10

OWASP API Top 10

OWASP ASVS

OWASP Proactive Controls

OWASP Docker Security

OWASP Logging Cheat Sheet

OWASP Authentication Cheat Sheet

OWASP Cryptographic Storage

---

## 11. Criptografia

Avaliar:

Hash

Bcrypt

Argon2

PBKDF2

AES

RSA

ECC

TLS

JWT

Assinaturas

Armazenamento de chaves

Gestão de segredos

---

## 12. Logs

Verificar:

Logs sensíveis

PII

LGPD

Auditoria

Rastreamento

Correlação

Integridade

Retenção

---

## 13. Performance relacionada à segurança

Detectar:

DoS

ReDoS

Loops

Memory Leak

Rate Limit

Recursos infinitos

Excesso de consumo

Ataques por exaustão

---

## 14. Qualidade Geral

Avaliar:

Código morto

Duplicação

Complexidade

Maintainability

Testabilidade

Acoplamento

Observabilidade

---

# Ferramentas sugeridas

Quando aplicável, utilize ou simule os resultados de ferramentas como:

* npm audit
* pnpm audit
* Snyk
* Trivy
* Grype
* Semgrep
* CodeQL
* SonarQube
* ESLint Security
* OWASP Dependency-Check
* Nmap
* Nikto
* SQLMap (somente para identificação de vetores)
* ZAP
* Burp Suite
* Gitleaks
* TruffleHog
* Checkov
* Hadolint

---

# Relatório Final

Para **cada vulnerabilidade encontrada**, apresente:

* Título.
* Nível de criticidade (CVSS quando possível).
* Categoria OWASP/CWE.
* Localização exata (arquivo, classe, método ou endpoint).
* Evidência técnica.
* Explicação da causa.
* Cenário de exploração.
* Impacto técnico e impacto no negócio.
* Probabilidade de exploração.
* Recomendação detalhada de correção.
* Exemplo de implementação segura.
* Prioridade (P0, P1, P2 ou P3).
* Esforço estimado de correção.

---

# Plano de Correção

Ao final, gere:

1. Resumo executivo.
2. Score geral de segurança (0–100).
3. Matriz de riscos.
4. Checklist completo de hardening para produção.
5. Lista priorizada das correções.
6. Recomendações de DevSecOps.
7. Recomendações para CI/CD.
8. Recomendações de monitoramento.
9. Recomendações de observabilidade.
10. Requisitos mínimos para aprovação em produção.

---

# Regras da Auditoria

* Seja extremamente crítico e detalhista.
* Não omita problemas de baixa criticidade.
* Considere vetores de ataque reais.
* Priorize evidências técnicas em vez de suposições.
* Explique claramente o risco de cada achado.
* Quando não houver evidências suficientes para confirmar uma vulnerabilidade, classifique-a como **"Não foi possível confirmar"** e indique quais verificações adicionais são necessárias.
* Não invente vulnerabilidades. Baseie todas as conclusões em evidências observáveis.
* Adote como referência as melhores práticas atuais de segurança, incluindo OWASP, CWE, CVE, CIS Benchmarks, NIST SP 800-53, NIST Secure Software Development Framework (SSDF) e o padrão ASVS.
