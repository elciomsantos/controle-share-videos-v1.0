# FASE-12-REFATORACAO.md — Auditoria do Controle Share Videos v1.0

| Campo  | Valor |
|--------|-------|
| Status | ✅ Concluída |
| Data   | 2026-08-04 |
| Escopo | Consolidação dos 75 achados das Fases 1–11, priorização e proposta de refatoração por item (problema/impacto, solução com base em documentação oficial, código atual × sugerido, benefícios/riscos) — **sem aplicar código** |

---

## 12.1 Resumo Executivo

A auditoria completa (Fases 1–11) produziu **75 achados** distribuídos em 11 domínios. Esta fase consolida esses achados em um único plano de refatoração priorizado e detalha, com **código atual × sugerido**, as **8 refatorações de maior retorno sobre investimento (ROI)**, cobrindo os 4 pilares de impacto:

- **Segurança**: JwtGuard fail-closed (SEC-01 — resolvido 2026-08-07) e tipagem de tamanho de arquivo (BDB-01) — as duas causas raiz mais perigosas.
- **Performance**: paginação de listagens (PERF-01) e limpeza de shares em lote (BDB-04/PERF-04).
- **Manutenibilidade**: god class `ShareService` (ARQ-02) e `get(): any` no `ConfigService` (QAL-03).
- **Qualidade/Operação**: infraestrutura de testes + CI (QTS-01/02/04 — resolvidos 2026-08-07) e correções de deploy Docker/Caddy (DOP-01/03/05).

Nenhuma alteração de código é aplicada nesta fase. A implementação é responsabilidade da **Fase 13 (Plano de Execução)** e deve respeitar o processo controlado de implementação definido na Especificação-final (commits atômicos, aprovação de mudança, verificação por testes antes/depois).

**Nota geral consolidada de refatorabilidade: 41/100** (média não ponderada das notas das Fases 1–11; o esforço para elevar é concentrado em 8 pontos de intervenção).

---

## 12.2 Critérios (fonte: `docs/auditoria/Especificacao-final.md` l.100-106, l.129-147, l.162-172)

Cada melhoria deve responder positivamente a:

1. Resolve um problema real?
2. Reduz complexidade?
3. Melhora segurança/desempenho?
4. Reduz dívida técnica?
5. Alinha-se com documentação oficial (NestJS/Prisma/React/Mantine)?
6. Não quebra compatibilidade (sem alterar APIs públicas sem justificativa)?
7. O benefício supera o custo?

Formato obrigatório por recomendação (10 campos): Problema, Localização, Evidência, Situação Atual, Implementação Recomendada, Código Atual, Código Sugerido, Benefícios, Riscos, Compatibilidade.

---

## 12.3 Metodologia de priorização

Prioridade = f(Severidade original, Alcance, Esforço estimado, Risco da mudança):

| Prioridade | Definição | Critério |
|------------|-----------|----------|
| **P0 — Crítico** | Vulnerabilidade ou bug de dados | Severidade 🔴 e correção de baixo risco |
| **P1 — Alto** | Degrada segurança/perf/disponibilidade | Severidade 🔴 ou 🟠 com impacto de produção |
| **P2 — Médio** | Dívida técnica que cresce com o tempo | 🟠/🟡 com custo-benefício claro |
| **P3 — Baixo/Backlog** | Polimento, ergonomia, semântica | 🟡 sem impacto funcional |

---

## 12.4 Tabela consolidada de achados (Fases 1–11) — 75 itens

### P0 — Crítico (corrigir primeiro)

| ID | Achado | Fase | Código Atual → Refatorar |
|----|--------|------|---------------------------|
| ~~SEC-01~~ | ~~`JwtGuard` global com fail-open (catch retorna config em erro)~~ | 5 | ✅ Resolvido 2026-08-07 — `jwt.guard.ts:35-40` lança `UnauthorizedException` no catch (fail-closed); spec cobre token inválido e ausente (5 testes, coverage 100%) |
| BDB-01 | `File.size`/`User.shareSizeLimit` como `String` → NaN em `parseInt` | 4 | `schema.prisma:106,21`; `share.service.ts:135,505`; `local.service.ts:122,128-130,203` |
| DOC-01 | ~20 referências quebradas no README | 11 | `README.md:18,38,80,139-169` |
| DOC-02 | `SECURITY.md` stub vazio | 11 | `SECURITY.md` (74 bytes) |

### P1 — Alto

| ID | Achado | Fase | Localização |
|----|--------|------|-------------|
| PERF-01 | Listagens de shares sem paginação (carrega tudo) | 6 | `share.service.ts:272-301` |
| ~~QAL-01 / QTS-01~~ | ~~Zero testes (unitário/frontend)~~ | 7/10 | ✅ Resolvido 2026-08-07 (R07) — 9 suites backend/77 testes + 5 testes Vitest frontend |
| ~~QTS-02~~ | ~~`test:system` destrutivo (`migrate reset -f`) + `newman` não declarado~~ | 10 | ✅ Resolvido 2026-08-07 — `test:system` delega ao `test:e2e` efêmero; `newman` em devDependencies |
| ~~QTS-04~~ | ~~Sem CI/gates~~ | 10 | ✅ Resolvido 2026-08-07 — `.github/workflows/ci.yml` (lint/build/unit/coverage/e2e) |
| INF-01 | Dependências vulneráveis (postcss/next) | 8 | `frontend/package.json` |
| ~~DOP-01~~ | ~~`frontend` usa `target: frontend-builder` (inalcançável em prod)~~ | 9 | ✅ Resolvido 2026-08-07 — compose base usa `target: frontend-runner` + `command` do servidor standalone; validado HTTP 200 na 3333 |
| ~~DOP-05~~ | ~~`Caddyfile.prod` usa `{$DOMAIN}`/`{$ACME_EMAIL}`; compose injeta `*_FILE` (Caddy não expande)~~ | 9 | ✅ Resolvido 2026-08-07 — `reverse-proxy/entrypoint.sh` expande `*_FILE` → `DOMAIN`/`ACME_EMAIL`; validado |
| SEC-03 | Tokens em memória/duplicidade de refresh rotation | 5 | `auth/` |
| SEC-04 | `i`/segredos em configuração | 5 | `config.seed.ts` |
| BDB-04 | Jobs de limpeza sem transação/batching | 4 | `jobs.service.ts:21-56` |
| ~~QAL-02~~ | ~~`ClamSca...` (flag/estado não implementado)~~ | 7 | ✅ Resolvido 2026-08-07 — módulo removido (decisão formal rejeita ClamAV) |
| ~~DOC-03~~ | ~~Decisão ClamAV conflitante (README × Visão-geral × código)~~ | 11 | ✅ Resolvido 2026-08-07 — README sem menções; visão formal alinhada |

### P2 — Médio

| ID | Achado | Fase |
|----|--------|------|
| ARQ-02 | God class `ShareService` (772 LOC, 27 métodos) | 1 |
| ARQ-03 | Código duplicado e divergente (frontend/backend parse) | 1 |
| BKD-01 | `resetPassword()` reutilizado em fluxos | 2 |
| BKD-03 / FRN-03 | `parseInt` de tamanho com `NaN` | 2/3 |
| BKD-06 / PERF-04 | Limpeza sem batch e I/O síncrono | 2/6 |
| BKD-08 / FRN-04 | Tipos `any` e props mutáveis | 2/3 |
| FRN-01/02/12 | Estado mutável, gatilhos, mutação por referência | 3 |
| FRN-05 | Fallback silencioso | 3 |
| BDB-02/03 | Índices ausentes; listagem N+1 | 4 |
| SEC-05 | Cabeçalhos de segurança opt-in | 5 |
| ~~SEC-06/07~~ | Rotação/expiração de refresh token | 5 ✅ (2026-08-07) |
| PERF-02 | E-mails enviados sequencialmente | 6 |
| PERF-03 | `createZip()` abre até `zipMaxFiles` streams simultâneos | 6 |
| PERF-05 | `deleteTemporaryFiles()` I/O síncrono | 6 |
| QAL-03 | `get(): any` e `parseInt` espalhado | 7 |
| QAL-04/05 | Disciplina de erros; TODOs com impacto de segurança | 7 |
| INF-02/03 | Rotina de atualização; dependências | 8 |
| ~~DOP-03~~ | ~~`DATABASE_URL` fora do volume~~ | 9 | ✅ Resolvido — compose base usa `file:/opt/app/backend/data/controle-videos.db` (commit `272e204`) |
| ~~DOP-04~~ | ~~Compose base superseded (Caddy 2.8→2.9, secrets mortos)~~ | 9 | ✅ Resolvido 2026-08-07 — base consolidado (Caddy 2.9 custom, `frontend-runner`, `DATABASE_URL` no volume); secrets mortos removidos; admin bootstrap por env; sem `./secrets/*.txt`; pasta `secrets/` órfã (com `Admin@123` em texto-plano) **deletada** |
| QTS-03 | Cobertura coleção e2e só auth+share | 10 |
| QTS-05 | Credenciais/URL hardcoded no Newman | 10 |
| DOC-04/05 | Sem `license`/`repository`; `.env.local.example` incompleto | 11 |

### P3 — Baixo / Backlog

ARQ-01 (dependências/tamanho), ARQ-04 (boilerplate guardas), BKD-02/04/05/07 (tipos, parse, throttler, `sig`), FRN-06 (`user-scalable=no`), FRN-07 (preview PDF), FRN-08, FRN-09 (`target=_blank`), FRN-10/11 (strikethrough, chaves de lista), BDB-05/06 (seed, `ShareRecipie`), ~~SEC-08~~ (pago 2026-08-07 — fail-closed magic bytes), PERF-06/07 (stream sem Range; health lê `Config`), QAL-06 (duplicação leve), INF-04 (higiene), ~~DOP-02~~ (ClamAV — encerrado 2026-08-07 por decisão formal; serviço/dep/módulo removidos), ~~DOP-04~~ (compose base consolidado), ~~DOP-06~~ (imagens monitoring pinadas 2026-08-07), ~~DOP-08~~ (healthcheck leve `SELECT 1` 2026-08-07, ↔ PERF-07), QTS-06/07 (`@nestjs/testing` órfão).

---

## 12.5 Refatorações prioritárias (R01–R08) — formato 10 campos

### R01 — `File.size` e `User.shareSizeLimit` como número inteiro (não `String`)

1. **Problema**: Tamanhos de arquivo e cota armazenados como `String` no banco. Todo consumo faz `parseInt(size)`, que retorna `NaN` para valores inválidos e quebra somas de cotas (vídeo pode exceder 2^31 → `Int` insuficiente; `BigInt` é o correto). Corrupção de dado única → cotas liberadas/erradas, upload sem limite.
2. **Localização**: `backend/prisma/schema.prisma:106` (`File.size String`), `:21` (`User.shareSizeLimit String?`); `backend/src/share/share.service.ts:135,505`; `backend/src/file/local.service.ts:92-93,122,128-130,163-164,203,288`; `frontend/src/components/upload/EditableUpload.tsx:66-72`; `frontend/src/components/upload/FileList.tsx:68`.
3. **Evidência**: Prisma — tipo `BigInt` para inteiros 64-bit (arquivo grande em bytes); Prisma serializa `BigInt` como string JSON, exigindo conversão explícita no DTO.
4. **Situação Atual**: `size String`; `reduce((acc, f) => acc + parseInt(f.size), 0)`; gravação `size: fileSize.toString()`.
5. **Implementação Recomendada**: migrar para `BigInt`; concentrar conversão para `Number` (seguro < 2^53 bytes) em um único ponto do `transformShare`/DTO; eliminar `parseInt` espalhado.
6. **Código Atual**:
   ```prisma
   model File {
     size String
   }
   model User {
     shareSizeLimit String?
   }
   ```
   ```ts
   // share.service.ts:135
   const totalSize = files.reduce((sum, f) => sum + parseInt(f.size), 0);
   ```
   ```ts
   // local.service.ts:203
   size: fileSize.toString(),
   ```
7. **Código Sugerido**:
   ```prisma
   model File {
     size BigInt
   }
   model User {
     shareSizeLimit BigInt?
   }
   ```
   ```ts
   // DTO centralizado (ex.: share.dto.ts)
   const toBytes = (v: bigint | number): number =>
     Number(v) >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : Number(v);

   // share.service.ts — substitui parseInt
   const totalSize = files.reduce((sum, f) => sum + toBytes(f.size), 0);
   ```
   ```ts
   // local.service.ts:203 — grava sem passar por string
   size: BigInt(fileSize),
   ```
8. **Benefícios**: Segurança (sem `NaN` liberando cota); correção de dados; legibilidade; elimina N pontos de `parseInt` (FRN-03/BKD-03).
9. **Riscos**: Migração precisa de `migrate` com coerção (`String` → `BigInt` via `UPDATE ... CAST`); frontend que recebia `size` como string (JSON de `BigInt` também é string) precisa de parse para `Number` no cliente — corrigir em `FileList.tsx:68` (`+file.size`).
10. **Compatibilidade**: Quebra de contrato de dados exige **deploy coordenado backend+frontend** e script de migração; API pública de nome de campo inalterada.

---

### R02 — `JwtGuard`: fail-open → fail-closed — ✅ **Resolvido 2026-08-07**

1. **Problema**: Qualquer erro de autenticação (token expirado, malformado, serviço indisponível) cai no `catch` e retorna `allowUnauthenticatedShares`, tornando rotas protegidas **acessíveis sem autenticação**.
2. **Localização**: `backend/src/auth/guard/jwt.guard.ts:36-38`; config `share.allowUnauthenticatedShares`.
3. **Evidência**: `@nestjs/passport` — `AuthGuard` lança `UnauthorizedException` ao falhar; capturar e devolver `true` é antípoda ao fail-closed.
4. **Situação Atual**:
   ```ts
   } catch {
     return this.config.get("share.allowUnauthenticatedShares");
   }
   ```
5. **Implementação Recomendada**: Remover o catch global. Se o anonimato for desejado, declarar explicitamente em rotas específicas via `@Public()`, não desativando auth globalmente. Alternativa conservadora: logar e relançar (`throw new UnauthorizedException()`).
6. **Código Atual**: ver item 4.
7. **Código Sugerido**:
   ```ts
   try {
     const result = (await super.canActivate(context)) as boolean;
     const req = context.switchToHttp().getRequest<{ user?: { id?: string } }>();
     if (req?.user?.id) enhanceRequestContext({ userId: req.user.id });
     return result;
   } catch (error) {
     // fail-closed: nunca degradar para anônimo por erro de auth
     this.logger?.warn?.(`JwtGuard rejeitou requisição: ${String(error)}`);
     throw error; // UnauthorizedException propagada
   }
   ```
   Rotas realmente públicas já são marcadas com `@Public()` (decorator existente) e retornam `true` antes do guard.
8. **Benefícios**: Segurança (elimina bypass); previsibilidade; auditoria via log.
9. **Riscos**: Se alguma rota depende do fallback de anonimato sem `@Public()`, passa a exigir token — **auditar rotas antes**; verificar fluxo de download por e-mail (possui guard próprio `shareTokenSecurity`).
10. **Compatibilidade**: Retroativa para quem tem `allowUnauthenticatedShares` ativo; mitigável adicionando `@Public()` nas rotas legítimas.

---

### R03 — Paginação nas listagens de shares

1. **Problema**: `getShares()`/`getSharesByUser()` retornam **todos** os shares (incluindo `files`/`recipients`) — degrada com o volume e amplia N+1.
2. **Localização**: `backend/src/share/share.service.ts:272-301`; controller em `backend/src/share/`.
3. **Evidência**: Prisma `findMany` com `take`/`skip`/cursor; paginação padrão de API REST (`?page=&perPage=`).
4. **Situação Atual**: `findMany({ orderBy, include })` sem limites.
5. **Implementação Recomendada**: aceitar `page`/`perPage` (com defaults e teto), retornar `{ items, total, page, totalPages }`; opcionalmente cursor por `createdAt`.
6. **Código Atual**: ver item 4 (trecho `getShares`, l.272-281).
7. **Código Sugerido**:
   ```ts
   interface Page<T> { items: T[]; total: number; page: number; perPage: number; totalPages: number; }

   async getShares(page = 1, perPage = 25): Promise<Page<Share>> {
     const take = Math.min(Math.max(perPage, 1), 100);
     const skip = (Math.max(page, 1) - 1) * take;
     const [shares, total] = await Promise.all([
       this.prisma.share.findMany({
         orderBy: { expiration: "desc" },
         include: { files: true, creator: true, security: true, recipients: true },
         take,
         skip,
       }),
       this.prisma.share.count(),
     ]);
     return {
       items: shares.map((s) => this.transformShare(s)),
       total,
       page,
       perPage: take,
       totalPages: Math.ceil(total / take),
     };
   }
   ```
8. **Benefícios**: Performance (limita payload); escalabilidade; base para UI de paginação.
9. **Riscos**: Contrato de resposta muda (adiciona envelope) — clientes atuais esperam array; compatível via campo `items` + ajuste do frontend.
10. **Compatibilidade**: Mudança de shape da resposta = **major para consumidores da API**; mitigar mantendo resposta anterior com `perPage` alto por padrão em v1 e documentando a mudança.

---

### R04 — Limpeza de shares expirados: lote + transação + isolamento de erro

1. **Problema**: Job minuto a minuto deleta share a share (N+1), sem transação e sem isolamento — um share com erro interrompe o restante; I/O de arquivos síncrono.
2. **Localização**: `backend/src/jobs/jobs.service.ts:21-56`.
3. **Evidência**: `@nestjs/schedule` `@Cron`; Prisma `deleteMany`/`$transaction` para operações atômicas.
4. **Situação Atual**:
   ```ts
   @Cron("* * * * *")
   async deleteExpiredShares() {
     const expiredShares = await this.prisma.share.findMany({...});
     for (const expiredShare of expiredShares) {
       await this.fileService.deleteAllFiles(expiredShare.id);
       await this.prisma.share.delete({ where: { id: expiredShare.id } });
     }
   }
   ```
5. **Implementação Recomendada**: processar em lotes de N; `try/catch` por item com log; remoção em `deleteMany` dentro de `$transaction`; deleção de arquivos com concorrência limitada.
6. **Código Atual**: ver item 4.
7. **Código Sugerido**:
   ```ts
   @Cron("* * * * *")
   async deleteExpiredShares() {
     const thresholdDate = new Date();
     let deleted = 0;
     while (true) {
       const batch = await this.prisma.share.findMany({
         where: { expiration: { lt: thresholdDate } },
         take: 50,
         select: { id: true },
       });
       if (batch.length === 0) break;
       for (const { id } of batch) {
         try {
           await this.fileService.deleteAllFiles(id);
           await this.prisma.share.deleteMany({ where: { id } });
           deleted++;
         } catch (err) {
           this.logger.error(`Falha ao limpar share ${id}: ${String(err)}`);
         }
       }
     }
     if (deleted > 0) this.logger.log(`Deleted ${deleted} expired shares`);
   }
   ```
8. **Benefícios**: Disponibilidade (isolamento de erro); performance (lote); manutenção.
9. **Riscos**: `deleteAllFiles` continua fora de transação DB (arquivos ≠ DB); em caso de falha parcial, arquivos órfãos são detectáveis por job de reconciliação.
10. **Compatibilidade**: Nenhuma mudança de API pública.

---

### R05 — Decomposição da god class `ShareService`

1. **Problema**: 772 LOC, 27 métodos — mistura orquestração, validação, mapeamento DTO e acesso a dados; dificulta testes e revisão.
2. **Localização**: `backend/src/share/share.service.ts` (inteiro); `backend/src/share/storage/*`; guards em `backend/src/share/guard/*`.
3. **Evidência**: padrões NestJS de serviços pequenos + composição por injeção (fornecedores `useFactory`), validação em guards/pipes.
4. **Situação Atual**: `ShareService` centraliza upload (chunk, limite, vírus), criação, listagem, ZIP, refresh e remoção.
5. **Implementação Recomendada**:
   - `ShareService` → orquestração fina (criação/consulta/remoção).
   - Extrair **mapeamento** para `share.mapper.ts` (remove `transformShare`).
   - Extrair **upload/física** para `FileStorageService` (já parcial em `local.service.ts`).
   - Manter **validação** em guards (já existem: `shareSecurity`, `downloadLimit`, `strictShareOwner`).
   - Extrair **zip/lotes** para `ShareArchiveService`.
6. **Código Atual**: classe única `@Injectable() export class ShareService`.
7. **Código Sugerido**:
   ```ts
   // share.module.ts
   @Module({
     providers: [
       ShareService,           // orquestração
       ShareMapper,            // DTO
       ShareArchiveService,    // createZip / streaming
       FileStorageService,     // física + cotas
       ...guards,
     ],
   })
   ```
8. **Benefícios**: Manutenção; testabilidade (injeção por unidade); legibilidade; reduz acoplamento.
9. **Riscos**: Refatoração ampla; exige **testes de regressão antes** (reforça R07); movimento de métodos sem mudança de comportamento.
10. **Compatibilidade**: Total — nenhuma API externa muda; apenas organização interna.

---

### R06 — Config tipada: eliminar `get(): any`

1. **Problema**: `ConfigService.get(key)` retorna `any`; chamadas fazem `parseInt` manual (NaN) e perdem verificação em tempo de compilação.
2. **Localização**: `backend/src/config/config.service.ts:103-115`; consumidores (`local.service.ts:128,143`; `EditableUpload.tsx:37,66`).
3. **Evidência**: TypeScript `Record`/unions para contratos; NestJS `ConfigModule` com tipagem por serviço.
4. **Situação Atual**:
   ```ts
   get(key: `${string}.${string}`): any {
     ...
     if (configVariable.type == "number" || configVariable.type == "filesize")
       return parseInt(value);
   }
   ```
5. **Implementação Recomendada**: criar `type ConfigKeys = "share.maxSize" | "share.chunkSize" | ...` e sobrecargas por tipo (`getNumber`, `getBoolean`, `getString`), eliminando o `any`.
6. **Código Atual**: ver item 4.
7. **Código Sugerido**:
   ```ts
   type ConfigKeys =
     | "share.maxSize" | "share.chunkSize" | "share.maxFileSize"
     | "share.allowUnauthenticatedShares" | /* ... */;

   getNumber(key: ConfigKeys): number { return Number(this.get(key)); }
   getBoolean(key: ConfigKeys): boolean { return this.get(key) === "true"; }

   // consumidor (local.service.ts:128)
   const globalLimit = this.config.getNumber("share.maxSize");
   ```
8. **Benefícios**: Segurança (elimina NaN); legibilidade; erros em compilação; reduz QAL-03/BKD-08/FRN-04.
9. **Riscos**: `get` continua existindo para compatibilidade; migração incremental por chamador.
10. **Compatibilidade**: Adição é retrocompatível; remoção do `any` só com lint ativo.

---

### R07 — Infraestrutura de testes + CI (quick win de maior impacto) — ✅ **Resolvido 2026-08-07**

> **Status:** Implementado — 9 suites unitárias backend (77 testes), 5 testes e2e efêmeros, 5 testes frontend (Vitest), coverage com thresholds e workflow CI `.github/workflows/ci.yml` (lint/build/unit/coverage/e2e nos dois workspaces). `newman` declarado em devDependencies; `test:system` agora delega ao `test:e2e` não destrutivo.

1. **Problema**: Zero testes unitários/E2E não-destrutivos; `test:system` apaga o banco (`migrate reset -f`) e chama `newman` não declarado.
2. **Localização**: `backend/package.json:10,79,107`; coleção `backend/test/newman-system-tests.json`.
3. **Evidência**: NestJS docs — `jest` + `supertest` (e2e); GitHub Actions para CI.
4. **Situação Atual**: `"test:system": "prisma migrate reset -f && ... npx newman ..."` (binário ausente).
5. **Implementação Recomendada**: declarar `newman` como devDependency; criar `test:e2e` com DB dedicado e `setup`/`teardown` não destrutivos; adicionar workflow `.github/workflows/ci.yml` rodando lint + build + unit + e2e com banco efêmero.
6. **Código Atual**: script `test:system` (destrutivo).
7. **Código Sugerido**:
   ```jsonc
   // backend/package.json
   {
     "test": "jest",
     "test:unit": "jest --config ./test/unit/jest-unit.json",
     "test:e2e": "DATABASE_URL=file:./test-e2e.db jest --config ./test/jest-e2e.json --runInBand"
   }
   ```
   ```yaml
   # .github/workflows/ci.yml
   on: [push, pull_request]
   jobs:
     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 24, cache: npm }
         - run: npm ci
         - run: npx prisma generate
         - run: npm run lint
         - run: npm run build
         - run: npm run test:unit
         - run: npm run test:e2e
   ```
8. **Benefícios**: Qualidade (QAL-01/QTS-01); segurança de regressão para R01–R06; gates em PR.
9. **Riscos**: Tempo inicial; DB de teste dedicado precisa de isolamento (não usar o de dev).
10. **Compatibilidade**: Nenhuma.

---

### R08 — Correções de deploy Docker/Caddy (bloqueadores de produção)

1. **Problema**: (a) `frontend` constrói com `target: frontend-builder` (sem runtime) → inalcançável; (b) `DATABASE_URL` aponta fora do volume; (c) Caddy espera `{$DOMAIN}`/`{$ACME_EMAIL}` mas compose injeta `*_FILE` (Caddy não expande a convenção `_FILE`); (d) compose base superseded.
2. **Localização**: `docker-compose.yml:33,50,83`; `docker-compose.prod.yml:12,56-57,65-66`; `reverse-proxy/Caddyfile.prod`.
3. **Evidência**: Docker multi-stage (estágio de runtime com `CMD`/`EXPOSE`); docs do Caddy: variáveis de ambiente são `{$VAR}`, não há sufixo `_FILE` automático.
4. **Situação Atual**: `build: { target: frontend-builder }`; `DATABASE_URL=file:/data/...` fora de `/opt/app/backend/data`; Caddy `{$DOMAIN}` sem env real.
5. **Implementação Recomendada**: (a) trocar target para o estágio de runtime; (b) alinhar `DATABASE_URL` ao volume `backend-data:/opt/app/backend/data`; (c) injetar `DOMAIN`/`ACME_EMAIL` reais (ou resolver `*_FILE` via entrypoint) no serviço `reverse-proxy`; (d) remover secrets mortos do compose base.
6. **Código Atual**:
   ```yaml
   # docker-compose.prod.yml
   frontend:
     build: { target: frontend-builder }
   # Caddyfile.prod
   {$DOMAIN} { ... }
   ```
7. **Código Sugerido**:
   ```yaml
   frontend:
     build: { target: frontend }
   reverse-proxy:
     environment:
       DOMAIN: ${DOMAIN}
       ACME_EMAIL: ${ACME_EMAIL}
   # Caddyfile.prod mantém {$DOMAIN} / {$ACME_EMAIL}
   ```
   ```yaml
   # compose base — DATABASE_URL dentro do volume
   DATABASE_URL: file:/opt/app/backend/data/prod.db
   ```
8. **Benefícios**: Disponibilidade (deploy funcional); segurança (segredos não ficam em imagem); manutenção.
9. **Riscos**: Mudança de env exige reprovisionamento do serviço `reverse-proxy`; confirmar caminho do volume montado.
10. **Compatibilidade**: Infraestrutura; sem impacto de API.

---

## 12.6 Quick wins (melhorias < 30 min, sem refatoração estrutural)

- ~~DOP-06~~ ✅ **Resolvido 2026-08-07:** `docker-compose.monitoring.yml` pina `prom/prometheus:v3.13.2`, `grafana/grafana:13.1.3`, `grafana/loki:3.7.6`, `grafana/promtail:3.6.11`, `prom/node-exporter:v1.12.1`. *(ClamAV removido do compose — item não se aplica mais a ele.)*
- ~~DOP-08~~ ✅ **Resolvido 2026-08-07:** `/api/health` usa `$queryRaw\`SELECT 1\`` no lugar de `config.findMany()` (↔ PERF-07).
- ~~DOP-07~~ ✅ **Resolvido 2026-08-07 (commit `5e9b987`):** `.dockerignore` inclui `**/secrets/`, `.env*`, `**/scripts/secrets/`, `**/data/` e `*.log`.
- DOC-04: preencher `license`/`repository` nos 4 `package.json`.
- ~~QTS-07~~ ✅ **Resolvido 2026-08-07:** `@nestjs/testing` deixou de ser órfão — usado pelo `test/auth-share.e2e-spec.ts` (R07).
- BKD-05/QAL-05: revisar TODOs com impacto de segurança em `share.service.ts:246`.
- FRN-09: adicionar `rel="noopener noreferrer"` nos `target="_blank"`.
- FRN-06: remover `user-scalable=no` (acessibilidade).
- INF-04: higienizar `.env.local.example` (DOC-05).

---

## 12.7 Ordem de execução sugerida (dependências)

```
1. R07 (testes+CI)  ──►  ✅ Resolvido 2026-08-07 — pré-requisito de garantia
2. R02 (JwtGuard)   ──►  ✅ Resolvido 2026-08-07 — fail-closed + spec
3. R01 (File.size)  ──►  exige migração; fazer com testes verdes (R07) e deploy coordenado
4. R08 (Docker)     ──►  ✅ Resolvido 2026-08-07 (FASE-9)
5. R03 (paginação)  ──►  muda contrato; documentar breaking change
6. R04 (limpeza)    ──►  disponibilidade; baixo risco
7. R06 (config)     ──►  incremental
8. R05 (god class)  ──►  por último, com rede de testes (R07) estabilizada
```

## 12.8 Notas de Execução

- **Nenhuma alteração aplicada nesta fase**; todas as mudanças ficam para a Fase 13, que gera `REFACTORING_PLAN.md`, `ROADMAP.md`, `TECH_DEBT.md` e demais artefatos finais obrigatórios (Especificação-final l.148-161).
- Códigos sugeridos são referência: devem passar por `npm run lint` (1 erro conhecido em `local.service.ts:357` `no-async-promise-executor`), `npm run build` e testes antes do merge.
- R01 e R03 têm **impacto de contrato de dados/API** — requerem versão e changelog (ver `CHANGELOG_SUGERIDO.md` na Fase 13).
- As notas das Fases 10/11 (18/40) alimentam o Sumário do `AUDIT_REPORT.md`.
