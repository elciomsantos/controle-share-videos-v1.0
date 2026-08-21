# HSTS Preload Submission
**Versao:** 1.0
**Data:** 2026-08-21
**Status:** Configuracao verificada - Pronto para submissao

---

## Configuracao Atual (Caddy)

O Caddy configura automaticamente HSTS com os seguintes headers:

```http
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

### Verificacao no Caddyfile
```caddyfile
{
    # HSTS automatico com preload
    strict_transport_security {
        max_age 63072000
        include_subdomains
        preload
    }
}
```

---

## Checklist de Pre-Submissao

| Requisito | Status | Verificacao |
|-----------|--------|-------------|
| Certificado TLS valido | OK | Let's Encrypt via Caddy (renovacao automatica) |
| HTTPS em todo o dominio | OK | Caddy redireciona HTTP -> HTTPS |
| HSTS max-age >= 1 ano (31536000) | OK | 63072000 (2 anos) |
| includeSubDomains | OK | Configurado no Caddy |
| preload directive | OK | Configurado no Caddy |
| Certificado valido para todos subdominios | OK | Wildcard ou multiplos certs via Caddy |
| Redirecionamento HTTP -> HTTPS | OK | Caddy faz automaticamente |
| Sem conteudo misto (mixed content) | OK | Verificado - todos recursos HTTPS |

---

## Submissao para hstspreload.org

### 1. Verificar Headers Atuais
```bash
# Verificar header HSTS atual
curl -I https://seu-dominio.com | grep -i strict-transport-security

# Resultado esperado:
# Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

### 2. Submeter no Site
1. Acesse: https://hstspreload.org/
2. Digite o dominio: seu-dominio.com
3. Clique em "Check HSTS Status"
4. Se todos checks passarem, clique em "Submit to Preload List"

### 3. Confirmacao
- O dominio entra na lista de preload do Chrome/Firefox/Safari/Edge
- Navegadores forcarão HTTPS desde a primeira visita (sem TOFU)
- Processo pode levar dias/semanas para propagar aos navegadores

---

## Monitoramento Pos-Submissao

### Verificacao Trimestral (Automatizada via Prometheus)
```yaml
# Alert: HSTS Preload Status
- alert: HSTSPreloadStatusChanged
  expr: |
    hsts_preload_status{domain="seu-dominio.com"} != 1
  for: 1h
  labels:
    severity: warning
  annotations:
    summary: "HSTS preload status changed for {{ $labels.domain }}"
    runbook_url: "https://github.com/.../docs/hsts-preload.md"
```

### Verificacao Manual (Trimestral)
```bash
# 1. Verificar se ainda na lista
curl -s "https://hstspreload.org/api/v2/status?domain=seu-dominio.com" | jq .

# 2. Verificar header ainda presente
curl -I https://seu-dominio.com | grep -i strict-transport-security

# 3. Verificar no Chrome
# chrome://net-internals/#hsts -> Query domain
```

---

## Remocao da Lista (Se Necessario)

Se precisar remover (ex: migracao de dominio, problema critico):

1. Remover preload do Caddyfile
2. Reduzir max-age para 0 (desabilita HSTS):
   ```caddyfile
   strict_transport_security {
       max_age 0
   }
   ```
3. Aguardar expiracao do max-age atual (ate 2 anos!)
4. Solicitar remocao em: https://hstspreload.org/removal/

**Atencao:** Remocao pode levar meses para propagar. Planeje com antecedencia.

---

## Checklist de Deploy para Novo Dominio

- [ ] Caddyfile configurado com HSTS + preload
- [ ] Certificado TLS valido emitido
- [ ] Teste curl -I confirma header
- [ ] Submetido em hstspreload.org
- [ ] Confirmado na lista (pode levar dias)
- [ ] Alertas Prometheus configurados
- [ ] Documentado em runbook de IR

---

## Referencias

- HSTS Preload List: https://hstspreload.org/
- OWASP HSTS Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html
- Caddy Automatic HTTPS: https://caddyserver.com/docs/automatic-https
- Chrome HSTS Preload List: https://chromium.googlesource.com/chromium/src/+/main/net/http/transport_security_state_static.json

---

**Status Atual:** Configurado no Caddy - Aguardando submissao manual em hstspreload.org