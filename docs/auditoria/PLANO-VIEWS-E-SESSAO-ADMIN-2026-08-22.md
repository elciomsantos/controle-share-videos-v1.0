# Análise de Segurança — Limite de Views e Acesso ao Painel Admin

**Data:** 2026-08-22
**Origem:** relatos de teste manual (Edge, instância local)
**Escopo:** (1) limite de visualizações burlado ao reutilizar o link; (2) acesso ao painel admin digitando `localhost:3000`, com visualização de dados de todos os usuários.

---

## Resumo executivo

| ID | Achado | Severidade | Correção |
|---|---|---|---|
| SEC-V1 | `POST /view` não conta views quando o viewer é o criador ou admin logado — dono/admin assiste sem limite | **ALTA** | P0 |
| SEC-V2 | Contagem de views é client-side (XHR no `onPlay`); bloquear a chamada = views ilimitadas | **ALTA** | P0 |
| SEC-A1 | Keep-alive do frontend renova `lastActivityAt` a cada 2 min → idle timeout (30 min) nunca dispara com aba aberta; sessão vive até o TTL absoluto (**3 meses**) | **ALTA** | P0 |
| SEC-A2 | Leituras sensíveis de PII (lista de usuários, logs, auditoria) não exigem re-autenticação recente — só mutações têm step-up | **MÉDIA** | P1 |
| SEC-A3 | Leituras em massa de PII não geram evento de auditoria | **MÉDIA** | P1 |
| OK | Endpoints admin têm `@AdminOnly`/`@Roles`; mutações exigem `@ReauthRequired` (+TOTP); `UserDTO` não expõe hash (`excludeExtraneousValues`) | — | ✅ |

**Esclarecimento sobre o relato 2:** não houve quebra de autorização no backend. O navegador tinha uma **sessão de admin válida persistida** (dos testes anteriores). O servidor entregou as leituras porque a sessão era legítima; as mutações foram barradas exatamente pelo step-up (`ReauthRequired`). Os "credenciais" visíveis eram usernames/e-mails/papéis — **não hashes de senha**. O problema real é a longevidade da sessão (SEC-A1/A2), não controle de acesso.

---

## ACHADO SEC-V1/V2 — Limite de views

### Evidência

`backend/src/share/share.controller.ts` (`recordView`, ~linha 113):

```ts
const user = req.user as User | undefined;
if (!user || (share.creatorId !== user.id && !user.isAdmin)) {
  await this.shareService.increaseViewCount(share, { ... });
}
```

1. **SEC-V1:** viewer autenticado como criador do share ou admin → `increaseViewCount` nunca roda → `share.views` fica em 0 → nenhum bloqueio (`getShareToken`, guard pós-token e `increaseViewCount` dependem desse contador). Reproduz o relato: fluxo anônimo limitou; reutilizando o link já logado como admin, ilimitado.
2. **SEC-V2:** para anônimos, o incremento depende exclusivamente do XHR `POST /shares/:id/view` no `onPlay` (`FilePreview.tsx`). Quem controla o cliente (DevTools, extensão, `curl` direto na stream com cookie do share) não chama o endpoint e assiste infinitamente — o servidor entrega a stream sem contar nada.

### Correções

**P0-1 — Contar view no servidor, uma vez por token de share (não por Range):**

- Em `getFile` (`?download=false`), após verificação de acesso bem-sucedida, dedupe por token: chave Redis `share:<id>:viewed:<hashDoToken>` com TTL = validade do token (fallback Postgres se Redis indisponível).
- Na primeira stream do token, incrementar atomicamente (`updateMany` com `views < maxViews`, lógica já existente em `increaseViewCount`). Recusado → 403 `share_max_views_exceeded`.
- `POST /view` deixa de ser fonte de verdade; vira sinal analítico secundário ou é removido.
- **Remover o bypass de creator/admin**: toda visualização conta. O dono pode receber um aviso na UI ("você está assistindo seu próprio share") sem deixar de contabilizar.

**P0-2 — Frontend:** remover/desativar `useRecordPlayView` como contador (evita dupla contagem com P0-1); manter modal de limite acionado pelo 403 do probe/stream. Efeito colateral positivo: o over-count de play/pause (janela de 2s do `recordingRef`) desaparece.

**P1 — Defesa adicional:** alerta/log quando o mesmo token solicitar streams por período anormalmente longo (indicador de gravação/espelhamento); considerar limite de banda por token.

---

## ACHADO SEC-A1/A2 — Sessão de admin e leitura de PII

### Evidência

1. `sessionIdleTimeout` = 30 min e `sessionDuration` = **3 meses** (`prisma/seed/config.seed.ts`). O idle timeout existe (`session.service.ts` §11.2 via `lastActivityAt`), mas:
2. `_app.tsx` (keep-alive implementado hoje) chama `refreshSession()` a cada 2 min enquanto houver usuário logado → cada refresh autentica a sessão → `lastActivityAt` sempre fresco → **com qualquer aba aberta, a sessão nunca expira por inatividade e vive 3 meses**.
3. Leituras admin (`GET /users` com e-mails/papéis/TOTP status, logs, auditoria, config) têm `@AdminOnly` mas **não** `@ReauthRequired` — apenas mutações exigem step-up. Sessão antiga = leitura irrestrita de PII até o TTL absoluto.

### Correções

**P0-3 — Keep-alive consciente do idle timeout:**

- Opção A (recomendada): remover o keep-alive automático de `_app.tsx` ou condicioná-lo à interação real do usuário (resetar timer em `click`/`keydown`/`visibilitychange`), para que o idle timeout de 30 min volte a funcionar como projetado (§11.2).
- Opção B: manter keep-alive apenas enquanto a aba estiver visível (`document.visibilityState === "visible"`).

**P0-4 — TTL absoluto de admin:** reduzir default `sessionDuration` de "3 months" (ex.: 12–24h) e/ou criar `adminSessionDuration` mais curto (ex.: 4h) aplicado no login/rotação de admins. Atualizar seed + valor no banco local/prod.

**P1-5 — Step-up em leituras sensíveis:** aplicar `@ReauthRequired()` (janela de graça de ~15 min após re-auth) em: `GET /users`, `GET /audit/*`, `GET /download-logs`, `GET /access-review`, `GET /config/admin/:category`. Avaliar impacto de UX antes.

**P1-6 — Auditoria de leitura:** emitir evento de auditoria (quem/quando/IP/qtde registros) em listagens de usuários e exportações de logs; integrar aos alertas existentes (picos de leitura).

**P2 — Higiene:** botão "encerrar todas as outras sessões" no perfil (hoje só admin global tem revoke-all); `Clear-Site-Data` no logout; mascarar e-mail na listagem com revelação sob step-up (LGPD, minimização).

---

## Plano de execução

| Fase | Itens | Status |
|---|---|---|
| 1 (P0 views) | P0-1, P0-2 | ✅ Implementada (2026-08-22) |
| 2 (P0 sessão) | P0-3, P0-4 | ✅ Implementada (2026-08-22) |
| 3 (P1) | SEC-A2/A3, P1 extras | Pendente |

Riscos/observações:

- P0-1 adiciona 1 lookup Redis por request de stream (barato; só na rota `download=false`).
- Dedupe por token exige hash do token opaco (nunca guardar token puro).
- Mudança de semântica: "views" passa a contar entregas de stream por token, não plays. Documentar em MANUAL.md e no texto do modal.
- Manter compatibilidade com shares sem maxViews (contagem segue, sem bloqueio).

---

## Implementação das Fases 1 e 2 (2026-08-22)

**Fase 1 — contagem server-side (SEC-V1/V2):**

- Novo `StreamViewCounterService` (`share/domain/`, módulo global): conta a view na primeira entrega de stream por identidade — hash SHA-256 truncado de `token do share > usuário de sessão > IP` — com janela de dedupe de **12h**, incremento atômico condicional (`updateMany` com `views < maxViews`) e 403 `share_max_views_exceeded` quando recusado.
- Guard pós-token consulta o dedupe: identidade já contada continua a stream mesmo com o contador esgotado; identidades novas são bloqueadas.
- `POST /view` virou apenas log analítico (não incrementa mais). Bypass de creator/admin removido. `ShareService.increaseViewCount` removido (autoridade migrada).
- Frontend: `useRecordPlayView` e o pause/play no `onPlay` foram removidos (`FilePreview.tsx`); modal de limite segue acionado pelo 403 do probe/stream.

**Fase 2 — sessão (SEC-A1/P0-4):**

- `_app.tsx`: keep-alive só renova com aba **visível** e interação real nos últimos 5 min — o idle timeout server-side volta a valer com aba aberta.
- Nova config `general.adminSessionDuration` (default **4 horas**) aplicada em `TokenService.createRefreshToken`: admins recebem o menor entre ela e a global. Default global `sessionDuration` reduzido de "3 months" para "24 hours" no seed (instalações existentes preservam `value` já definido).

**Validação ao vivo (share local com maxViews=2):**

- 3 requests de stream do mesmo viewer = **1 view** (dedupe ✔); segundo viewer → view 2 ✔; terceiro → 403 na emissão de token E na stream ✔; viewer já contado continua assistindo (206) ✔; certificado acessível com limites esgotados (200) ✔.
- Suítes: backend 296/296, frontend lint+tsc+22 testes.
