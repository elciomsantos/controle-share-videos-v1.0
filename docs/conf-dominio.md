# Configuração de Domínio Grátis (No-IP) com IP Fixo

## Controle Share Videos v1.0

Este guia detalha como configurar um hostname No-IP gratuito apontando
para seu IP público fixo, de modo que o Caddy provisione certificados
TLS Let's Encrypt automaticamente e a aplicação gere links corretos.

---

## 1. Pré-requisitos

| Item | Obrigatório? | Detalhes |
|------|--------------|----------|
| IP público **fixo** | Sim | Seu provedor deve entregar IP estático (não DHCP/CGNAT). |
| Port forwarding 80/443 | Sim | Roteador encaminha TCP 80 e 443 para o IP **local** do servidor Ubuntu (ex: `192.168.1.50`). |
| Conta No-IP | Sim | Gratuita em <https://www.noip.com/sign-up>. |
| Docker secrets | Sim | `domain` e `acme_email` já criados (ver `Implantacao.md` seção 7). |
| `general.appUrl` no banco | Sim | Deve ser definido **após** o certificado emitido (seção 5). |

> **Não use DUC (Dynamic Update Client)** — seu IP é fixo. O No-IP só serve
> para dar um hostname `*.ddns.net` ao IP estático.

---

## 2. Criar o hostname no No-IP

1. Acesse <https://my.noip.com/> e faça login.
2. Menu lateral: **Dynamic DNS** → **No-IP Hostnames**.
3. Clique **Create Hostname**.
4. Preencha:
   - **Hostname**: escolha um nome curto (ex: `meusistema`)
   - **Domain**: selecione um domínio gratuito (ex: `ddns.net`, `hopto.org`, `zapto.org`)
     - Resultado: `meusistema.ddns.net`
   - **Record Type**: `A (IPv4 Address)`
   - **IPv4 Address**: o painel detecta seu IP público automaticamente.
     Como seu IP é fixo, apenas confirme o valor sugerido.
5. Clique **Create Hostname**.

> **Confirmação mensal obrigatória**: a conta gratuita exige clicar no link
> de confirmação que o No-IP envia por e-mail a cada 30 dias. Se não
> confirmar, o hostname é removido. Configure lembrete no calendário ou
> use o plano pago (baixo custo) para evitar.

---

## 3. Port Forwarding no Roteador

No painel do roteador (geralmente `192.168.1.1` ou `192.168.0.1`):

| Porta Externa | IP Interno (Ubuntu) | Porta Interna | Protocolo |
|---------------|---------------------|---------------|-----------|
| 80            | `192.168.x.y`       | 80            | TCP       |
| 443           | `192.168.x.y`       | 443           | TCP       |

- `192.168.x.y` = IP **fixo** da interface de rede do servidor Ubuntu na LAN.
- Reserve esse IP no DHCP do roteador (MAC binding) ou configure IP estático no Ubuntu.

Teste externo (de fora da LAN):
```bash
# Deve responder na porta 80 (HTTP)
curl -I http://meusistema.ddns.net
# HTTP/1.1 308 Permanent Redirect  → Location: https://meusistema.ddns.net/

# Deve responder na porta 443 (HTTPS) após Caddy provisionar
curl -I https://meusistema.ddns.net
# HTTP/2 200  (ou 302 para /auth/signIn se não logado)
```

---

## 4. Configurar Docker secrets `domain` e `acme_email`

Se já não criou (ver `Implantacao.md` seção 7):

```bash
# Domain = hostname No-IP exato
echo "meusistema.ddns.net" | docker secret create domain -

# E-mail para Let's Encrypt (expiração, avisos de segurança)
echo "seu-email@empresa.local" | docker secret create acme_email -
```

Verificar:
```bash
docker secret inspect domain acme_email
# Deve mostrar os valores corretos
```

---

## 5. Caddy provisiona Let's Encrypt automaticamente

O arquivo `reverse-proxy/Caddyfile.prod` já está preparado:

```caddyfile
{
    admin off
    auto_https disable_redirects
}

# HTTP → HTTPS redirect
http:// {
    redir https://{host}{uri} permanent
}

# Produção: HTTPS com TLS automático via Let's Encrypt
https://{$DOMAIN} {
    tls {$ACME_EMAIL} {
        protocols tls1.2 tls1.3
        ciphers TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384 ...
    }
    # Security headers, rate limit, reverse_proxy backend:8080 / frontend:3333
    # ... (resto do arquivo inalterado)
}
```

**Como funciona**:
1. Caddy lê `{$DOMAIN}` do secret `domain` (montado em `/run/secrets/domain`)
2. Caddy lê `{$ACME_EMAIL}` do secret `acme_email`
3. Ao iniciar, Caddy contacta Let's Encrypt via ACME HTTP-01 (porta 80)
4. Se domínio resolve para o IP e porta 80 chega ao container, certificado é emitido em segundos
5. Caddy renova automaticamente 30 dias antes da expiração

> **Requisito**: porta 80 **deve** estar acessível publicamente durante a emissão/renovação.
> O `http://` block redireciona para HTTPS, mas responde ao challenge ACME.

---

## 6. Definir `general.appUrl` no banco (passo crítico)

**Depois** que o certificado foi emitido e `https://meusistema.ddns.net` responde:

### Opção A — UI Admin (recomendado)
1. Acesse `https://meusistema.ddns.net`
2. Login com admin (credenciais dos secrets `admin_username`/`admin_password`)
3. Menu **Admin** → **Configurações** → **Geral**
4. Campo **URL da Aplicação**: `https://meusistema.ddns.net` (sem barra final)
5. **Salvar**

### Opção B — SQL direto (antes do primeiro acesso)
```bash
sqlite3 /srv/controle-share-videos/data/controle-videos.db \
  "UPDATE \"Config\" SET \"value\"='https://meusistema.ddns.net', \"updatedAt\"=CURRENT_TIMESTAMP \
   WHERE \"name\"='appUrl' AND \"category\"='general';"
```

### Por que é crítico?
- E-mails de convite, reset de senha, notificação de download usam `${appUrl}/s/{shareId}` (`email.service.ts:116`)
- Frontend gera links de compartilhamento com `${appUrl}/share/{id}` (`showCompletedUploadModal.tsx:58`)
- Se `appUrl` ficar no default `http://localhost:3000`, links quebram fora do container
- O frontend tem fallback para `window.location.origin` **apenas enquanto** `appUrl` igual ao default. Assim que você define o real, todos os links passam a usá-lo.

---

## 7. Reconstruir o container Caddy (se necessário)

Se você criou os secrets **após** o primeiro `up -d`, ou alterou o `domain`:

```bash
cd /opt/controle-share-videos-v1.0
docker compose -f docker-compose.prod.yml up -d --force-recreate caddy
# ou reiniciar tudo:
docker compose -f docker-compose.prod.yml restart caddy
```

Verificar logs:
```bash
docker compose -f docker-compose.prod.yml logs -f caddy
# Procurar por:
# [INFO] [meusistema.ddns.net] acme: Obtaining certificate...
# [INFO] [meusistema.ddns.net] acme: Certificate obtained successfully
# [INFO] [meusistema.ddns.net] serving with TLS
```

---

## 8. Testar

| Teste | Comando / Ação | Esperado |
|-------|----------------|----------|
| HTTPS responde | `curl -I https://meusistema.ddns.net` | `HTTP/2 200` ou `302` |
| Certificado válido | `openssl s_client -connect meusistema.ddns.net:443 -servername meusistema.ddns.net </dev/null` | `Verify return code: 0 (ok)` |
| Redirect HTTP→HTTPS | `curl -I http://meusistema.ddns.net` | `308 Permanent Redirect` → `Location: https://...` |
| Frontend carrega | Navegador → `https://meusistema.ddns.net` | Página de login, cadeado verde |
| API health | `curl https://meusistema.ddns.net/api/health` | `{"status":"ok"}` |
| Links de share | Criar share no UI → copiar link | Link começa com `https://meusistema.ddns.net/s/...` |

---

## 9. Manutenção do No-IP (confirmação 30 dias)

### O que acontece
- Conta gratuita: a cada ~30 dias, No-IP envia e-mail para o endereço cadastrado
- Assunto típico: *"Confirm your hostname meusistema.ddns.net"*
- Você **deve clicar no link** dentro de 7 dias
- Se não clicar: hostname é desativado → DNS para de resolver → Caddy não renova certificado → site cai

### Mitigações
1. **Lembrete no calendário** (recorrente mensal)
2. **E-mail dedicado/monitorado** para alertas (ex: `alertas@empresa.local` com forward para equipe)
3. **Plano pago No-IP** (≈ $30/ano) — remove a confirmação manual + permite domínios próprios
4. **Script de monitoramento** (opcional) — verifica se `dig meusistema.ddns.net` resolve para seu IP

### Renovação do certificado Let's Encrypt
- Caddy renova **automaticamente** ~30 dias antes da expiração (90 dias de validade)
- Requisito: porta 80 acessível + DNS resolvendo
- Se hostname No-IP expirar → DNS falha → renovação falha → certificado expira → site inacessível
- **Portanto**: manter o hostname No-IP ativo é pré-requisito para TLS contínuo.

---

## Solução de problemas

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| `curl https://...` → `certificate verify failed` | Certificado não emitido ainda | Verificar logs Caddy: `docker logs caddy` |
| Logs: `acme: error presenting token: could not start HTTP server for challenge` | Porta 80 bloqueada / não chega no container | Verificar UFW (`ufw status`), port forwarding roteador, `docker ps` porta 80 mapeada |
| `dig meusistema.ddns.net` → `NXDOMAIN` ou IP errado | Hostname No-IP expirado / não confirmado | Logar no No-IP, confirmar hostname, aguardar propagação DNS (TTL 60s) |
| `general.appUrl` definido mas links ainda usam `localhost` | YAML `config.yaml` sobrescreve o banco | Remover `general.appUrl` de `/opt/.../backend/config.yaml` se existir |
| Site abre mas assets (CSS/JS) dão 404 | `appUrl` com path errado ou barra final | `appUrl` deve ser `https://host` **sem** path nem barra final |
| Renovação falha silenciosamente | Porta 80 fechada no momento da renovação | `ufw allow 80/tcp` permanente; monitorar logs Caddy semanalmente |

---

## Referências rápidas

```bash
# Ver secrets ativos
docker secret ls

# Ver valor de um secret (requer root no host)
docker secret inspect domain --format '{{.Spec.Data}}' | base64 -d

# Forçar revalidação Caddy (recria container)
docker compose -f docker-compose.prod.yml up -d --force-recreate caddy

# Testar challenge ACME manualmente (porta 80 aberta?)
curl -v http://meusistema.ddns.net/.well-known/acme-challenge/test

# Ver certificado atual
openssl x509 -in <(openssl s_client -connect meusistema.ddns.net:443 -servername meusistema.ddns.net </dev/null 2>/dev/null) -text -noout | grep -A2 "Validity"
```

---

**Fim — Configuração de Domínio No-IP**

> Mantido em `docs/Implantacao/conf-dominio.md` — versionado com o código.
> Atualize este doc se mudar de provedor DDNS ou adotar domínio próprio.