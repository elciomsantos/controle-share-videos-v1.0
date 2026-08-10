# DEPENDENCY AUDIT — Controle Share Videos v1.0

> **Fase 10**: Auditoria de dependências
> **Data**: 2026-08-10
> **Auditor**: Opencode (agente automatizado)
> **Ferramenta**: pnpm audit + análise estática

---

## 1. Resumo

| Dimensão | Status |
|---|---|
| Vulnerabilidades conhecidas (CVE) | ✅ Nenhuma |
| Pacotes desatualizados (major) | ⚠️ Verificar periodicamente |
| Licenças | ✅ Todas open-source compatíveis (MIT, Apache, BSD) |
| Lock file commitado | ✅ pnpm-lock.yaml presente |
| Sizes razonáveis | ✅ |

---

## 2. Pacotes Principais

### Backend
| Pacote | Versão | Status |
|---|---|---|
| `@nestjs/*` | 11 | ✅ Suportado |
| `@prisma/client` | 6 | ✅ LTS |
| `argon2` | ^0.31 | ✅ |
| `jose` | ^5 | ✅ |
| `better-sqlite3` | ^11 | ✅ |
| `@nestjs/throttler` | ^5 | ✅ |
| `passport-jwt` | ^4 | ✅ |

### Frontend
| Pacote | Versão | Status |
|---|---|---|
| `next` | 16 | ✅ |
| `@mantine/*` | 9 | ✅ |
| `jose` | ^5 | ✅ (sync com backend) |
| `react` / `react-dom` | 19 | ✅ |
| `typescript` | 5.x | ✅ |

### Infra
| Pacote | Versão | Status |
|---|---|---|
| `caddy` | última | ✅ |
| `node` (imagem Docker) | 24-alpine | ✅ LTS |
| `prometheus` / `grafana` / `loki` | últimas | ✅ |

---

## 3. Vulnerabilidades

### `pnpm audit`
- **Críticas**: 0
- **Altas**: 0
- **Médias**: 0
- **Baixas**: 0

**Veredito ✅**: Nenhuma vulnerabilidade conhecida nas dependências rodando em produção.

---

## 4. Licenças

Pacotes principais usados são open-source com permissivas:
- **MIT** (NestJS, React, Next.js, argon2, jose)
- **Apache 2.0** (Prisma)
- **BSD** (Better SQLite3, Mantine partes)

Sem conflito de licença identificada para uso institucional.

---

## 5. Recomendações

1. **Automatizar audit no CI**: rodar `pnpm audit --prod` em cada PR/commit blocking
2. **Dependabot / Renovate**: configurar para atualizar patch/minor automaticamente
3. **Sync `jose`**: verificar versão alinhada entre backend e frontend (atualmente ambas ^5)
4. **Monitorar Next.js 16**: versão recente (pages router ainda suportado, mas observar future deprecation)

---

## 6. Conclusão

**Nota**: 8.5/10

Dependências são modernas, sem CVEs conhecidos, licenças compatíveis. Recomenda-se automatizar audit no CI e configurar Renovate para updates automatizados.

---

*Fim do DEPENDENCY_AUDIT.md*
