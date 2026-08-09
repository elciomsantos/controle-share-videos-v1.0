# CHANGELOG_CORRECOES.md — Correções: Rotação de Segredo JWT

| Campo | Valor |
|---|---|
| Escopo | Feature de rotação de segredo JWT (uncommitted na `main`) |
| Período | 2026-08-09 |
| Método | Revisão via agentes de validação (segurança) e otimização (performance) + correção manual |
| Status | ✅ Correções aplicadas no working tree (ainda não commitadas) |

## 1. Introdução

Registro das correções aplicadas sobre a implementação de **rotação de segredo JWT**
(`backend/src/config/jwt-secret.service.ts`, `jwt.strategy.ts`, `auth.service.ts`,
`share-token.service.ts`, `config.controller.ts`, `config.seed.ts`). A revisão
combinou análise de segurança (race conditions, criptografia, algoritmos) e de
performance (cache, hot path, loops O(N)).

## 2. Correções aplicadas

### 2.1 Primeira rodada — validação + otimização

| ID | Correção | Arquivo | Testes |
|----|----------|---------|--------|
| P1/A1 | **Mutex na rotação** — serializa chamadas concorrentes a `rotate()`; antes duas rotações liam o mesmo estado pré-rotação e perdiam um segredo, invalidando tokens em sessão | `jwt-secret.service.ts` (`rotate`) | `serializes concurrent rotations so no signed secret is orphaned` |
| P2 | **Cache da resolução de segredos** — `fs.readFileSync` síncrono + throw deixou de rodar por request; leitura do arquivo 1x (lazy) e estado derivado cacheado, invalidado só na rotação | `jwt-secret.service.ts` | `reads the Docker secret file only once (cached)` |
| P4 | **`getSecretByKid` O(1)** via `Map<kid, secret>` (antes scan linear com sha256 por candidato) | `jwt-secret.service.ts` | `derives a stable kid and resolves it back` |
| P3 | **`verifyShareToken` O(1)** — resolve o segredo exato pelo `kid` no header em vez de loop com até N verifies + N HMAC (~7,7x de amplificação no pior caso) | `share-token.service.ts` | — |
| P5 | **`getIdOfCurrentUser` O(1)** — mesma resolução por `kid` | `auth.service.ts` | — |
| A2 | **`algorithms: ["HS256","HS512"]`** nas três verificações JWT (passport strategy, `verifyShareToken`, `getIdOfCurrentUser`) — evita algorithm confusion | `jwt.strategy.ts`, `share-token.service.ts`, `auth.service.ts` | — |

### 2.2 Segunda rodada — pendências da revisão

| ID | Correção | Arquivo | Testes |
|----|----------|---------|--------|
| M3/P6 | **Retenção do histórico por janela de tempo** — `MAX_HISTORY` 5 → 13 e evicção por idade de ~13 meses (cobre share tokens de até 1 ano); formato do histórico ganhou timestamp de rotação (`{s, rot}`), com normalização de arrays legados `["old"]` | `jwt-secret.service.ts` | `evicts history entries older than the retention window`, `normalizes legacy plain-string history entries`, `caps the history at MAX_HISTORY (13)` |
| M1 | **Criptografia em repouso** — `internal.jwtSecret` e `internal.jwtSecretHistory` cifrados com AES-256-GCM quando `JWT_SECRET_ENCRYPTION_KEY` (base64 de 32 bytes) está presente; sem a chave, valores seguem em texto claro (modo legado); prefixo `enc:v1:` permite coexistência | `jwt-secret-crypto.ts` (novo), `jwt-secret.service.ts`, `config.seed.ts` | `encrypts secrets at rest when the encryption key is configured` |
| M2 | **Rotação híbrida em produção** — quando o segredo atual vem do Docker secret file (`/run/secrets/jwt_secret`), `rotate()` adota o valor do arquivo para o histórico, persiste novo segredo no DB e muda `internal.jwtSecretSource` para `db` (DB passa a ser autoritativo). Env var continua bloqueando (nada a escrever) | `jwt-secret.service.ts`, `config.seed.ts` (`jwtSecretSource`) | `supports hybrid rotation when the Docker secret file is present` |
| B5 | **Rate limit específico** `5/min` no endpoint `POST /configs/admin/rotateJwtSecret` (além do throttle global) | `config.controller.ts` | — |
| B2 | **Auditoria da rotação** — log com actor (`user.email`) e IP de quem rotacionou | `config.controller.ts`, `jwt-secret.service.ts` (`rotate(actor, ip)`) | — |
| B4 | **`timingSafeEqual`** na comparação dos HMAC-SHA512 de senha do share token (com guarda de comprimento) | `share-token.service.ts` (`signaturesMatch`) | — |

## 3. Configuração

### 3.1 Criptografia em repouso (opcional, recomendado)

```bash
openssl rand -base64 32   # → JWT_SECRET_ENCRYPTION_KEY
```

Definir `JWT_SECRET_ENCRYPTION_KEY` (base64 de 32 bytes) no backend. Sem a variável,
o sistema opera em modo legado (texto claro), sem quebra. A rotação persistirá valores
cifrados a partir do momento em que a chave estiver presente.

⚠️ Se a chave for **removida** depois de rotacionar com ela ativa, os segredos cifrados
não poderão mais ser lidos e todos os tokens serão invalidados (há warning no log).

### 3.2 Rotações com Docker secret (produção)

- Env var `JWT_SECRET` → rotação via API é rejeitada (o segredo é gerenciado externamente).
- Docker secret file (`/run/secrets/jwt_secret`) → `POST /configs/admin/rotateJwtSecret`
  executa rotação **híbrida**: o segredo do arquivo entra no histórico e o DB passa a
  ser a fonte (`jwtSecretSource=db`). A partir daí, o arquivo é ignorado até uma
  reconfiguração manual.

## 4. Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `backend/src/config/jwt-secret-crypto.ts` | **Novo** — helpers AES-256-GCM (`encryptSecret`, `decryptSecret`, `hasEncryptionKey`, `isEncrypted`) |
| `backend/src/config/jwt-secret.service.ts` | Lock, cache, Map kid, histórico por idade, criptografia, rotação híbrida, auditoria |
| `backend/src/config/config.service.ts` | Tipo `internal.jwtSecretSource` no `ConfigTypeMap` |
| `backend/src/config/config.controller.ts` | Rate limit + actor/IP na rotação |
| `backend/src/auth/strategy/jwt.strategy.ts` | `algorithms: ["HS256","HS512"]` |
| `backend/src/auth/auth.service.ts` | `getIdOfCurrentUser` O(1) + `algorithms` |
| `backend/src/auth/auth.service.spec.ts` | Mock de `resolveSecretForToken` |
| `backend/src/share/domain/share-token.service.ts` | `verifyShareToken` O(1) + `timingSafeEqual` |
| `backend/prisma/seed/config.seed.ts` | `jwtSecretSource` + criptografia do `jwtSecret` no seed |
| `backend/src/i18n/pt-BR/config.json` | (pré-existente) chaves de rotação |
| `backend/src/config/jwt-secret.service.spec.ts` | 19 testes cobrindo cache, evicção, híbrido, concorrência e criptografia |
| `.env.local.example` | Documentação de `JWT_SECRET`, `JWT_SECRET_FILE`, `JWT_SECRET_ENCRYPTION_KEY` |

## 5. Verificação

- `npm run lint` (backend): limpo.
- `npx jest --config jest.config.js` (backend): **104/104** testes passando.
- `npm run build` (backend): compila.

## 6. Pendências não cobertas

- **Multi-instância**: o mutex da rotação é em processo; com mais de uma réplica seria
  necessário lock distribuído (ou re-leitura do estado dentro da transação). O deploy
  atual é de réplica única (`docker-compose.yml`), então o risco está coberto hoje.
- **Frontend em modo DB**: o middleware do frontend valida JWT apenas quando há
  `JWT_SECRET`/file; em modo DB (segredo no banco) a validação no edge fica desativada
  (a segurança real é no backend). Rotação via API não afeta esse comportamento.
