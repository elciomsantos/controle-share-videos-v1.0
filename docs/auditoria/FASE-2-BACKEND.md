# Fase 2 — Auditoria de Backend

**Status:** ✅ Concluída
**Data:** 2026-08-04
**Escopo:** qualidade de código do backend NestJS (tipo/segurança, tratamento de exceções, casos de borda, lógica de serviços e controllers, agendamentos, auditoria), com foco em `any`/`parseInt`/throttling e validação de fluxos sensíveis (reset de senha, sign-out, jobs, download-log).

---

## 2.1 Resumo Executivo

O backend é **bem estruturado e defensivo em pontos críticos** (upload chunked com validação de magic bytes, proteção contra zip-bomb configurável, throttle por rota, CSRF double-submit, JWT rotation, correlação de logs via AsyncLocalStorage). Entretanto, foram identificados **8 achados**:

| Severidade | Qtd |
|---|---|
| Alto | 1 |
| Médio | 4 |
| Baixo | 3 |
| **Total** | **8** |

**Principal risco:** `resetPassword()` não valida a expiração do token (BKD-01), em desacordo com o fluxo de verificação de conta — uma janela de validade estendida do token de redefinição de senha.

---

## 2.2 Critérios Avaliados

| Critério | Status |
|---|---|
| Tipagem forte (`any` / casts sem verificação) | ⚠️ Parcial (BKD-02) |
| Tratamento de valores numéricos (parse de tamanhos/limites/porta) | ❌ Falho (BKD-03) |
| Validação de fluxos sensíveis (reset senha, sign-out, refresh) | ⚠️ Parcial (BKD-01, BKD-07) |
| Confiabilidade da trilha de auditoria | ⚠️ Parcial (BKD-04) |
| Throttling e respostas de rate limit | ⚠️ Parcial (BKD-05) |
| Consistência de jobs de limpeza (transações) | ⚠️ Parcial (BKD-06) |
| Tratamento de exceções em serviços de infra | ⚠️ Parcial (BKD-08) |
| Mitigações defensivas de upload (magic bytes, zip-bomb, limite por arquivo) | ✅ Adequado (GAP-01/GAP-04) |
| Correlação de logs de auditoria (request-id) | ✅ Adequado (GAP-02) |
| Rate limit global e por rota | ✅ Adequado (ThrottlerModule + `@Throttle`) |

---

## 2.3 Achados Detalhados

### BKD-01 — `resetPassword()` não valida a expiração do token de redefinição

- **Problema:** O fluxo `POST /api/auth/resetPassword` aceita um token mesmo após a expiração de 1 hora definida na criação. Apenas a existência do token é checada; `verifyAccount()` (o fluxo análogo de ativação) faz a checagem de expiração, mas `resetPassword()` não. O token expirado permanece utilizável até o cron horário de limpeza remover o registro.
- **Localização:** `backend/src/auth/auth.service.ts` — `requestResetPassword()` l.147-173 (cria token com `expiresAt: dayjs().add(1, "hour")`) e `resetPassword()` l.175-193 (sem checagem de expiração).
- **Evidência:**
  - `verifyAccount()` l.195-204: `if (!user || (user.activationTokenExpiresAt && user.activationTokenExpiresAt < new Date()))` — checa expiração.
  - `resetPassword()` l.175-193: apenas `findFirst({ where: { resetPasswordToken: { token } } })` e, se encontrado, atualiza a senha — **nenhuma comparação com `expiresAt`**.
- **Situação Atual:** Token criado com validade de 1 h (l.166); a expiração é apenas decorativa — o atacante com um token antigo (ex.: e-mail capturado/cacheado) pode redefinir a senha mesmo depois de expirado, enquanto o registro não for limpo.
- **Implementação (recomendada):** Verificar `resetPasswordToken.expiresAt` na consulta ou após o find, alinhando ao padrão de `verifyAccount()`.
- **Código Atual:**
  ```ts
  const user = await this.prisma.user.findFirst({
    where: { resetPasswordToken: { token } },
  });
  if (!user)
    throw new BadRequestException(this.i18n.t("auth.tokenInvalidOrExpired"));
  ```
- **Código Sugerido:**
  ```ts
  const user = await this.prisma.user.findFirst({
    where: {
      resetPasswordToken: {
        token,
        expiresAt: { gt: new Date() }, // expiração efetiva
      },
    },
  });
  if (!user)
    throw new BadRequestException(this.i18n.t("auth.tokenInvalidOrExpired"));
  ```
  (A limpeza do token continua no cron horário; a rejeição passa a ser imediata.)
- **Benefícios:** janela de validade do token passa a ser real; paridade com `verifyAccount()`; elimina redefinição de senha por token vencido.
- **Riscos:** nenhum funcional relevante; caso haja clock skew extremo entre serviços, tolerância pode ser adicionada (ex.: +60 s).
- **Compatibilidade:** nenhuma mudança de contrato de API — somente rejeição mais restritiva de tokens vencidos.

---

### BKD-02 — Tipos `any` difusos em `ConfigService.get()` e `ShareService.get()`

- **Problema:** Métodos centrais retornam `any`, transferindo toda a responsabilidade de narrowing para os callers e desligando o type-checker nesses pontos. Erros de tipo só aparecem em runtime (ex.: `parseInt(undefined)`, acesso a campo inexistente).
- **Localização:** `backend/src/config/config.service.ts:102-118`; `backend/src/share/share.service.ts:303-304` e `transformShare()` (l.501); `backend/src/share/guard/shareSecurity.guard.ts` (cast `as Prisma.ShareGetPayload<...>`).
- **Evidência:**
  - `config.service.ts:103`: `get(key: `${string}.${string}`): any` (com `eslint-disable` referenciando issue #6).
  - `share.service.ts:304`: `async get(id: string): Promise<any>` (mesmo padrão).
  - `config.service.ts:113`: `return parseInt(value)` — o retorno "any" mascara que o tipo depende da categoria configurada.
- **Situação Atual:** Cada chamada de `config.get("share.allowRegistration")` devolve `any`; erros de chave/valor só explodem em runtime. `ShareService.get()` devolve payload Prisma bruto sem tipo de contrato.
- **Implementação (recomendada):** Tornar `get<T>(key): T` com overloads ou um mapa tipado de configuração; tipar o retorno de `ShareService.get()` com um `ShareDTO`/payload tipado; substituir casts no guard por tipos derivados do Prisma.
- **Código Atual:**
  ```ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(key: `${string}.${string}`): any { ... }
  ```
- **Código Sugerido:**
  ```ts
  // Contrato tipado por categoria (ex.: ConfigMap) com generics + fallback:
  get<T = unknown>(key: `${string}.${string}`): T {
    const variable = this.configVariables.find(
      (v) => `${v.category}.${v.name}` === key,
    );
    if (!variable) throw new Error(`Config variable ${key} not found`);
    const value = variable.value ?? variable.defaultValue;
    if (variable.type === "number" || variable.type === "filesize")
      return parseInt(value) as unknown as T;
    if (variable.type === "boolean") return (value === "true") as unknown as T;
    if (variable.type === "timespan") return stringToTimespan(value) as unknown as T;
    return value as unknown as T;
  }
  // ShareService.get: substituir Promise<any> por um tipo de contrato
  async get(id: string): Promise<ShareDetailDTO> { ... }
  ```
- **Benefícios:** detecção de erro em compilação; auto-complete no IDE; reduz risco de `parseInt(undefined)` e de casts manuais; facilita refatoração.
- **Riscos:** correção de tipos em ~40 call sites de `config.get()`; possível esforço inicial médio; exige `as unknown as` pontual até existir mapa tipado completo.
- **Compatibilidade:** nenhuma mudança de API em runtime — mudança apenas de assinaturas TypeScript.

---

### BKD-03 — `parseInt` sem guarda de NaN em tamanhos/limites; `File.size` como `String`

- **Problema:** Tamanhos e limites numéricos passam por `parseInt()` sem checagem de `NaN`. Se um valor armazenado/fornecido for malformado, `NaN` em comparações `>` sempre retorna `false` — os limites (zip-bomb, tamanho total do share, tamanho por arquivo) podem ser **silenciosamente contornados**.
- **Localização:**
  - `backend/src/share/share.service.ts:135` — `files.reduce((sum, f) => sum + parseInt(f.size), 0)` (checagem de `zipMaxTotalSize`).
  - `backend/src/file/local.service.ts:121-132` — `shareSizeSum` + `globalLimit`/`userLimit` (`parseInt(this.config.get("share.maxSize"))` etc.).
  - `backend/src/file/local.service.ts:143` — `maxFileSize` (`share.maxFileSize`).
  - `backend/src/config/config.service.ts:113` — `parseInt(value)` para tipos `number`/`filesize`.
  - `backend/src/utils/date.util.ts:40` — `parseInt` em `stringToTimespan`.
- **Evidência:** `schema.prisma` modela `File.size` como `String`; todos os consumidores fazem `parseInt(f.size)`. O valor é escrito pelo próprio sistema (upload chunked), mas qualquer corrupção (bug, migração, edição manual de DB) transforma o limite em `NaN` e desativa a proteção.
- **Situação Atual:** proteções ativas enquanto os valores forem numéricos válidos; degradam para "ilimitado" se qualquer tamanho virar `NaN`.
- **Implementação (recomendada):** (a) migrar `File.size` para tipo numérico (BigInt/Decimal) — Fase 4; (b) em todos os pontos de parse, validar com helper `toSafeNumber(value, fallback)` que lança `BadRequestException`/`InternalServerErrorException` em vez de propagar `NaN`.
- **Código Atual:**
  ```ts
  const totalSize = files.reduce((sum, f) => sum + parseInt(f.size), 0);
  if (totalSize > MAX_TOTAL_SIZE) { throw ... }
  ```
- **Código Sugerido:**
  ```ts
  const totalSize = files.reduce((sum, f) => {
    const size = Number(f.size);
    if (!Number.isFinite(size))
      throw new InternalServerErrorException(`Invalid stored file size: ${f.size}`);
    return sum + size;
  }, 0);
  ```
- **Benefícios:** proteções de tamanho não podem ser desarmadas por `NaN`; falha explícita em vez de degradação silenciosa; pré-requisito para migração de tipo da Fase 4.
- **Riscos:** rejeição de um share cujo tamanho armazenado esteja corrompido (comportamento desejável); migração de `File.size` é mudança de schema (avaliada na Fase 4).
- **Compatibilidade:** nenhuma mudança de API pública; muda apenas a robustez interna.

---

### BKD-04 — `DownloadLogService.record()` engole falhas de escrita da trilha de auditoria

- **Problema:** A trilha de auditoria (eventos `download|view|upload|delete`) é o requisito central do sistema (cf. `docs/Padronizacao`). Em caso de falha de escrita no banco, `record()` apenas loga um `warn` e **retorna sucesso** — o evento de auditoria é perdido silenciosamente, sem retry nem sinalização ao chamador.
- **Localização:** `backend/src/download-log/download-log.service.ts:38-65` (`record()` com `try/catch` + `logger.warn`).
- **Evidência:** l.59-64 — `catch (err) { this.logger.warn("Failed to record download log: ...") }`. Nenhum mecanismo de retry, fila ou flag de integridade.
- **Situação Atual:** sob pressão de escrita (lock do SQLite, transação concorrente) um download/view pode não ser registrado sem que ninguém perceba — comprometendo a auditoria exigida pelo produto.
- **Implementação (recomendada):** Em falha transitória, re-tentar uma vez com pequeno backoff e, se persistir, registrar em fila em memória/disco (ex.: `pino` para `stderr` capturado pelo Loki) com uma entrada marcada como não persistida; opcionalmente expor métrica (Prometheus). Manter a chamada não-bloqueante ao fluxo de download.
- **Código Atual:**
  ```ts
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    this.logger.warn(`Failed to record download log: ${message}`);
  }
  ```
- **Código Sugerido:**
  ```ts
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    // Retry único com backoff curto (falhas transitórias de lock do SQLite)
    try {
      await new Promise((r) => setTimeout(r, 50));
      await this.prisma.downloadLog.create({ data: {...} });
    } catch (err2) {
      const message2 = err2 instanceof Error ? err2.message : "unknown error";
      this.logger.error(`Download log failed after retry: ${message2}`, {
        requestId: getRequestContext()?.requestId,
        entry,
      });
      // Opcional: incrementa métrica `audit_log_dropped_total`
    }
  }
  ```
- **Benefícios:** trilha de auditoria mais confiável; visibilidade de perdas via log estruturado/métricas; atende ao requisito de auditoria do produto.
- **Riscos:** retry adiciona até ~50 ms em falha; complexidade moderada; exige monitorar o log de erro.
- **Compatibilidade:** nenhuma mudança de API; a assinatura `record()` permanece.

---

### BKD-05 — `ThrottlerExceptionFilter` informa `Retry-After` fixo em 60 s

- **Problema:** O filtro customizado de rate limit responde sempre com `Retry-After: 60` e mensagem "60 segundos", mas várias rotas públicas usam `ttl` de **5 minutos** (300 s) — `signUp`, `resetPassword`, `verify`, `resendVerification`. O cliente (e o usuário) recebe uma instrução de retry incorreta.
- **Localização:** `backend/src/throttler/throttler-exception.filter.ts:13-32`.
- **Evidência:** `const retryAfter = 60;` (l.13) hardcoded; `auth.controller.ts` define `@Throttle({ limit: 20, ttl: 5 * 60 * 1000 })` em 4 rotas.
- **Situação Atual:** header e mensagem divergem da política real; cliente com retry automático respeitando `Retry-After` re-tenta em 60 s e é bloqueado novamente até o ttl real.
- **Implementação (recomendada):** Obter o ttl da política ativa do `ThrottlerStorage`/`ThrottlerModuleOptions` (via `getThrottlerStorage()` + configuração) ou propagar o ttl da exceção; caso não resolvível, usar `retryAfter` configurável por rota. Ex.: usar o valor retornado por `storage.getRecord` para calcular tempo restante real.
- **Código Atual:**
  ```ts
  const retryAfter = 60;
  ...
  response.setHeader("Retry-After", String(retryAfter));
  ```
- **Código Sugerido:**
  ```ts
  // derive do storage ativo (ex.: ThrottlerStorageRecord) o tempo restante real
  const timeToBlock = await this.storage.getRecord?.(...) ?? 60;
  const retryAfter = Math.ceil(timeToBlock / 1000);
  response.setHeader("Retry-After", String(retryAfter));
  ```
- **Benefícios:** header/mensagem precisos; clientes automáticos (e usuários) respeitam o bloqueio real; UX coerente.
- **Riscos:** baixo; requer acesso ao storage do throttler (DI do módulo).
- **Compatibilidade:** mesma resposta 429; muda apenas o valor do header/mensagem.

---

### BKD-06 — Jobs de limpeza de shares expirados sem transação (risco de órfãos)

- **Problema:** `deleteExpiredShares`/`deleteUnfinishedShares` removem arquivos do disco e depois a linha do banco em passos separados e não atômicos. Falha entre os dois passos deixa **arquivos órfãos no disco** ou **registro órfão sem arquivos**.
- **Localização:** `backend/src/jobs/jobs.service.ts` — `deleteExpiredShares()` (`@Cron("* * * * *")`), `deleteUnfinishedShares()`, e o serviço de remoção de arquivos do `FileService`.
- **Evidência:** `share.fileRetentionPeriod` (`{ value, unit }`) + filtro `expiration != EPOCH_ZERO`; a exclusão em disco e no banco não está em um único escopo transacional nem tem fase de reconciliação.
- **Situação Atual:** na prática as falhas são raras (mesmo processo, mesmo host), mas sob erro de I/O ou interrupção do container o par disco/banco dessincroniza sem detecção — disco cresce com lixo ou links quebrados.
- **Implementação (recomendada):** (a) apagar a linha do banco **primeiro** e então remover os arquivos em `try/catch` (best-effort), registrando remoções de disco falhas para retry; ou (b) introduzir job de reconciliação periódica que apaga diretórios de shares sem registro. Avaliar também marcar `deletedAt` e usar `soft delete` para permitir reconciliação.
- **Código Atual:**
  ```ts
  // (formato atual, simplificado)
  await this.fileService.deleteAllFiles(shareId); // passo 1 — disco
  await this.prisma.share.delete({ where: { id: shareId } }); // passo 2 — banco
  ```
- **Código Sugerido:**
  ```ts
  await this.prisma.share.delete({ where: { id: shareId } }); // 1º banco (referencial)
  try {
    await this.fileService.deleteAllFiles(shareId); // 2º disco, best-effort
  } catch (err) {
    this.logger.error(`Orphan files for share ${shareId}`, err); // retry no próximo cron
  }
  ```
- **Benefícios:** nenhum share visível aponta para arquivos inexistentes; lixo de disco fica visível em log e pode ser reconciliado; comportamento previsível.
- **Riscos:** se o delete do banco falhar, o arquivo permanece (como hoje); ordem invertida exige teste do job.
- **Compatibilidade:** nenhuma mudança de API.

---

### BKD-07 — `signOut()` usa `jwtService.decode()` sem verificar assinatura

- **Problema:** Para encontrar o `refreshTokenId` a revogar, `signOut()` decodifica o access token com `jwtService.decode()` (que **não valida** assinatura nem expiração). O restante do fluxo valida tokens com `verify()`/guards; o sign-out opera com dados não autenticados.
- **Localização:** `backend/src/auth/auth.service.ts:287-301`.
- **Evidência:** `const { refreshTokenId } = (this.jwtService.decode(accessToken) as { refreshTokenId: string }) || {};` — decode sem verify; o cookie `access_token` é httpOnly e o guard já validou no middleware, mas o serviço não reaproveita essa garantia.
- **Situação Atual:** impacto prático baixo (um token forjado apenas falha o `delete` com `P2025`, ignorado); porém a prática é frágil e confusa para auditoria.
- **Implementação (recomendada):** Validar o token com `verify()` antes de extrair o `refreshTokenId` (com `ignoreExpiration: true` apenas para permitir sign-out de token expirado), ou extrair o `refreshTokenId` do payload já validado pelo guard (decorator `GetUser`/request context).
- **Código Atual:**
  ```ts
  const { refreshTokenId } = (this.jwtService.decode(accessToken) as {
    refreshTokenId: string;
  }) || {};
  ```
- **Código Sugerido:**
  ```ts
  const payload = this.jwtService.verify<{ refreshTokenId?: string }>(
    accessToken,
    { secret: this.config.get("internal.jwtSecret"), ignoreExpiration: true },
  );
  const refreshTokenId = payload?.refreshTokenId;
  ```
- **Benefícios:** coerência com o restante do fluxo; elimina decodificação de input não confiável; facilita auditoria de segurança.
- **Riscos:** baixo; `ignoreExpiration: true` deve ser explícito e comentado (token expirado ainda deve poder revogar o refresh).
- **Compatibilidade:** nenhuma mudança de contrato.

---

### BKD-08 — `ConfigService.get()` lança `Error` puro para chave inexistente

- **Problema:** `get()` lança `new Error(...)` (l.108) quando a chave não é encontrada. Se invocado dentro de um handler de rota (ex.: um endpoint que depende de chave removida da config), o erro escapa como **HTTP 500 genérico** sem passar pelo formato de erro do Nest.
- **Localização:** `backend/src/config/config.service.ts:108`.
- **Evidência:** `if (!configVariable) throw new Error(\`Config variable ${key} not found\`);` — usada largamente em services/controllers.
- **Situação Atual:** hoje as chaves vêm do schema e existem, então o erro é improvável; porém é um comportamento não tipado que pode surpreender em manutenção futura.
- **Implementação (recomendada):** Lançar `NotFoundException` do Nest (ou manter `Error` mas documentar que só deve ser usado fora do contexto HTTP); melhor ainda, permitir `get(key, fallback)` para default explícito em pontos não-críticos.
- **Código Atual:**
  ```ts
  if (!configVariable) throw new Error(`Config variable ${key} not found`);
  ```
- **Código Sugerido:**
  ```ts
  if (!configVariable)
    throw new NotFoundException(`Config variable ${key} not found`);
  ```
- **Benefícios:** erro estruturado quando exposto a HTTP; falha clara em startup (o Nest loga a exceção de forma rastreável).
- **Riscos:** nenhum funcional relevante.
- **Compatibilidade:** mesma assinatura; muda apenas o tipo da exceção.

---

## 2.4 Fortalezas / Mitigações já existentes (não são achados)

- **Upload defensivo:** validação de magic bytes no chunk final (GAP-01), allow-list de extensões/MIME (MED-06), validação de UUID, checagem de espaço em disco (`fs.statfs`) por chunk, limite por arquivo (`share.maxFileSize`) e limite total (`share.maxSize`/`shareSizeLimit`).
- **Proteção contra zip-bomb configurável** (GAP-04): `zipMaxFiles`, `zipMaxTotalSize`, `zipMaxRatio`, aborte com cap de bytes emitidos.
- **Throttling:** global 100/60 s + `@Throttle` por rota sensível (signIn 5/60 s; signUp, reset, verify 20/5 min; signIn/totp 5/60 s).
- **CSRF double-submit cookie** + `MUTATING_METHODS` (POST/PUT/PATCH/DELETE) em `main.ts`.
- **JWT rotation** no refresh token (token antigo deletado a cada renovação) e revogação de refresh tokens na troca de senha.
- **Correlação de logs** via `AsyncLocalStorage` (`requestId`, `ip`, `userId`) aplicada ao `DownloadLog`.
- **Throttle de atualização de metadados:** `touchShare()` com `UPDATED_AT_THROTTLE_MS = 5*60*1000` e cooldown de notificação de download `DOWNLOAD_NOTIFICATION_COOLDOWN_MS = 15*60*1000` — evita saturação de escrita no SQLite.
- **`deleteExpiredShares`** respeita `fileRetentionPeriod` e exclui sentinelas `EPOCH_ZERO` (nunca expira).

---

## 2.5 Classificação Risco × Impacto × Esforço

| ID | Achado | Risco | Impacto | Esforço | Quick Win? |
|---|---|---|---|---|---|
| BKD-01 | `resetPassword()` sem checagem de expiração do token | Alto | Segurança | Muito Baixo | ✅ (1 linha) |
| BKD-02 | Tipos `any` difusos (`ConfigService.get`, `ShareService.get`) | Médio | Manutenibilidade | Médio | ❌ |
| BKD-03 | `parseInt` sem guarda de NaN (tamanhos/limites) + `File.size` String | Médio | Segurança | Médio | ⚠️ parcial |
| BKD-04 | Trilha de auditoria com falha engolida no `record()` | Médio | Disponibilidade | Médio | ❌ |
| BKD-05 | `Retry-After` fixo 60 s no filtro de throttling | Médio | Disponibilidade | Muito Baixo | ✅ |
| BKD-06 | Jobs de expiração sem transação (risco de órfãos) | Baixo | Disponibilidade | Médio | ❌ |
| BKD-07 | `signOut()` usa `jwtService.decode()` sem verificação | Baixo | Manutenibilidade | Baixo | ✅ |
| BKD-08 | `ConfigService.get()` lança `Error` puro | Baixo | Manutenibilidade | Muito Baixo | ✅ |

---

## 2.6 Recomendações Prioritárias

1. **BKD-01 (Alto, Quick Win):** validar `expiresAt` no `resetPassword()` — 1 linha, fecha janela de token vencido.
2. **BKD-03 (Médio):** helper `toSafeNumber` nos pontos de `parseInt` de tamanhos/limites — impede contorno de limites via `NaN`; prepara migração de `File.size` (Fase 4).
3. **BKD-05 (Médio, Quick Win):** `Retry-After` derivado do ttl real — coerência de rate limit.
4. **BKD-04 (Médio):** retry + log estruturado na trilha de auditoria — requisito central do produto.
5. **BKD-02 (Médio):** tipar `ConfigService.get<T>()` e o retorno de `ShareService.get()` — higiene de tipos.
6. **BKD-06/07/08 (Baixos):** ordem de exclusão em jobs, `verify()` no sign-out, exceção Nest na config — correções de robustez e coerência.

---

## 2.7 Notas de Execução

- Nenhum achado desta fase foi aplicado — refatoração e correções pertencem à Fase 12 (proposta) e ao plano de execução (Fase 13), salvo decisão explícita do solicitante.
- **Referências cruzadas para fases seguintes:** `File.size` como `String` (Fase 4 — Banco de Dados); throttling/CSRF/`signOut` (Fase 5 — Segurança); `parseInt` e queries de `getShares`/`findAll` (Fase 6 — Performance); `any` e loc de services (Fase 7 — Qualidade).
- Evidências coletadas em: `auth.service.ts`, `config.service.ts`, `share.service.ts`, `file/local.service.ts`, `download-log/download-log.service.ts`, `throttler/throttler-exception.filter.ts`, `jobs/jobs.service.ts`, `auth.controller.ts`, `main.ts`, `schema.prisma`.
