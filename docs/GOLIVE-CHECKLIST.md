# Checklist de Go-Live — Controle Share Videos v1.0

**Criado:** 2026-08-22 · **Base:** estado pós-Fase 4 (issues #1–#40 fechados), pentest interno de shares e auditoria de SQL injection.
**Regra:** item só pode ser marcado com evidência anexada (link, log, print ou hash). Sem evidência = não feito.

---

## Fase 0 — Pré-requisitos de repositório

| # | Item | Como validar | Evidência |
|---|---|---|---|
| 0.1 | CI verde no commit de release | `gh run list --limit 2` → workflows `CI` e `Security Gate` concluídos (`✓`) | ☐ |
| 0.2 | Tag de release criada (dispara SLSA provenance + assinatura cosign + SBOM) | `git tag vX.Y.Z && git push --tags`; artifacts na release | ☐ |
| 0.3 | Imagem publicada no registry com provenance SLSA3 + atestação cosign | `cosign verify-blob --bundle ...` ou check da release | ☐ |

## Fase 1 — Infraestrutura do host de produção

| # | Item | Como validar | Evidência |
|---|---|---|---|
| 1.1 | Host provisionado conforme `docs/ESPECIFICACAO_SEGURANCA_DOCKER_HOST_v1.0.md` | Checklist do doc assinado | ☐ |
| 1.2 | DNS apontando para o host (A/AAAA) com propagação verificada | `dig +short DOMINIO` | ☐ |
| 1.3 | Portas abertas apenas 80/443 (+ SSH restrito) | `nmap -p- DOMINIO` a partir de rede externa | ☐ |
| 1.4 | Firewall do host ativo (ufw/nftables) | `sudo ufw status` | ☐ |

## Fase 2 — Segredos e variáveis

> Gerar tudo novo; **nunca reaproveitar valores de `.env.local` de desenvolvimento.**

| # | Item | Como gerar/validar | Evidência |
|---|---|---|---|
| 2.1 | `JWT_SECRET` novo (256 bits) | `openssl rand -base64 48` | ☐ |
| 2.2 | `ADMIN_PASSWORD` nova via Docker secret (`ADMIN_PASSWORD_FILE`) | senha forte + `docker secret`/arquivo 0600 fora do repo | ☐ |
| 2.3 | `DOMAIN`, `ACME_EMAIL`, `CORS_ORIGIN` com o domínio real | revisar `.env` de produção | ☐ |
| 2.4 | SMTP configurado (host/porta/user/pass) | envio de e-mail de teste (reset de senha) | ☐ |
| 2.5 | Secrets de deploy no GitHub: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`, `DEPLOY_SSH_KEY` | Settings → Secrets | ☐ |
| 2.6 | Variável de repositório `DEPLOY_ENABLED=true` (ativa o job de deploy) | Settings → Variables | ☐ |
| 2.7 | Chaves de backup S3: credenciais IAM write-only + MFA delete habilitado | executar `scripts/provision/backup-bucket-protection.sh` | ☐ |

## Fase 3 — Validação em staging

| # | Item | Como validar | Evidência |
|---|---|---|---|
| 3.1 | Deploy em staging com o compose de staging | `scripts/staging-validation.sh` verde | ☐ |
| 3.2 | Migrações Prisma aplicadas sem erro | log do container backend (`migrate deploy`) | ☐ |
| 3.3 | Smoke E2E dos fluxos críticos: login → upload → share c/ senha → view → download → expiração | execução manual registrada ou suite Playwright apontando ao staging | ☐ |
| 3.4 | Limites de share funcionando pós-fix #40 (view/download esgotado bloqueia stream) | repetir cenário do pentest em staging | ☐ |
| 3.5 | TLS válido emitido pelo Caddy (HTTP→HTTPS, HSTS) | `curl -I https://DOMINIO` + SSL Labs ≥ A | ☐ |

## Fase 4 — Go-live

| # | Item | Como validar | Evidência |
|---|---|---|---|
| 4.1 | Janela acordada + plano de rollback lido (`docs/runbooks/rollback-runbook.md`) | reunião registrada | ☐ |
| 4.2 | Deploy de produção via pipeline (job `Deploy (produção)` verde) | run do GitHub Actions | ☐ |
| 4.3 | Health checks: `/api/health` 200; frontend 200; containers healthy | `curl` + `docker ps` no host | ☐ |
| 4.4 | Login admin com a senha nova + troca imediata de senha pós-primeiro acesso | registro no audit log | ☐ |
| 4.5 | Swagger desativado em produção (`SWAGGER_ENABLED` ausente/false) | `/api/docs` retorna 404 | ☐ |
| 4.6 | Rate limit e CSRF ativos no domínio público | repetir testes rápidos do pentest (fases 1–2) contra produção | ☐ |

## Fase 5 — Pós-go-live (semana 1)

| # | Item | Como validar | Evidência |
|---|---|---|---|
| 5.1 | Backup automático rodou + restore testado em ambiente limpo | `scripts/backup/restore.sh` + hash comparado | ☐ |
| 5.2 | Monitoramento ativo: Prometheus raspando, Alertmanager roteando p/ Slack/PagerDuty | alerta de teste disparado e recebido | ☐ |
| 5.3 | WORM audit chain íntegra | `GET /api/admin/audit-logs/chain-status` → ok | ☐ |
| 5.4 | Certificados TLS monitorados (gauge > 0, alerta < 30d) | painel Grafana / `caddy_tls_certificate_expiry_timestamp` | ☐ |
| 5.5 | Primeiro DR drill agendado (trimestral, `docs/runbooks/dr-drill.md`) | data no calendário + responsável | ☐ |
| 5.6 | Pen test externo contratado/agendado (escopo em `docs/pentest-scope.md`) | contrato/proposta | ☐ |
| 5.7 | Aceite formal de risco: antivírus não implementado (#29, *not planned*) | termo assinado pelo owner | ☐ |
| 5.8 | Sign-off LGPD (encarregado/jurídico sobre DPIA, base legal, DSR) | documento assinado | ☐ |

---

## Critério final

Go-live autorizado quando: **Fases 0–4 = 100%** e Fase 5 com itens 5.1–5.3 concluídos.
Itens 5.5–5.8 podem ficar agendados, desde que com data e responsável registrados.

## Rollback expresso (se algo der errado)

```bash
# No host, via script padrão do repo:
APP_DIR=/opt/controle-share-videos-v1.0 RUN_BACKUP=1 TARGET_REF=<sha-anterior> bash scripts/deploy/deploy-prod.sh
# Ou restore completo:
bash scripts/backup/restore.sh <backup-mais-recente>
```
