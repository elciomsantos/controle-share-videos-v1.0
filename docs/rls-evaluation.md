# RLS Evaluation - Row Level Security (Future PostgreSQL Migration)
**Versao:** 1.0
**Data:** 2026-08-21
**Status:** Avaliacao Preliminar - Decisao: Manter SQLite por enquanto

---

## Contexto Atual

O sistema usa **SQLite** (arquivo local) com controle de acesso **apenas no nivel de aplicacao** (guards NestJS). Nao ha Row Level Security (RLS) no banco de dados.

### Controle de Acesso Atual (App-Level)

| Recurso | Guard/Política | Escopo |
|---------|----------------|--------|
| **Shares** | `ShareOwnerGuard` + `StrictShareOwnerGuard` | Usuario so ve/edita seus proprios shares |
| **Arquivos** | `ShareTokenSecurityGuard` + `ShareOwnerGuard` | Acesso via token de share ou ownership |
| **Downloads** | `DownloadLimitGuard` + `ShareTokenSecurityGuard` | Rate limit + token validation |
| **Usuarios** | `RolesGuard` (admin/operador) | RBAC basico |
| **Admin** | `JwtGuard` + `RolesGuard` + `PasswordMustChangeGuard` | Multi-factor |

---

## Matriz de Controle Atual

| Recurso | Tabela | Coluna de Ownership | Verificacao App | RLS Necessario? |
|---------|--------|---------------------|-----------------|-----------------|
| **User** | `User` | `id` | `JwtGuard` extrai `user.id` do token | Medio |
| **Share** | `Share` | `creatorId` | `ShareOwnerGuard` verifica `share.creatorId === user.id` | Alto |
| **File** | `File` | `shareId` -> `Share.creatorId` | `ShareOwnerGuard` via share | Alto |
| **ShareToken** | `ShareToken` | `shareId` -> `Share.creatorId` | `ShareTokenSecurityGuard` | Medio |
| **DownloadLog** | `DownloadLog` | `shareId` + `userId` | Controller verifica permissao | Baixo |
| **AuditLog** | `AuditLog` | `userId` | Apenas admin (RolesGuard) | Baixo |

---

## Avaliacao de Migracao para PostgreSQL + RLS

### Cenarios de Migracao

| Cenario | Descricao | Esforco | Beneficio RLS |
|---------|-----------|---------|---------------|
| **A: Manter SQLite** | Continuar com app-level guards | 0 | Nenhum |
| **B: PostgreSQL + RLS Parcial** | Migra so tabelas criticas (Share, File) | Medio | Alto (Share, File) |
| **C: PostgreSQL + RLS Total** | Migra tudo, RLS em todas tabelas | Alto | Maximo |

---

### Analise Custo/Beneficio

#### Custos da Migracao (Cenario B - Parcial)

| Item | Esforco Estimado |
|------|------------------|
| Setup PostgreSQL (Docker, config, backup) | 3 dias |
| Migracao schema Prisma (SQLite -> PG) | 2 dias |
| Migracao dados existentes | 1 dia |
| Implementacao RLS policies (Share, File, ShareToken) | 5 dias |
| Testes de integracao + regressao | 3 dias |
| Ajuste CI/CD (testes com PG) | 2 dias |
| **Total** | **~16 dias** |

#### Beneficios do RLS

| Beneficio | Impacto |
|-----------|---------|
| **Defesa em profundidade** | Mesmo se app-level falhar, banco bloqueia acesso indevido |
| **Auditoria simplificada** | Politicas centrais no banco |
| **Multi-tenancy futuro** | Base para isolamento por tenant |
| **Compliance** | Requisito comum em auditorias (LGPD, SOC2) |
| **Defesa contra SQL injection** | RLS adiciona camada extra |

#### Riscos do RLS

| Risco | Mitigacao |
|-------|-----------|
| Performance (policy evaluation por query) | Indexes corretos, policies simples |
| Complexidade de debug | Logs de policy evaluation |
| Vendor lock-in (PostgreSQL specific) | Manter app-level como fallback |
| Migracao complexa | Fazer em fases, feature flags |

---

## Proposta de RLS Policies (PostgreSQL)

### 1. Share Policy
```sql
-- Habilita RLS
ALTER TABLE "Share" ENABLE ROW LEVEL SECURITY;

-- Policy: Usuario so ve seus proprios shares (ou se admin)
CREATE POLICY share_owner_policy ON "Share"
  USING (
    "creatorId" = current_user_id() 
    OR current_user_role() = 'admin'
  );

-- Policy: Insercao apenas para users autenticados
CREATE POLICY share_insert_policy ON "Share"
  FOR INSERT
  WITH CHECK (true); -- App controla via creatorId

-- Policy: Atualizacao apenas owner ou admin
CREATE POLICY share_update_policy ON "Share"
  FOR UPDATE
  USING ("creatorId" = current_user_id() OR current_user_role() = 'admin');
```

### 2. File Policy
```sql
ALTER TABLE "File" ENABLE ROW LEVEL SECURITY;

CREATE POLICY file_owner_policy ON "File"
  USING (
    EXISTS (
      SELECT 1 FROM "Share" s 
      WHERE s.id = "File"."shareId" 
      AND (s."creatorId" = current_user_id() OR current_user_role() = 'admin')
    )
  );
```

### 3. Funcoes Auxiliares (PostgreSQL)
```sql
-- Funcao para obter user_id do contexto (definida pelo app via SET LOCAL)
CREATE OR REPLACE FUNCTION current_user_id() RETURNS uuid AS $$
  SELECT current_setting('app.current_user_id')::uuid;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_role() RETURNS text AS $$
  SELECT current_setting('app.current_user_role');
$$ LANGUAGE sql SECURITY DEFINER;
```

### 4. Middleware NestJS para Setar Contexto
```typescript
// rls-context.middleware.ts
@Injectable()
export class RlsContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: () => void) {
    if (req.user) {
      // Seta variaveis de sessao para RLS
      const userId = req.user.id;
      const userRole = req.user.role;
      
      // Executa no inicio da transacao
      req.on('startTransaction', async () => {
        await prisma.$executeRaw`SET LOCAL app.current_user_id = ${userId}`;
        await prisma.$executeRaw`SET LOCAL app.current_user_role = ${userRole}`;
      });
    }
    next();
  }
}
```

---

## ADR (Architecture Decision Record)

### ADR-001: Manter SQLite com App-Level Guards (Decisao Atual)

**Status:** Aceito  
**Data:** 2026-08-21  
**Decisores:** Security Lead, Backend Lead, Tech Lead

#### Contexto
Sistema em producao com SQLite, guards NestJS bem testados, zero incidentes de autorizacao.

#### Decisao
**Manter SQLite + App-Level Guards** por enquanto. Reavaliar quando:
- Crescer para multi-tenancy real
- Requisito de compliance exigir RLS (ex: cliente enterprise)
- Time >= 5 devs (capacidade para manter PG)
- Incidente de autorizacao ocorrer

#### Consequencias
- **Positivo:** Zero custo de migracao agora, foco em features
- **Negativo:** Risco teorico de bug em guard expor dados (mitigado por testes + CodeQL)

#### Plano de Contingencia
Se decisao mudar:
1. Sprint dedicado (2 semanas) para migracao PG + RLS parcial
2. Feature flag para alternar SQLite/PG
3. Testes de regressao completos

---

## Plano de Reavaliacao (Trimestral)

| Gatilho | Acao |
|---------|------|
| Novo cliente enterprise exige RLS | Iniciar migracao PG + RLS |
| Incidente de autorizacao (bug em guard) | Postmortem -> decidir migracao |
| Time cresce > 5 devs | Avaliar capacidade PG |
| Requisito compliance (SOC2, ISO27001) | Migracao obrigatoria |

---

## Conclusao

**Decisao: Manter SQLite + App-Level Guards por enquanto.**

- Guards NestJS bem testados (security.e2e-spec.ts cobre 35.1-35.15)
- Zero incidentes de autorizacao em producao
- Custo de migracao PG + RLS (~16 dias) nao justificado agora
- Documentacao completa para futura migracao quando necessaria

**Proxima Revisao:** 2026-11-21 (Trimestral)