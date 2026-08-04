# Fase 4 — Auditoria de Banco de Dados

**Status:** ✅ Concluída
**Data:** 2026-08-04
**Escopo:** modelagem Prisma/SQLite (tipos, constraints, índices), integridade e normalização, consultas (paginação, transações, N+1) e performance dos caminhos de leitura/escrita e dos jobs de manutenção.

---

## 4.1 Resumo Executivo

A modelagem é **coerente e bem indexada no modelo de auditoria** (`DownloadLog` com 5 índices) e mantém o **Config inteiro em memória** (evita consultas por variável). Porém foram identificados **6 achados** concentrados em: tipagem numérica armazenada como `String`, índices ausentes nos caminhos quentes de consulta, listagens sem paginação e jobs de limpeza um-a-um:

| Severidade | Qtd |
|---|---|
| Alto | 1 |
| Médio | 4 |
| Baixo | 1 |
| **Total** | **6** |

**Principal risco:** `File.size` e `User.shareSizeLimit` são armazenados como `String` (BDB-01) — cada leitura exige `parseInt`, inviabiliza agregações no banco e propaga risco de `NaN` (BKD-03 / FRN-03) por todo o fluxo de upload.

---

## 4.2 Critérios Avaliados

| Critério | Status |
|---|---|
| Tipagem numérica (tamanhos/limites) | ❌ Falho (BDB-01) |
| Índices nos caminhos de consulta | ⚠️ Parcial (BDB-02) |
| Paginação de listagens | ❌ Falho (BDB-03) |
| Transações e consistência dos jobs de limpeza | ⚠️ Parcial (BDB-04) |
| Integridade da modelagem (sentinela de expiração, 1:1 segurança) | ⚠️ Parcial (BDB-05) |
| Unicidade/duplicatas em relações | ⚠️ Parcial (BDB-06) |
| Índices da trilha de auditoria | ✅ Adequado (`DownloadLog` com 5 índices) |
| Cache de config (evita consultas repetidas) | ✅ Adequado (injeção em memória via `CONFIG_VARIABLES`) |
| Contadores atômicos (views/downloads) | ✅ Adequado (`increment`) |
| Chaves primárias UUID e FKs com `onDelete: Cascade` | ✅ Adequado |
| Denormalização intencional de auditoria | ✅ Adequado (imutabilidade de log) |

---

## 4.3 Achados Detalhados

### BDB-01 — `File.size` e `User.shareSizeLimit` armazenados como `String`

- **Problema:** campos numéricos de tamanho são persistidos como texto. Cada leitura faz `parseInt` (com risco de `NaN`), e nenhuma operação do banco pode somar/ordenar por tamanho. É a raiz estrutural dos achados BKD-03 (backend) e FRN-03 (frontend).
- **Localização:** `backend/prisma/schema.prisma` — `File.size String` (l.106) e `User.shareSizeLimit String?` (l.21).
- **Evidência:**
  ```prisma
  model File {
    size        String   // deveria ser Int/BigInt
  }
  model User {
    shareSizeLimit String?  // deveria ser Int/BigInt
  }
  ```
  Consumo com parse em `backend/src/file/local.service.ts:121-130`:
  ```ts
  const fileSizeSum = share.files.reduce(
    (n, { size }) => n + parseInt(size), 0,
  );
  const globalLimit = parseInt(this.config.get("share.maxSize"));
  const userLimit = share.creator?.shareSizeLimit
    ? parseInt(share.creator.shareSizeLimit)
    : undefined;
  ```
  O mesmo padrão se repete no frontend (`upload/index.tsx:70-74`, `EditableUpload.tsx:37,66,72`, `share/[shareId]/index.tsx:54,184`, `account/shares.tsx:148`, `ManageShareTable.tsx:132`, `AdminConfigInput.tsx:79,287`).
- **Situação Atual:** a soma de tamanhos é recalculada a cada chunk via `reduce`+`parseInt` (l.121-130); um `size` corrompido ou vazio produz `NaN` e comparações `>` passam a ser `false` — limites podem ser ignorados silenciosamente. Impossível usar `SUM()`/`MIN()`/`MAX()` no banco.
- **Implementação (recomendada):** migrar para `Int` (ou `BigInt` se houver arquivos > 2 GB) com migration de conversão (`String → Int`, tratando vazios/NaN como 0), ajustar os pontos de leitura para receber número e remover os `parseInt`.
- **Código Sugerido:**
  ```prisma
  model File {
    size        BigInt  // ou Int; mantém precisão byte a byte
  }
  model User {
    shareSizeLimit BigInt?
  }
  ```
  ```ts
  const fileSizeSum = share.files.reduce((n, f) => n + Number(f.size), 0n);
  ```
- **Benefícios:** elimina a classe de bugs de `NaN`; agregações nativas; prepara ordenação por tamanho; reduz parsing repetido a cada chunk.
- **Riscos:** migration de conversão de dados (valores não numéricos existentes precisam de saneamento); ajuste de ~15 call sites backend+frontend; impacto de BigInt na serialização JSON (usar string/`Number` no DTO).
- **Compatibilidade:** contrato de API deve manter o formato (serializar como string/numero); mudança interna de storage.

---

### BDB-02 — Índices ausentes nos caminhos de consulta quentes

- **Problema:** o schema não indexa colunas usadas em filtros/ordenações frequentes e em todos os crons de limpeza. Com volume crescente, essas consultas viram varreduras completas.
- **Localização:** `backend/prisma/schema.prisma` (modelos `Share`, `File`, `ShareRecipient`, `RefreshToken`, `LoginToken`, `ResetPasswordToken`, `User`).
- **Evidência (consultas × colunas):**
  - `Share.expiration` — `jobs.service.ts:35-43` `findMany({ where: { expiration: { lt, not } } })` a **cada minuto**; `share.service.ts:274-275,294-296` `orderBy: { expiration }`.
  - `Share.creatorId` + `uploadLocked` + `expiration` — `share.service.ts:284-298` (`getSharesByUser`).
  - `File.shareId` — a cada chunk de upload o `local.service.ts:78-81` faz `findUnique({ include: { files: true } })`; sem índice, cada include varre a tabela `File` por `shareId`.
  - `ShareRecipient.shareId` — notificações/listagem de destinatários.
  - `RefreshToken.expiresAt`, `LoginToken.expiresAt`, `ResetPasswordToken.expiresAt` — `jobs.service.ts:122-134` `deleteMany({ where: { expiresAt: { lt } } })` a cada hora.
  - `User.isActivated` + `createdAt` — `jobs.service.ts:170-176` (`deleteUnactivatedUsers`).
- **Situação Atual:** todos os crons de manutenção e as listagens por usuário fazem scan. `DownloadLog` (5 índices) contrasta com os demais modelos.
- **Implementação (recomendada):** adicionar índices nos modelos:
  ```prisma
  model Share {
    @@index([expiration])
    @@index([creatorId, uploadLocked, expiration])
  }
  model File {
    @@index([shareId])
  }
  model ShareRecipient {
    @@index([shareId])
  }
  model RefreshToken { @@index([expiresAt]) }
  model LoginToken   { @@index([expiresAt]) }
  model ResetPasswordToken { @@index([expiresAt]) }
  model User         { @@index([isActivated, createdAt]) }
  ```
- **Benefícios:** crons e listagens passam a usar índice; escrita única de migration; custo de indexação pequeno em SQLite.
- **Riscos:** leve aumento de espaço/escrita de índices.
- **Compatibilidade:** nenhuma.

---

### BDB-03 — Listagens de shares sem paginação e com `include` pesados

- **Problema:** as telas de "Gerenciar Compartilhamentos" (admin) e "Meus Compartilhamentos" carregam **todos** os shares com todas as relações aninhadas (files, creator, security, recipients), sem paginação nem `select` mínimo.
- **Localização:** `backend/src/share/share.service.ts` — `getShares()` l.272-281 e `getSharesByUser()` l.283-301.
- **Evidência:**
  ```ts
  async getShares() {
    const shares = await this.prisma.share.findMany({
      orderBy: { expiration: "desc" },
      include: { files: true, creator: true, security: true, recipients: true },
    });
    return shares.map((share) => this.transformShare(share));
  }
  ```
- **Situação Atual:** sem `skip/take`/cursor e sem `select`, cada abertura das telas transfere todos os registros e monta a árvore inteira de relações em memória. Em volume municipal (compartilhamentos acumulados + ZIP + histórico), degrada a API e o client.
- **Implementação (recomendada):** paginação por cursor (`take` + `cursor` em `id`, ordenando por `createdAt`/`expiration`) e `select` apenas dos campos renderizados; manter `include` apenas quando a tela realmente usa a relação.
- **Código Sugerido:**
  ```ts
  const shares = await this.prisma.share.findMany({
    take: pageSize,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, expiration: true, views: true, downloads: true, ... },
  });
  ```
- **Benefícios:** payload e latência constantes; menos memória; escala com o histórico.
- **Riscos:** mudança de contrato (paginação exige incluir `pageInfo`/`nextCursor`); ajuste nas tabelas do frontend.
- **Compatibilidade:** aditiva se mantida a lista completa no primeiro page + cursor opcional; ou quebra planejada na Fase 12/13.

---

### BDB-04 — Crons de limpeza com exclusões um-a-um sem transação

- **Problema:** os jobs de expiração iteram `findMany` e deletam share por share (fs + banco) em laço, sem transação e com estado intermediário — se um `delete` falha no meio, restam arquivos no disco sem registro (e vice-versa). Também carregam o registro completo (sem `select`) mesmo para exclusão.
- **Localização:** `backend/src/jobs/jobs.service.ts` — `deleteExpiredShares()` l.35-58, `deleteUnfinishedShares()` l.63-86, `deleteUnactivatedUsers()` l.170-188.
- **Evidência:**
  ```ts
  // deleteExpiredShares(): N iterações, cada uma com delete de arquivos + delete do share
  for (const expiredShare of expiredShares) {
    await this.fileService.deleteAllFiles(expiredShare.id);
    await this.prisma.share.delete({ where: { id: expiredShare.id } });
  }
  ```
- **Situação Atual:** o laço é não-atômico: `deleteAllFiles` remove do disco; se `prisma.share.delete` lançar (ex.: race com acesso), o registro permanece sem arquivos — inconsistência. Isso reforça o BKD-06 (Fase 2) no nível de modelagem/operação.
- **Implementação (recomendada):** (1) envolver cada expiração em transação (`$transaction`) com `deleteMany({ where: { id } })`; (2) usar `select: { id: true }` nos `findMany` de limpeza (não precisa das colunas); (3) para muitos registros, processar em lotes (`deleteMany({ where: { expiration: { lt, not }, id: { in: ids } } })`).
- **Código Sugerido:**
  ```ts
  const ids = expiredShares.map((s) => s.id);
  await this.prisma.$transaction(async (tx) => {
    for (const id of ids) await this.fileService.deleteAllFiles(id);
    await tx.share.deleteMany({ where: { id: { in: ids } } });
  });
  ```
- **Benefícios:** atomicidade por execução do job; menos queries; consistência disco↔banco.
- **Riscos:** transações longas em SQLite bloqueiam escritas durante o job (mitigar com lotes pequenos).
- **Compatibilidade:** nenhuma.

---

### BDB-05 — Sentinela `EPOCH_ZERO` para "nunca expira" e `ShareSecurity` 1:1 opcional

- **Problema:** a modelagem usa `expiration = Date(0)` como sentinela de "sem expiração" em vez de campo nullable, espalhando condições `{ not: EPOCH_ZERO }`/`{ equals: EPOCH_ZERO }` pelo código — frágil e difícil de indexar. Além disso, `ShareSecurity` é 1:1 opcional (`String? @unique`) embora seja **sempre criado** no mesmo `create` do share.
- **Localização:** `backend/src/utils/date.util.ts:15,18`; `backend/src/jobs/jobs.service.ts:40`; `backend/src/share/share.service.ts:291,516`; `backend/prisma/schema.prisma` (l.113-123).
- **Evidência:**
  ```ts
  export const EPOCH_ZERO = new Date(0);
  if (relativeDate == "never") return EPOCH_ZERO;
  // jobs: { expiration: { not: EPOCH_ZERO } }
  // share.service: { expiration: { equals: EPOCH_ZERO } }
  ```
  ```prisma
  model ShareSecurity {
    shareId String? @unique  // sempre preenchido no create (share.service.ts:101)
  }
  ```
- **Situação Atual:** cada consulta que filtra expiração precisa lembrar de excluir/incluir o sentinela; um registro com `expiration = Date(0)` acidental (ou de outra origem) é tratado como "nunca". `ShareSecurity` nunca fica nulo em prática, mas o schema permite.
- **Implementação (recomendada):** trocar para `expiresAt DateTime?` (null = nunca) e ajustar as 4 ocorrências; tornar a relação 1:1 obrigatória (`shareId String @unique`) já que é criada junto — ou mover os campos de segurança para dentro de `Share`.
- **Código Sugerido:**
  ```prisma
  model Share {
    expiresAt DateTime?  // null = nunca expira
  }
  model ShareSecurity {
    shareId String @unique
  }
  ```
  ```ts
  // date.util.ts
  if (relativeDate == "never") return null;
  ```
- **Benefícios:** modelagem explícita; queries de expiração simples (`expiresAt: { lt }`); índice direto; elimina sentinela.
- **Riscos:** migration de conversão (EPOCH_ZERO → NULL) e ajuste de ~4 pontos.
- **Compatibilidade:** contrato de API: o DTO pode continuar expondo `expiration` (ex.: string vazia ou null) para o frontend — mudança interna.

---

### BDB-06 — `ShareRecipient` sem unicidade em `(shareId, email)`

- **Problema:** não há constraint de unicidade composta, permitindo destinatários duplicados para o mesmo compartilhamento e, consequentemente, notificações/e-mails duplicados.
- **Localização:** `backend/prisma/schema.prisma` l.93-99.
- **Evidência:**
  ```prisma
  model ShareRecipient {
    id    String @id @default(uuid())
    email String
    shareId String
  }
  ```
- **Situação Atual:** o backend não valida duplicidade antes de inserir destinatário; um mesmo e-mail pode aparecer N vezes e receber N notificações de download.
- **Implementação (recomendada):** adicionar `@@unique([shareId, email])` e tratar o conflito no serviço (upsert/skip silencioso).
- **Código Sugerido:**
  ```prisma
  model ShareRecipient {
    @@unique([shareId, email])
  }
  ```
- **Benefícios:** elimina duplicatas e e-mails repetidos; dados limpos.
- **Riscos:** migration pode falhar se já existirem duplicatas — deduplicar antes.
- **Compatibilidade:** nenhuma (comportamento mais restritivo na inserção).

---

## 4.4 Fortalezas da Fase 4 (não são achados)

- `DownloadLog` bem indexado (`shareId`, `userId`, `createdAt`, `event`, `requestId`) e com denormalização intencional (fileName/fileSize/username) para preservar a trilha mesmo após deleção de registros-fonte.
- Config inteira carregada em memória na inicialização (`CONFIG_VARIABLES`), evitando consultas por variável; reload via `findMany()` apenas em `update`.
- Contadores de `views`/`downloads` incrementados atomicamente (`increment`) com condição de limite (`where: { views: { lt: maxViews } }`).
- PKs UUID (`uuid()`), FKs com `onDelete: Cascade` e `ResetPasswordToken.userId @unique` (um token ativo por usuário).
- `touchShare` com throttle (5 min) reduzindo writes no SQLite (single-writer).
- Migrations versionadas (55+), incluindo saneamento/backfills (ex.: `requestId` nullable para linhas antigas).

---

## 4.5 Classificação Risco × Impacto × Esforço

| ID | Achado | Risco | Impacto | Esforço | Quick Win |
|---|---|---|---|---|---|
| BDB-01 | `File.size`/`shareSizeLimit` como `String` | Alto | Segurança | Alto | ❌ |
| BDB-02 | Índices ausentes nos caminhos quentes | Médio | Performance | Baixo | ✅ |
| BDB-03 | Listagens sem paginação + includes pesados | Médio | Performance | Médio | ⚠️ parcial |
| BDB-04 | Crons de limpeza um-a-um sem transação | Médio | Disponibilidade | Médio | ❌ |
| BDB-05 | Sentinela `EPOCH_ZERO` + 1:1 opcional | Médio | Manutenibilidade | Médio | ⚠️ parcial |
| BDB-06 | Recipient sem `@@unique(shareId, email)` | Baixo | Disponibilidade | Muito Baixo | ✅ |

---

## 4.6 Recomendações Prioritárias

1. **BDB-02** (Quick Win) — adicionar os índices listados (baixo esforço, ganho em todos os crons/listagens).
2. **BDB-01** (Alto) — migrar `File.size`/`shareSizeLimit` para `Int/BigInt`; desbloqueia agregações e elimina a classe `NaN`.
3. **BDB-04** — tornar os jobs de limpeza transacionais e em lotes (consistência disco↔banco).
4. **BDB-03** — paginação por cursor nas listagens de shares.
5. **BDB-05** — `expiresAt` nullable e `ShareSecurity` 1:1 obrigatória.
6. **BDB-06** — `@@unique([shareId, email])` com deduplicação prévia.

---

## 4.7 Notas de Execução

- Correções **propostas, não aplicadas** (escopo da Fase 12 — Refatoração / plano da Fase 13).
- **Referências cruzadas:** BDB-01 ↔ BKD-03 (Fase 2) e FRN-03 (Fase 3); BDB-04 ↔ BKD-06 (Fase 2); BDB-02/BDB-03 → Fase 6 (performance); queries e `any` → Fase 7.
- **Próximas etapas:** Fase 5 — Auditoria de Segurança (OWASP/ASVS).
