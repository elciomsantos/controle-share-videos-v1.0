# Padronização 07 — Integração ClamAV

> **Tema:** "Integração ClamAV (validar funcionamento atual — marcado 'a integrar')"
> (item 7 da lista de objetivos em `Padronizacao.md`).
>
> **Status:** Decidido — documentação completa; implementação de código pendente.
> **Decisão formal:** 25/07/2026.
> **Dependências:** Tema 1 (já executado); Tema 4 (RBAC — para acesso admin ao
> status endpoint); Tema 3 (logs de auditoria para registro de infecções/malware).

---

## 1. Decisão

ClamAV passa de "auto-detect no boot, fire-and-forget, sem governança" para
**integração administrável, observável e blindada contra a janela de race**.
Pilar: o `removedReason` vira chave i18n, todo scan é registrado no log de
auditoria, e o admin pode ligar/desligar em runtime sem tocar env vars.

**Decisões formais:**

**1. Provisionamento do daemon em produção (`docker-compose.yml`).** O daemon
clamd (`clamav/clamav:latest`) passa a ser serviço definido no compose de
produção, com:
- `depends_on` (healthy) no serviço app.
- Healthcheck próprio (`clamdscan --version` ou TCP check na 3310).
- `restart: unless-stopped`.
- Volume nomeado `clamav-db` para a database de signatures (`/var/lib/clamav`),
  evitando re-download a cada restart.
- Network bridge privada entre app e clamd (não exposta ao host em produção).
- Variáveis removidas do "stub de produção": o comentário truncado (linhas 7-10
  do `docker-compose.yml` atual) é substituído pela definição real.

**2. Toggle administrável.** Nova categoria de config `clamav` em `config.seed.ts`:

| Chave | Type | Default | Descrição |
|-------|------|---------|-----------|
| `clamav.enabled` | `boolean` | `"false"` | Liga/desliga a tentativa de conexão e o scan. Se `false`, o `ClamScanService` retorna `null` imediatamente sem chamar a lib. |
| `clamav.blockDownloadWhileScanning` | `boolean` | `"false"` | Se `true`, downloads são rejeitados com HTTP 503 `clamav.scanInProgress` enquanto um scan está pendente para aquele share. Default `false` para não quebrar compat. |
| `clamav.failClosed` | `boolean` | `"false"` | Se `true`, falha de comunicação clamd → share marcado com `removedReason="scan_failed"` e indisponível para download (postura fail-closed). Default `false` (fail-open, comportamento atual). |

A descoberta inicial via env vars (`CLAMAV_HOST`/`CLAMAV_PORT`) **mantém-se** para
resolução de rede, mas a chave `clamav.enabled` é **gate** — independente do
host estar acessível.

**3. Endpoint de status.** Novo `GET /api/admin/clamav/status` (`@Roles("admin")`):

```json
{
  "enabled": true,
  "daemonReachable": true,
  "host": "clamav",
  "port": 3310,
  "signatureVersion": "0.105.2/...",
  "lastScanAt": "2026-07-25T18:30:00Z"
}
```
Expõe o estado do daemon à tela admin — sem exigir SSH para diagnosticar por que
"ClamAV is not active". Backend implementa verificando `clamscan.ping()` via
adapter.

**4. i18n PT-BR do `removedReason`.** Substituir string hardcoded em inglês
(`"Your share got removed because the file(s) ${fileNames} are malicious."`) por
chave `clamav.shareRemoved` em `backend/src/i18n/pt-BR/share.json`:

```json
"clamav": {
  "shareRemoved": "Compartilhamento removido: o(s) arquivo(s) {fileNames} foram identificados como maliciosos.",
  "shareRemoved.reason": "Detectado pelo ClamAV",
  "scanInProgress": "Verificação antivírus em andamento. Tente novamente em alguns instantes.",
  "scanFailed": "Não foi possível concluir a verificação antivírus. Tente novamente."
}
```

O `ShareService` continua gravando `removedReason` no DB como a string PT-BR
interpolada (mesmo formato, agora localizado) — compatível com o frontend que
hoje exibe `e.response.data.message` cru.

**5. Bloqueio de download enquanto scan pendente (opcional via config).** Quando
`clamav.blockDownloadWhileScanning=true`:
- Novo campo `Share.scanStatus String @default("pending")` — valores:
  `"pending"` (default, novo share criado), `"scanning"`, `"clean"`,
  `"infected"`, `"failed"`.
- `ShareService.complete()` seta `scanStatus="scanning"` antes de chamar o
  `checkAndRemove`.
- `FileSecurityGuard` aceita download se `scanStatus` ∈ `{"clean", "failed"}`
  ou se `blockDownloadWhileScanning=false`. Em `"pending"`/`"scanning"`,
  retorna HTTP 503 com i18n `clamav.scanInProgress`.
- Apos scan concluir:
  - Sem infecção → `prisma.share.update({ data: { scanStatus: "clean" } })`.
  - Com infecção → seta `scanStatus="infected"` + `removedReason` (já existe).
  - Erro de scan → `scanStatus="failed"` (+ se `failClosed=true`, grava
    `removedReason=clamav.scanFailed`; se `false`, share permanece acessível).

**6. Registro de auditoria.** Toda execução de `checkAndRemove` gera
`DownloadLog` (reusando Tema 3):
- `event="scan"`, `success=true/false`, `reason="infected"` / `"clean"` /
  `"scan_failed"`, `shareId`, `fileName=share.name ?? shareId`, `ip="127.0.0.1"`,
  `userAgent="clamscan-service"`.
- Mantêm-se os logs `Logger.log/warn/error` existentes.

**7. Política de remoção.** Mantém-se: **se _qualquer_ arquivo do share
estiver infectado, o share inteiro é removido** (defesa em profundidade).
Comportamento documentado explicitamente como intencional; sem toggle "remover
só arquivo infectado" (fora deste tema).

**8. Provisionamento do daemon — observação sobre cold start.** A imagem
`clamav/clamav` baixa signatures no primeiro boot (pode levar 5-15 min). O
healthcheck do compose aguarda a database estar carregada. App `ClamScanService`
 continua tolerante: se o daemon ainda estiver baixando signatures, a lib
 `init()` resolve `null` (ClamAV "not active") e o `record()` de auditoria
 `success=false, reason="daemon_not_ready"` é emitido uma vez por share.

---

## 2. Estado Atual (levantamento)

### 2.1 Estrutura de arquivos

- `backend/src/clamscan/clamscan.service.ts` (110 linhas) — único serviço.
- `backend/src/clamscan/clamscan.module.ts` (10 linhas) — `forwardRef(FileModule)`,
  exportando `ClamScanService`.
- Sem `*.spec.ts`. Pasta `backend/test/` só tem `newman-system-tests.json`
  (suite HTTP), nenhum fluxo ClamAV coberto.

### 2.2 `ClamScanService` atual

```ts
private ClamScan: Promise<NodeClam | null> = new NodeClam()
  .init(clamscanConfig)
  .then(...)
  .catch((): null => null);  // "ClamAV is not active"
```

- Config do `NodeClam` é **constante de módulo** (`clamscanConfig`), não
  injetada em `ConfigService`. Defaults: `localFallback: false`,
  `preference: "clamdscan"`, host/porta via `constants.ts` (`CLAMAV_HOST`/
  `CLAMAV_PORT`, defaults `clamav:3310` em docker, `127.0.0.1:3310` fora).
- `check(shareId)`: lê `SHARE_DIRECTORY/<id>`, **exclui** `archive.zip`, executa
  `clamScan.isInfected` por arquivo físico (`fileId` como nome). Erro no
  `readdirSync` é silenciosamente descartado (`void e; return [];`).
- `checkAndRemove(shareId)`: chama `check`, se vazio retorna; se infectados,
  chama `fileService.deleteAllFiles(shareId)` (apaga **diretório inteiro** do
  share) + `prisma.file.deleteMany({ where: { shareId } })` + atualiza
  `Share.removedReason` com string hardcoded em inglês.
- Catch do scan: loga erro e **mantém share online** (fail-open); `removedReason`
  não é gravado. Catch da deleção: loga erro e retorna precoce (sem
  `removedReason` — possível estado inconsistente: arquivos no disco mas sem
  registros DB).

### 2.3 Ponto de chamada

- **ÚNICO**: `share.service.ts:172`, dentro de `ShareService.complete(id)`:

```ts
void this.clamScanService.checkAndRemove(share.id);
```

`void` = fire-and-forget. O response HTTP do `POST /api/shares/:id/complete`
retorna 202 antes do scan concluir. **Race window:** visitante pode baixar
antes de `removedReason` ser persistido.

### 2.4 Config seed

- **Categoria `clamav` INEXISTENTE** em `config.seed.ts`. Categorias presentes:
  `internal`, `general`, `appearance`, `share`, `signUp`, `cache`, `email`,
  `smtp`, `legal`.
- Sem toggle administrável em runtime. Habilitação real depende do sucesso do
  `init()` clamd.

### 2.5 Docker

- `docker-compose.yml` (produção, 14 linhas): só serviço app. Comentário
  truncado nas linhas 7-10: `# To add ClamAV, to scan your shares for
  malicious files,` (sem ação real).
- `docker-compose.dev.yml` (6 linhas): serviço `clamav` (`clamav/clamav`,
  porta `3310` exposta no host), **sem rede compartilhada com app**, **sem
  `depends_on`**, **sem volume persistente para signatures**.
- `docker-compose.local.yml`: só app (`network_mode: host`, porta 8090), sem
  clamd.
- `Dockerfile`: 5 estágios, **não embarca clamd** no container final.

### 2.6 Frontend

- `grep clamav|clamScan|malware|virus|infected` em `frontend/src`: **0 hits**.
- Tratamento indireto via modal genérico `showErrorModal` em
  `pages/share/[shareId]/index.tsx` quando o backend devolve 404 com
  `error == "share_removed"` — título `share.error.removed.title`, descrição =
  `e.response.data.message` (cru do backend, em inglês hoje).
- Sem tela de status, sem ajuste de config, sem chave i18n específica de malware.

### 2.7 TODOs/FIXMEs

- **Nenhum** relacionado a ClamAV no código (`backend/src/**` e
  `frontend/src/**`). Único "stub" é o comentário cru em `docker-compose.yml`.

### 2.8 Veredito do estado atual

> **Integração parcial — código presente e funcional quando daemon está no ar,
> porém desligado em produção por falta de provisionamento e sem governança
> administrável.** Em instalação fresh via `docker-compose.yml` (sem
> `-f ...dev.yml`), é equivalente a "ClamAV desligado"; em dev com
> `docker-compose.dev.yml` e clamd healthy, é "ClamAV funcional" com as
> limitações: fire-and-forget, removedReason em inglês, sem toggle admin,
> sem teste.

---

## 3. Padronização

### 3.1 Schema — Nova migration adicionando `scanStatus` em `Share`

**Política:** nova migration Prisma (não editar migrations antigas). Nome:
`2026xxxx_add_share_scan_status`.

```prisma
model Share {
  ...
  scanStatus String @default("pending")  // NOVO — "pending"|"scanning"|"clean"|"infected"|"failed"
  ...
}
```

Notas:
- Default `"pending"` — todo share novo começa nesse estado.
- Após migration, backfill idempotente: para shares existentes `uploadLocked=true`
  sem `removedReason`, setar `scanStatus="clean"` (já escaneados ou
  pré-ClamAV). Para `removedReason != null`, setar `scanStatus="infected"`.
- Aplica-se ao `FileSecurityGuard` para bloquear/permitir download conforme
  `clamav.blockDownloadWhileScanning`.

### 3.2 Backend — `ClamScanService` reescrito

1. **Injeção de `ConfigService`** — substitui constante de módulo por leitura
   dinâmica de `clamav.host`/`clamav.port` (novas chaves de config, ver §3.4)
   quando presentes, com fallback às env vars.
2. **Gateway por `clamav.enabled`:**

```ts
async canActivate(): Promise<boolean> {
  return this.config.get("clamav.enabled") === "true";
}

private async getScanner(): Promise<NodeClam | null> {
  if (this.config.get("clamav.enabled") !== "true") return null;
  // ... init lib lazily, cache Promise
}
```

3. **Método `checkAndRemove` vira `checkAndRecord(shareId)`:**

```ts
async checkAndRecord(shareId: string): Promise<void> {
  if (!(await this.canActivate())) {
    void this.downloadLogService.record({ ..., event: "scan", success: false, reason: "disabled" });
    await this.prisma.share.update({ where: { id: shareId }, data: { scanStatus: "clean" } });  // pula scan
    return;
  }
  const scanner = await this.getScanner();
  if (!scanner) {
    void this.downloadLogService.record({ ..., event: "scan", success: false, reason: "daemon_not_ready" });
    if (this.config.get("clamav.failClosed") === "true") {
      await this.markRemoved(shareId, i18n.t("clamav.scanFailed"));
    }
    return;
  }
  await this.prisma.share.update({ where: { id: shareId }, data: { scanStatus: "scanning" } });
  try {
    const infected = await this.check(shareId);
    if (infected.length === 0) {
      await this.prisma.share.update({ where: { id: shareId }, data: { scanStatus: "clean" } });
      void this.downloadLogService.record({ ..., event: "scan", success: true, reason: "clean" });
      return;
    }
    // ... removeAllFiles + removedReason i18n (ver §3.3)
    await this.prisma.share.update({ where: { id: shareId }, data: { scanStatus: "infected", removedReason: i18n.t("clamav.shareRemoved", { args: { fileNames } }) } });
    void this.downloadLogService.record({ ..., event: "scan", success: true, reason: "infected" });
  } catch (err) {
    await this.prisma.share.update({ where: { id: shareId }, data: { scanStatus: "failed" } });
    void this.downloadLogService.record({ ..., event: "scan", success: false, reason: "scan_failed" });
    if (this.config.get("clamav.failClosed") === "true") {
      await this.markRemoved(shareId, i18n.t("clamav.scanFailed"));
    }
  }
}
```

(Preserva-se o nome público `checkAndRemove` como alias de `checkAndRecord` por
1 versão para não quebrar callers não migrados — depois remoção no Tema 8.)

### 3.3 Backend — `ShareService.complete`

- Antes do `void clamScanService.checkAndRemove`, setar `scanStatus="scanning"`:

```ts
await this.prisma.share.update({ where: { id }, data: { scanStatus: "scanning" } });
void this.clamScanService.checkAndRecord(id);
```

- `complete()` retorna 202 com `scanStatus: "scanning"` no response — cliente
  pode exibir "verificação em andamento".

### 3.4 Backend — `FileSecurityGuard` bloquear download se scan pendente

No `canActivate`, **antes** do check de `maxViews`:

```ts
if (this._config.get("clamav.blockDownloadWhileScanning") === "true") {
  const share = await this._prisma.share.findUnique({ where: { id: shareId }, select: { scanStatus: true } });
  if (share && (share.scanStatus === "pending" || share.scanStatus === "scanning")) {
    throw new HttpException(this._i18n.t("clamav.scanInProgress"), HttpStatus.SERVICE_UNAVAILABLE);
  }
}
```

Default `false` → comportamento atual (download imediato). Com `true` →
visitor recebe 503 enquanto scan não conclui. Frontend exibe via modal
`showErrorModal` (503 com i18n `clamav.scanInProgress`).

### 3.5 Backend — Config seed (novo)

```ts
clamav: {
  enabled: {
    type: "boolean",
    defaultValue: "false",
    secret: false,
  },
  host: {
    type: "string",
    defaultValue: "",  // vazio = usa env CLAMAV_HOST
    secret: false,
  },
  port: {
    type: "integer",
    defaultValue: "3310",
    secret: false,
  },
  blockDownloadWhileScanning: {
    type: "boolean",
    defaultValue: "false",
    secret: false,
  },
  failClosed: {
    type: "boolean",
    defaultValue: "false",
    secret: false,
  },
},
```

Ordem (`order` field) após `legal`. Categoria跻身 painel admin em
`/admin/config?category=clamav` (ver §3.7).

### 3.6 Backend — Novo `ClamScanController` + endpoint de status

```ts
// backend/src/clamscan/clamscan.controller.ts
@Controller("admin/clamav")
@UseGuards(JwtGuard, RolesGuard)
@Roles("admin")
export class ClamScanController {
  constructor(private clamScanService: ClamScanService) {}

  @Get("status")
  async status() {
    return this.clamScanService.getStatus();
  }
}
```

`getStatus()` verifica `clamav.enabled`, faz `clamd ping` (lib `clamscan`
expõe método), retorna shape jails (ver §1.3). Registra em cache de 30s para
evitar spamming.

### 3.7 Frontend — Tela admin `/admin/config?category=clamav` + card de status

1. **Painel de configuração:** chute automático — AdminConfigInput já renderiza
   por `type` (`boolean`→switch, `string`→TextInput, `integer`→NumberInput).
   Aparecerá nova categoria "Antivírus (ClamAV)" no menu lateral quando as
   chaves existirem no seed.

2. **Página de status em `/admin` (no card):** item novo no `pages/admin/index.tsx`:
   - "Antivírus" com ícone `TbShieldCheck`, rota `/admin/clamav`.
   - Visível para `roles: ["admin"]`.
   - `pages/admin/clamav.tsx` mostra badge verde (daemon acessível, signatures OK),
     amarelo (ligado mas daemon inacessível), vermelho (erro fatal), cinza
     (desativado). Botão "Revalidar" → chama `POST /api/admin/clamav/status/refresh`
     ou simplesmente refaz `GET`.

3. **i18n** (ver §3.8).

### 3.8 i18n PT-BR

**Backend (`backend/src/i18n/pt-BR/share.json`):**

```json
"clamav": {
  "shareRemoved": "Compartilhamento removido: o(s) arquivo(s) {fileNames} foram identificados como maliciosos.",
  "shareRemoved.reason": "Detectado pelo ClamAV",
  "scanInProgress": "Verificação antivírus em andamento. Tente novamente em alguns instantes.",
  "scanFailed": "Não foi possível concluir a verificação antivírus. Tente novamente."
}
```

**Frontend (`frontend/src/i18n/translations/pt-BR.ts`):**

```ts
"admin.button.clamav": "Antivírus",
"admin.button.clamav.description": "Status e configuração do ClamAV",
"admin.clamav.title": "Antivírus (ClamAV)",
"admin.clamav.status.enabled": "Habilitado",
"admin.clamav.status.disabled": "Desabilitado",
"admin.clamav.status.daemonReachable": "Daemon acessível",
"admin.clamav.status.daunreachable": "Daemon inacessível",
"admin.clamav.status.signatureVersion": "Versão das assinaturas",
"admin.clamav.status.lastScanAt": "Última verificação",
"admin.clamav.button.refresh": "Revalidar",
"admin.config.category.clamav": "Antivírus",
"admin.config.clamav.enabled": "Habilitar ClamAV",
"admin.config.clamav.enabled.description": "Ativar verificação antivírus nos shares concluídos.",
"admin.config.clamav.host": "Host do daemon",
"admin.config.clamav.host.description": "Endereço do daemon clamd. Vazio = usa variável de ambiente CLAMAV_HOST.",
"admin.config.clamav.port": "Porta do daemon",
"admin.config.clamav.port.description": "Porta do daemon clamd. Default 3310.",
"admin.config.clamav.block-download-while-scanning": "Bloquear download durante scan",
"admin.config.clamav.block-download-while-scanning.description": "Se ativo, downloads são rejeitados com HTTP 503 enquanto o scan está pendente.",
"admin.config.clamav.fail-closed": "Bloquear share em caso de falha",
"admin.config.clamav.fail-closed.description": "Se ativo, falha de comunicação com clamd marca o share como removido (postura fail-closed). Default: fail-open (share permanece acessível).",
"share.error.clamav-scan-in-progress.title": "Verificação antivírus em andamento",
"share.error.clamav-scan-in-progress.description": "Este compartilhamento ainda está sendo verificado. Tente novamente em alguns instantes.",
```

### 3.9 Docker — `docker-compose.yml` atualizado

```yaml
services:
  controle-share-videos:
    # ... mantém todo o config atual
    depends_on:
      clamav:
        condition: service_healthy

  clamav:
    image: clamav/clamav:latest
    restart: unless-stopped
    volumes:
      - clamav-db:/var/lib/clamav
    networks:
      - internal
    healthcheck:
      test: ["CMD-SHELL", "clamdscan --version || exit 1"]
      interval: 60s
      timeout: 10s
      retries: 5
      start_period: 300s  #初期 download de signatures pode levar 5-15min

volumes:
  clamav-db:

networks:
  internal:
    driver: bridge
```

App recebe `CLAMAV_HOST=clamav` e `CLAMAV_PORT=3310` por default.

`docker-compose.local.yml` mantém `network_mode: host`, mas o `docker-compose.dev.yml`
mantém serviço `clamav` para developers.

---

## 4. Migration — Política

- **Criar nova migration Prisma**: adiciona `scanStatus String @default("pending")`
  em `Share`. Nome sugerido: `2026xxxx_add_share_scan_status`.
- **Backfill idempotente** (executado via `backfill-scan-status.ts` análogo ao
  `backfill-role.ts` do Tema 4, ou passo no `seed.ts`):

```sql
UPDATE Share SET scanStatus='clean'  WHERE scanStatus='pending' AND uploadLocked=true AND removedReason IS NULL;
UPDATE Share SET scanStatus='infected' WHERE removedReason IS NOT NULL;
```

- **Seed de config:** adicionar categoria `clamav` em `config.seed.ts` (ver
  §3.5). Re-seed em dev, `prisma migrate deploy` em produção (migrateConfigVariables
  faz o upsert automaticamente).
- **Docker:**替併更新 `docker-compose.yml`  + redeBridge + volume `clamav-db`.

---

## 5. Critérios de Aceite

- [ ] Categoria `clamav` adicionada em `config.seed.ts` com 5 chaves (`enabled`,
      `host`, `port`, `blockDownloadWhileScanning`, `failClosed`).
- [ ] Nova migration adiciona `scanStatus String @default("pending")` em `Share`.
- [ ] Script de backfill `scanStatus` (`clean`/`infected`) idempotente.
- [ ] `ClamScanService` injeta `ConfigService` e respeita `clamav.enabled=false`
      retornando `null` sem chamar a lib.
- [ ] `ClamScanService.checkAndRecord` (novo método) atualiza `scanStatus`
      (`pending` → `scanning` → `clean`/`infected`/`failed`) e grava
      `DownloadLog` com `event="scan"`.
- [ ] `ShareService.complete()` seta `scanStatus="scanning"` antes de chamtar
      `checkAndRecord`.
- [ ] `Share.removedReason` passa a ser string PT-BR via i18n
      `clamav.shareRemoved` (substituído hardcoded inglês).
- [ ] `FileSecurityGuard` bloqueia downloads com 503 + i18n `clamav.scanInProgress`
      quando `clamav.blockDownloadWhileScanning=true` e `scanStatus` é
      `pending`/`scanning`.
- [ ] `ClamScanController` criado com `GET /api/admin/clamav/status`
      (`@Roles("admin")`).
- [ ] `docker-compose.yml` provisiona serviço `clamav` com healthcheck, volume
      e `depends_on`.
- [ ] Variáveis `clamav.*` no seed (default эстет: `enabled=false`,
      `blockDownloadWhileScanning=false`, `failClosed=false`) preservando
      comportamento atual em instalação fresh.
- [ ] Página `/admin/clamav` exibe status (habilitado, daemon acessível,
      versão signatures, última verificação) com botão "Revalidar".
- [ ] Item de menu "Antivírus" no card `/admin` visível para `role=admin`.
- [ ] Chave i18n baru PT-BR adicionadas (backend `clamav.*` em share.json,
      frontend `admin.clamav.*`, `admin.config.clamav.*`,
      `share.error.clamav-scan-in-progress.*`).
- [ ] `BackfillClamavStatus` script validado em runtime (igual ao validado
      pelo backfill-role.ts do Tema 4).
- [ ] Lint e typecheck passam em backend e frontend.
- [ ] Compose up — contêiner app e clamd healthy, share novo escaneado
      (`scanStatus` vai de `pending` → `scanning` → `clean`).

---

## 6. Mapa de Referências ao Código

| Arquivo | Linha | O que mexer |
|--------|------|------------|
| `backend/prisma/schema.prisma` | Share model (70-91) | Adicionar `scanStatus String @default("pending")` |
| `backend/prisma/seed/config.seed.ts` | fim do objeto | Adicionar categoria `clamav` com 5 chaves |
| `backend/src/clamscan/clamscan.service.ts` | todo | Injetar `ConfigService`, gate `clamav.enabled`, método `checkAndRecord`, `getStatus` |
| `backend/src/clamscan/clamscan.module.ts` | todo | Importar `ConfigModule` (para DI do ConfigService) |
| `backend/src/clamscan/clamscan.controller.ts` | — | NOVO: `@Controller("admin/clamav")` com `GET /status` |
| `backend/src/share/share.service.ts` | 172 | Setar `scanStatus="scanning"` antes de `checkAndRecord` |
| `backend/src/file/guard/fileSecurity.guard.ts` | 56-85 | Adicionar check `clamav.blockDownloadWhileScanning` (503) |
| `backend/src/i18n/pt-BR/share.json` | — | Adicionar namespace `clamav` com 4 chaves |
| `backend/prisma/backfill-scan-status.ts` | — | NOVO: backfill idempotente de `scanStatus` |
| `docker-compose.yml` | 1-14 | Adicionar serviço `clamav` + volume + network + `depends_on` |
| `frontend/src/pages/admin/clamav.tsx` | — | NOVO: página de status |
| `frontend/src/pages/admin/index.tsx` | `allOptions` | Adicionar item "Antivírus" (roles: `["admin"]`) |
| `frontend/src/services/clamav.service.ts` | — | NOVO: `getStatus()`, `refreshStatus()` |
| `frontend/src/i18n/translations/pt-BR.ts` | — | Adicionar chaves `admin.clamav.*`, `admin.config.clamav.*`, `share.error.clamav-scan-in-progress.*` |

---

## 7. Riscos / Observações

1. **Cold start do daemon** — `clamav/clamav` baixa signatures no primeiro boot
   (5-15 min). O healthcheck do compose tem `start_period: 300s` para tolerar.
   Melhoria futura: pré-cache do volume `clamav-db` em build image (Tema futuro).
2. **Race persistente** — mesmo com `scanStatus=scanning` e bloqueio opcional,
   com `blockDownloadWhileScanning=false` a race existe. Default `false`
   preserva compat; documentado como aceitável em uso interno restrito (admin
   consciente do tradeoff).
3. **Volume de signatures** — sem persistir `clamav-db`, todo restart do daemon
   re-downla 200MB de signatures. Volume nomeado resolve; em air-gapped, precisa
   importar signatures via `clamav_tcpscribed` em volume pré-carregado.
4. **Tamanho do container de produção** — adicionar clamd aumenta imagem
   final? Não, pois clamd roda em serviço separado (não embarcado no Dockerfile
   do app).
5. **Política de remoção de share inteiro** — mantida intencionalmente (defesa
   em profundidade). Não exposta como toggle neste tema (simplicidade).
6. **Custo de CPU** — scan de vídeo grande é CPU-intensive. Documentado: o
   admin pode desligar via `clamav.enabled=false` se for gargalo. Futuro
   follow-up: scan assíncrono em fila BullMQ (Tema futuro).
7. **Limitação da lib `clamscan`** — não tem método `ping()` oficial. Workaround:
   `clamscan.isInfected("/dev/null")` e capturar erro — se "no virus found",
   daemon OK; se "connection refused", daemon down. Alternativa: usar
   `@nestjs-microservices` com TCP transport para pingar diretamente a porta
   3310. Decidido: simples TCP check ao port com `net.connect` (sem dependência).
8. **Compatibilidade com `localFallback: false`** — mantido; se clamd down e
   `failClosed=false` (default), share permanece acessível. Documentado.

---

## 8. Follow-ups (fora deste tema)

- **Scan assíncrono em fila** — BullMQ para grandes volumes; hoje fire-and-forget
  ok mas pode estourar memory em scans de TB. Avaliar em Tema futuro de
  observabilidade.
- **Dashboard de métricas** — Qtos shares escaneados/dia, taxa de infecção,
  latência de scan. Endpoint `/api/admin/clamav/stats` — futuro.
- **Notificação por e-mail ao admin** quando infecção detectada — via
  `EmailService.sendClamavAlert`. Fora deste tema.
- **Pré-cache de signatures** em build do compose para instalar em air-gapped
  sem download. Follow-up operacional.
- **Scan on-the-fly em upload de chunk** — hoje só no `complete()`. Futuro:
  hooks em `LocalFileService` para escanear em background enquanto chunks
  ainda são recebidos (reduz latência pós-complete).

---

**Fim do Tema 7.**
