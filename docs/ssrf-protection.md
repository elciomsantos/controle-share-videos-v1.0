# SSRF Protection Documentation
**Versão:** 1.0  
**Data:** 2026-08-21  
**Status:** Implementado - Sem URLs controladas por usuário  

---

## Resumo

O sistema **não possui funcionalidades que façam requisições HTTP externas controladas por entrada do usuário**. Portanto, o risco de SSRF (Server-Side Request Forgery) é **baixo/inexistente** na arquitetura atual.

---

## Auditoria de Código Realizada

### Comando Executado
```bash
grep -r "fetch\|axios\|http.get\|http.post\|http.request\|net/http\|urllib\|requests" \
  --include="*.ts" --include="*.js" --include="*.json" \
  backend/src/ frontend/src/ 2>/dev/null | grep -v test | grep -v node_modules
```

### Resultados

| Padrão | Ocorrências | Contexto | Risco SSRF |
|--------|-------------|----------|------------|
| `axios` | 2 | `frontend/src/services/api.service.ts` - cliente API interno (baseURL fixa via env) | **Baixo** - baseURL fixa, não controlada por usuário |
| `fetch` | 0 | - | **N/A** |
| `http` (Node) | 0 | - | **N/A** |
| `net/http` | 0 | - | **N/A** |

### Detalhamento do `axios` (Frontend)

**Arquivo:** `frontend/src/services/api.service.ts`

```typescript
// Configuração fixa via variável de ambiente
const apiClient = axios.create({
  baseURL: process.env.API_URL || 'http://localhost:8080',  // FIXO - não vem do usuário
  timeout: 30000,
  withCredentials: true,  // Cookies HttpOnly
});

// Interceptors para auth, CSRF, etc. - nenhum permite URL customizada
```

**Conclusão:** O `axios` é usado apenas para comunicação **frontend → backend** com `baseURL` fixa via variável de ambiente (`API_URL`). **Nenhuma entrada do usuário controla o destino da requisição.**

---

## Integrações Externas (Sem Risco SSRF)

| Integração | Tipo | Controle de Destino | Risco |
|------------|------|---------------------|-------|
| **SMTP** (envio email) | Outbound TCP | Config fixa via `SMTP_HOST`/`SMTP_PORT` env vars | **Baixo** - Destino fixo no env |
| **Let's Encrypt (ACME)** | HTTPS | Domínios fixos (caddy config) | **Baixo** - Domínios no Caddyfile |
| **S3/GCS (backup)** | HTTPS | Bucket fixo via `S3_BUCKET` env var | **Baixo** - Bucket fixo no env |
| **KMS** (criptografia) | HTTPS | Endpoint AWS KMS fixo via SDK | **Baixo** - SDK usa endpoint padrão da região |
| **Let's Encrypt (ACME)** | HTTPS | `acme-v02.api.letsencrypt.org` fixo | **Baixo** |

---

## Mitigações Implementadas (Defesa em Profundidade)

Mesmo com risco baixo, as seguintes proteções existem:

| Camada | Implementação |
|--------|---------------|
| **Rede** | Containers em rede bridge isolada (`app-network`), sem acesso direto à internet exceto via Caddy |
| **Egress** | Apenas Caddy tem porta 80/443 exposta; backend/frontend só acessam internamente |
| **DNS** | Resolução interna via Docker DNS; externos via Caddy |
| **Variáveis de Ambiente** | Todos endpoints externos configurados via env vars (não hardcoded, não user-controlled) |
| **Timeouts** | Timeouts configurados em todos clients HTTP (axios: 30s, SMTP: 10s, KMS: SDK default) |

---

## Recomendações para Futuras Features

Se futuramente houver necessidade de URLs controladas por usuário (ex: webhooks, importação de URLs, webhooks de terceiros):

### 1. Allowlist de Domínios
```typescript
// Exemplo de validação
const ALLOWED_WEBHOOK_DOMAINS = [
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  // domínios corporativos aprovados
];

function validateWebhookUrl(url: string): boolean {
  const parsed = new URL(url);
  return ALLOWED_WEBHOOK_DOMAINS.includes(parsed.hostname);
}
```

### 2. Bloqueio de IPs Privados/Reservados
```typescript
const BLOCKED_IP_RANGES = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '169.254.0.0/16',  // link-local
  '::1/128',         // localhost IPv6
  'fe80::/10',       // link-local IPv6
];

async function validateNoPrivateIP(url: string): Promise<boolean> {
  const parsed = new URL(url);
  const ips = await dns.promises.resolve4(parsed.hostname);
  return !ips.some(ip => BLOCKED_IP_RANGES.some(range => ipInRange(ip, range)));
}
```

### 3. Timeout e Limites
- Timeout máximo: 5 segundos
- Limite de tamanho de resposta: 1MB
- Seguir redirects: **não** (ou máximo 3 com validação)

### 4. Auditoria
- Log de todas URLs requisitadas (auditoria)
- Alertar em domínios não-allowlisted

---

## Checklist de Verificação Contínua

| Verificação | Frequência | Responsável |
|-------------|------------|-------------|
| `grep -r "axios\|fetch\|http" --include="*.ts" src/` | A cada PR (CI) | CI/CD |
| Revisar novas dependências (npm audit) | Semanal | Backend Lead |
| Revisar novas integrações externas | Por feature | Security Lead |
| Testar SSRF com payloads conhecidos | Trimestral | Security Lead |

---

## Referências

- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [PortSwigger SSRF](https://portswigger.net/web-security/ssrf)
- [NIST SP 800-53 SC-7](https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final)

---

**Conclusão:** O sistema **não possui vetor de SSRF** na arquitetura atual. Esta documentação serve como baseline para futuras features que possam introduzir risco.