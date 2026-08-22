# Revisão Trimestral de Tuning de Alertas (issue #24 — 3.8.4)

> **Objetivo**: garantir que os alertas continuem úteis — sem ruído que
> dessensibilize a equipe e sem lacunas silenciosas. Este documento define o
> processo da revisão trimestral e registra o histórico de ajustes.

---

## 1. Agenda

| Trimestre | Janela | Responsável |
|---|---|---|
| Q1 | Janeiro | DevOps + Backend Lead |
| Q2 | Abril | DevOps + Backend Lead |
| Q3 | Julho | DevOps + Backend Lead |
| Q4 | Outubro | DevOps + Backend Lead |

- Alinhado com o ciclo trimestral de Access Review (#11) — mesma semana.
- Lembrete: o próprio Alertmanager dispara os alertas de backup/access review;
  adicionar evento de calendário recorrente na primeira segunda-feira do mês
  de revisão.

## 2. Insumos da revisão

1. **Histórico de disparos** — Prometheus UI (`/alerts`), Grafana e logs do
   Alertmanager (`docker logs controle-share-videos-alertmanager`):
   - quantas vezes cada alerta disparou no trimestre;
   - tempo até reconhecimento (ack) e até resolução;
   - quantos viraram pages de madrugada (PagerDuty).
2. **Falsos positivos** — disparos sem ação correspondente ou sem impacto real.
3. **Silêncios suspeitos** — alertas críticos que **nunca** dispararam no
   trimestre: validar se a expressão ainda referencia métricas existentes
   (`curl -fs http://127.0.0.1:8080/api/metrics | grep <metric>`).
4. **Cobertura nova** — funcionalidades/métricas novas do trimestre sem alerta.

## 3. Checklist

- [ ] Cada alerta crítico disparou ≥ 1 vez ou foi validado por teste manual
- [ ] Zero falsos positivos repetidos; thresholds ajustados onde houve
- [ ] `runbook_url` presente em 100% dos alertas e links abrem corretamente
      (checklist: `grep -c "alert:" scripts/monitoring/alerts.yml` vs
      `grep -c "runbook_url" scripts/monitoring/alerts.yml`)
- [ ] Métricas referenciadas existem no backend/exporters atuais
      (kube_*/container_* exigem exporters específicos — documentar lacuna se
      não provisionados)
- [ ] Rotas do Alertmanager testadas com `amtool config routes test` ou
      alerta sintético (`amtool alert add`) chegando ao Slack/PagerDuty
- [ ] Secrets rotacionados se necessário
      (`scripts/provision/alertmanager-secrets.sh`)
- [ ] Este documento atualizado com a tabela de histórico (§5)

## 4. Como ajustar

1. Alterar thresholds/`for:` em `scripts/monitoring/alerts.yml`.
2. Validar sintaxe:
   ```bash
   docker run --rm -v "$PWD/scripts/monitoring:/mnt" \
     prom/prometheus:latest promtool check rules /mnt/alerts.yml
   ```
3. Aplicar: `docker compose -f docker-compose.monitoring.yml restart prometheus`
4. Ajustes de rota/receivers: editar
   `scripts/monitoring/alertmanager.template.yml`, validar com
   `amtool check-config` e recriar o container.
5. Commits separados por tema (thresholds × rotas × novos alertas).

## 5. Histórico de ajustes

| Data | Trimestre | Alerta / área | Mudança | Motivo |
|---|---|---|---|---|
| 2026-08 | — | — | Processo criado (issue #24) | Provisionamento inicial do Alertmanager |

## 6. Referências

- `scripts/monitoring/alerts.yml` — regras de alerta (carregadas pelo Prometheus)
- `scripts/monitoring/alertmanager.template.yml` — template de roteamento
- `docs/operacional/MONITORAMENTO.md` — visão geral de monitoramento e §5 TLS
- `docs/runbooks/incident-response.md` — resposta a incidentes
