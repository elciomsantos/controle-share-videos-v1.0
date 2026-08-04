# Fase 1 — Auditoria Arquitetural

**Status:** ✅ Concluída
**Data:** 2026-08-04
**Escopo:** organização do projeto, acoplamento, coesão, modularização, dependências circulares, código duplicado e conformidade com boas práticas arquiteturais (Clean / MVC / DDD / Hexagonal).

---

## 1.1 Resumo Executivo

O projeto segue o padrão **NestJS modular** no backend e **Next.js Pages Router** no frontend, com uma arquitetura geral adequada ao porte. Entretanto, foram identificados **4 achados** distribuídos em:

| Severidade | Qtd |
|---|---|
| Alto | 2 |
| Médio | 2 |
| **Total** | **4** |

**Principais riscos:** dependência circular bidirecional entre módulos (`ShareModule` ↔ `FileModule`), god classes no serviço central (`ShareService` com 772 LOC) e no frontend (`showCreateUploadModal.tsx` com 751 LOC), código duplicado entre backend e frontend (util `date.util.ts` divergente) e repetição de boilerplate de guardas em todos os controllers.

---

## 1.2 Critérios Avaliados

| Critério | Status |
|---|---|
| Organização do projeto (monorepo, estrutura) | ✅ Adequado (backend/frontend/scripts separados) |
| Conformidade com padrões (MVC/DDD/Hexagonal) | ⚠️ Parcial (NestJS modular, porém com services gigantes) |
| Dependências circulares entre módulos | ❌ Falha (`ShareModule` ↔ `FileModule`) |
| Coesão e responsabilidade de serviços | ⚠️ Baixa coesão em `ShareService` (27 métodos) |
| Código duplicado | ⚠️ Presente (utils, padrões de guarda) |
| Modularização e fronteiras claras | ⚠️ Média (módulos por feature, porém acoplados) |

---

## 1.3 Achados Detalhados

### ARQ-01 — Dependência circular bidirecional `ShareModule` ↔ `FileModule`

- **Problema:** `ShareModule` importa `FileModule` via `forwardRef()` e `FileModule` importa `ShareModule` diretamente, criando um ciclo de dependência entre módulos. Isso desorganiza a resolução de dependências do contêiner NestJS, dificulta testes unitários e impede a extração de um dos módulos para um pacote/biblioteca separado sem refatoração.
- **Localização:** `backend/src/share/share.module.ts:14` (`forwardRef(() => FileModule)`); `backend/src/file/file.module.ts:15` (import direto de `ShareModule`).
- **Evidência:**
  - `share.module.ts`: `forwardRef(() => FileModule)` no array `imports`.
  - `file.module.ts`: `imports: [JwtModule, EmailModule, ShareModule, DownloadLogModule]` — sem `forwardRef`.
- **Situação Atual:** Ciclo formado; o NestJS só funciona porque `forwardRef` quebra a resolução em tempo de compilação do DI. Qualquer tentativa de extrair `ShareModule` ou `FileModule` para um pacote independente quebra a compilação.
- **Implementação (proposta):** Extrair as funcionalidades compartilhadas de `download-log` e a lógica de tokens/zip para um módulo de domínio intermediário (ex.: `ShareDomainModule`) que ambos os módulos importem, eliminando a referência cruzada. Alternativa mais simples: revisar se `FileService` precisa realmente de `ShareService` e inverter a dependência.
- **Código Atual:**
  ```ts
  // share.module.ts
  imports: [JwtModule.register({}), EmailModule, forwardRef(() => FileModule), forwardRef(() => DownloadLogModule), SystemModule],
  ```
  ```ts
  // file.module.ts
  imports: [JwtModule.register({}), EmailModule, ShareModule, DownloadLogModule],
  ```
- **Código Sugerido:**
  ```ts
  // share.module.ts
  imports: [JwtModule.register({}), EmailModule, ShareDomainModule, SystemModule],
  // file.module.ts
  imports: [JwtModule.register({}), EmailModule, ShareDomainModule, DownloadLogModule],
  ```
  Onde `ShareDomainModule` contém apenas as entidades/portas de domínio (ex.: geração de token, validação de password, limite de views) sem depender de `FileModule` nem de `ShareModule`.
- **Benefícios:** elimina o ciclo; facilita testes unitários isolados; permite extração para pacote compartilhado; melhora a compreensão das fronteiras.
- **Riscos:** refatoração de médio porte; risco de regressão nas rotas de compartilhamento/download se as injeções forem movidas incorretamente; exige cobertura de testes das rotas afetadas.
- **Compatibilidade:** nenhuma mudança de contrato de API; mudanças internas apenas.

---

### ARQ-02 — God class `ShareService` (772 LOC, 27 métodos)

- **Problema:** `ShareService` concentra responsabilidades de criação, ZIP, conclusão, view counting, tokens, expiração e atualização de segurança. Com 772 LOC e 27 métodos, viola o princípio da responsabilidade única (SRP) e a coesão desejável de um serviço de domínio.
- **Localização:** `backend/src/share/share.service.ts` (772 linhas).
- **Evidência:** métodos `create()` (linha 49, ~65 linhas), `createZip()` (linha 114, ~75 linhas), `complete()` (linha 190, ~75 linhas), `increaseViewCount()` (linha 551, ~60 linhas) e `getShareToken()` (linha 638, ~70 linhas).
- **Situação Atual:** serviço monolítico; qualquer mudança em ZIP ou token exige tocar no mesmo arquivo de 772 linhas, aumentando conflitos de merge e dificultando testes focados.
- **Implementação (proposta):** Decompor em serviços menores com responsabilidades claras:
  - `ShareLifecycleService` (criação, conclusão, expiração)
  - `ShareZipService` (criação e proteção de ZIP)
  - `ShareViewService` (contagem de views, limites, logs)
  - `ShareTokenService` (emissão/verificação de tokens, geração de password)
  - `ShareSecurityService` (hash de password, validação de expiração)
- **Código Atual:** classe única com 27 métodos (ver seção 1.1 e arquivo-fonte).
- **Código Sugerido:**
  ```ts
  // share.service.ts — fica como fachada/agregador fino
  export class ShareService {
    constructor(
      private lifecycle: ShareLifecycleService,
      private zip: ShareZipService,
      private views: ShareViewService,
      private tokens: ShareTokenService,
    ) {}
    // métodos delegam para os serviços internos
  }
  ```
- **Benefícios:** coesão maior; cada serviço testável isoladamente; mudanças localizadas; on-boarding mais rápido.
- **Riscos:** esforço de refatoração Alto (4h–1 dia); risco de quebrar a injeção de dependências nos controllers; requer testes de integração para validar o comportamento.
- **Compatibilidade:** sem mudança de API pública; os controllers continuam dependendo de `ShareService` (fachada).

---

### ARQ-03 — Código duplicado e divergente entre backend e frontend (`date.util.ts`)

- **Problema:** Utilitário de datas duplicado entre os dois projetos, com implementações divergentes (o frontend carrega locale pt-br e `localizedFormat`; o backend não). Divergência progressiva causa comportamento inconsistente (ex.: formatos de data diferentes em lugares distintos).
- **Localização:** `backend/src/utils/date.util.ts` (47 linhas); `frontend/src/utils/date.util.ts` (59 linhas).
- **Evidência:** backend exporta `EPOCH_ZERO`, `parseRelativeDateToAbsolute`, `isEpochZero`, `stringToTimespan`, `timespanToString`; frontend exporta `getExpirationPreview`, `timespanToString`, `stringToTimespan` e configura `dayjs.locale("pt-br")` — implementações divergentes, nenhum pacote compartilhado.
- **Situação Atual:** Dois arquivos com o mesmo propósito, mantidos manualmente em sincronia — risco de drift.
- **Implementação (proposta):** Criar um pacote compartilhado (`shared/` ou `packages/shared`) com o util de datas, tipagens de domínio (`Timespan`, `Share`, etc.) e importá-lo em ambos os projetos. O repo já é um monorepo (backend/ + frontend/), viabilizando a extração.
- **Código Atual:** dois arquivos `date.util.ts` separados.
- **Código Sugerido:**
  ```ts
  // shared/src/date.util.ts — fonte única da verdade
  import dayjs from "dayjs";
  export const EPOCH_ZERO = new Date(0);
  export function parseRelativeDateToAbsolute(relativeDate: string) { ... }
  export function isEpochZero(date: Date | string | number) { ... }
  export function stringToTimespan(value: string) { ... }
  export function timespanToString(timespan: Timespan) { ... }
  export function getExpirationPreview(t, form) { ... }
  ```
- **Benefícios:** fonte única; elimina drift; reduz manutenção; permite tipagens compartilhadas entre frontend e backend.
- **Riscos:** esforço Médio–Alto (criação do pacote e ajuste de imports em ~10 arquivos); risco de quebra de build se os paths de import não forem atualizados em ambos os lados.
- **Compatibilidade:** mudança interna apenas; sem impacto de API.

---

### ARQ-04 — Boilerplate repetido de guardas de autenticação/autorização nos controllers

- **Problema:** A combinação `@UseGuards(JwtGuard, RolesGuard)` + `@Roles(...)` é repetida manualmente em todos os controllers protegidos (ex.: `share.controller.ts` com 13 `@UseGuards`), aumentando a superfície de erro humano (ex.: esquecer `@Roles` num endpoint sensível) e poluindo o código.
- **Localização:** todos os controllers protegidos: `backend/src/share/share.controller.ts`, `backend/src/user/user.controller.ts`, `backend/src/config/config.controller.ts`, `backend/src/system/system.controller.ts`, `backend/src/download-log/admin-download-logs.controller.ts`, `backend/src/file/file.controller.ts`, `backend/src/auth/auth.controller.ts`.
- **Evidência:** `grep @UseGuards(JwtGuard, RolesGuard)` encontra ocorrências em 5 arquivos; `share.controller.ts` usa 13 `@UseGuards`; `user.controller.ts` usa 8. A cadeia global `APP_GUARD` (`app.module.ts:65-82`) já aplica `ThrottlerGuard → JwtGuard → RolesGuard → PasswordMustChangeGuard` globalmente, o que torna os decorators explícitos redundantes e potencialmente conflitantes.
- **Situação Atual:** dupla aplicação (global + explícita) e repetição excessiva de decorators.
- **Implementação (proposta):** Manter apenas a cadeia global `APP_GUARD` (padrão já implementado) e remover `@UseGuards(JwtGuard, RolesGuard)` dos endpoints que não exigem guardas adicionais específicas (ex.: `ShareSecurityGuard`, `IdValidation`). Criar decorators compostos de autorização (ex.: `@Roles(...)` já existe; adicionar `@Admin()` etc.) e um decorator composto `@ShareOwner()` que encapsule `@UseGuards(IdValidation, ShareOwnerGuard)`.
- **Código Atual:**
  ```ts
  // share.controller.ts
  @UseGuards(JwtGuard, RolesGuard)
  @Roles("admin", "auditor")
  @Get()
  async getShares() { ... }
  ```
- **Código Sugerido:**
  ```ts
  // util/decorators.ts
  export const AdminOnly = () => SetMetadata("roles", ["admin"]);
  // share.controller.ts
  @AdminOnly()
  @Get()
  async getShares() { ... }
  ```
  A cadeia global `APP_GUARD` já aplica `JwtGuard` e `RolesGuard`; o `@Roles` (via `AdminOnly`) define os papéis permitidos.
- **Benefícios:** remove redundância; reduz risco de endpoints sem proteção por esquecimento; código mais limpo e legível.
- **Riscos:** mudança transversal em ~7 arquivos; exige validação por teste de integração de cada endpoint para garantir que a proteção não foi enfraquecida; esforço Médio.
- **Compatibilidade:** sem mudança de contrato de API; muda apenas a declaração das guardas.

---

## 1.4 Classificação Risco × Impacto × Esforço

| ID | Achado | Risco | Impacto | Esforço | Quick Win? |
|---|---|---|---|---|---|
| ARQ-01 | Dependência circular `ShareModule` ↔ `FileModule` | Alto | Manutenibilidade | Alto | ❌ |
| ARQ-02 | God class `ShareService` (772 LOC / 27 métodos) | Alto | Manutenibilidade | Muito Alto | ❌ |
| ARQ-03 | Util `date.util.ts` duplicado e divergente | Médio | Manutenibilidade | Médio | ✅ (criação do shared) |
| ARQ-04 | Boilerplate repetido de guardas | Médio | Manutenibilidade | Médio | ✅ |

---

## 1.5 Recomendações Prioritárias

1. **ARQ-01 (Alto):** Extrair um módulo de domínio intermediário para eliminar o ciclo — item mais crítico por bloquear evolução modular.
2. **ARQ-02 (Alto):** Decompor `ShareService` em 5 serviços coesos, mantendo a fachada — maior ganho de manutenibilidade a médio prazo.
3. **ARQ-03 (Médio):** Criar pacote `shared/` e migrar `date.util.ts` + tipagens — quick win com ganho imediato e risco baixo.
4. **ARQ-04 (Médio):** Consolidar guardas na cadeia global `APP_GUARD` e criar decorators compostos — quick win de legibilidade e segurança por redução de erro humano.

---

## 1.6 Notas de Execução

- Nenhum achado nesta fase tem impacto direto de segurança; os riscos são de **manutenibilidade e escalabilidade da arquitetura**.
- As correções arquiteturais foram **propostas, não aplicadas** (conforme escopo da Fase 12 — Refatoração, que só propõe).
- Pontos levantados aqui que merecem acompanhamento em fases específicas: `File.size` como `String` (Fase 4 — Banco de Dados), uso de `any` em `get()` (Fase 2 — Backend) e cadeia de guardas (Fase 6 — Segurança).
