# REFACTORING PLAN — Controle Share Videos v1.0

> **Fase 8b**: Plano detalhado de refatoração
> **Data**: 2026-08-10
> **Auditor**: Opencode (agente automatizado)
> **Cobertura**: R01 e R02 pendentes + correções de hardening

---

## 1. R01 — Decompor AuthService

### Objetivo
Quebrar `AuthService` monolítico em 4 serviços com responsabilidades isoladas (SRP).

### Estrutura Proposta
```
backend/src/auth/
├── service/
│   ├── auth.service.ts        # Orquestrador (mantém)
│   ├── login.service.ts       # login, senha argon2
│   ├── token.service.ts       # emissão de access + refresh
│   ├── refresh.service.ts     # rotação de refresh tokens
│   └── verification.service.ts # verificação + rotação JWT kid
├── controller/
│   └── auth.controller.ts    # thin, delega aos services
└── guard/
    └── ...
```

### Plano de Execução
1. **Passo 1** (1 dia): Criar `LoginService` extrtraindo `validateUser`, `login`
2. **Passo 2** (1 dia): Criar `TokenService` com `signAccessToken`, `signRefreshToken`
3. **Passo 3** (1 dia): Criar `RefreshService` com rotação de refresh, blacklist
4. **Passo 4** (1 dia): Criar `VerificationService` integrando com `JwtSecretService`
5. **Passo 5** (1 dia): Atualizar `AuthController` para usar services novos
6. **Passo 6** (1-2 dias): Migrar testes para services isolados + adicionar testes novos

### Critérios de Aceite
- [ ] `LoginService` testável isoladamente com mock de Prisma
- [ ] `TokenService` não depende de banco
- [ ] Lint pass ✅
- [ ] Testes pass ✅
- [ ] Não há regressão funcional (login/refresh/logout funcionam E2E)

### Esforço Estimado
**5-7 dias**

---

## 2. R02 — Extrair UploadRepository

### Objetivo
Abstrair camada de storage em `UploadRepository` para permitir troca futura de backend (filesystem → S3).

### Estrutura Proposta
```
backend/src/upload/
├── repository/
│   ├── upload.repository.ts          # Interface IUploadRepository
│   ├── filesystem-upload.repository.ts  # Implementação filesystem atual
│   └── (futuro) s3-upload.repository.ts
├── service/
│   └── upload.service.ts             # Usa IUploadRepository injetado
└── controller/
    └── upload.controller.ts
```

### Plano de Execução
1. **Passo 1** (0.5 dia): Definir interface `IUploadRepository` (save, get, delete, exists)
2. **Passo 2** (1 dia): Mover código de filesystem para `FilesystemUploadRepository`
3. **Passo 3** (0.5 dia): Atualizar `UploadService` para receber `IUploadRepository` via DI
4. **Passo 4** (0.5 dia): Configurar provider NestJS para injetar implementação concreta
5. **Passo 5** (0.5 dia): Testes com mock de `IUploadRepository`

### Critérios de Aceite
- [ ] `UploadService` não referencia filesystem diretamente
- [ ] Trocar para S3 no futuro = apenas criar nova implementação + swap provider
- [ ] Lint pass ✅
- [ ] Testes pass ✅

### Esforço Estimado
**2-3 dias**

---

## 3. Correções de Hardening (Trilha paralela)

### H-01 — Adicionar CSP no Caddy (D04 / S-05)
- **Esforço**: 0.5 dia
- **Arquivo**: `reverse-proxy/Caddyfile.prod`
- **Conteúdo**:
  ```
  header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self';"
  ```
- **Teste**: Inspector do navegador mostra CSP ativo; test XSS refletido bloqueado

### H-02 — Restore test automatizado (D05)
- **Esforço**: 1-2 dias
- **Infra**: Job cron/staging que restaura backup em DB temporário e valida schema + count
- **Documento**: Adicionar procedimento em README operacional

### H-03 — Sync da branch `fix/producao-v1.1.0` (D03)
- **Esforço**: 0.5 dia (verificação + merge ou delete)
- **Ação**: Confirmar que R03-R06 já estão em main; se divergente, rebase e merge PR

### H-04 — Adicionar Playwright E2E no CI (D02)
- **Esforço**: 3-5 dias
- **Fluxos cobertos**: login, upload, share, download, expiração
- **Job CI**: rodar `pnpm e2e` em matrix linux

---

## 4. Cronograma Sugerido (v1.1)

| Sprint | Refatoração | Esforço |
|---|---|---|
| Sem 1 | R02 (UploadRepository) + H-01 (CSP) | 3-4 dias |
| Sem 2 | R01 (AuthService) | 5-7 dias |
| Sem 3 | H-03 (sync branch) + H-04 (E2E setup) | 4-6 dias |
| Sem 4 | H-02 (restore test) + documentação | 2-3 dias |

**Total estimado**: 4 semanas para v1.1

---

## 5. Critérios de Aceite Gerais v1.1

- [x] R01 concluído (AuthService → Login/Token/Refresh/Verification, 2026-08-11)
- [x] R02 concluído (UploadRepository, 2026-08-11)
- [x] CSP ativo no Caddy (H-01)
- [x] Branches sincronizadas (H-03)
- [ ] E2E básicos (login, upload, share) no CI
- [ ] Restore test documentado e automatizado
- [x] Sem regressão em testes existentes (unit 140 + e2e 16 verdes)
- [x] Lint pass ✅

---

*Fim do REFACTORING_PLAN.md*
