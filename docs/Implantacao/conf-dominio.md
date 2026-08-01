Pré‑requisitos
IP público fixo (você já tem).

Portas 80 e 443 do seu roteador redirecionadas para o IP local do servidor onde o Docker está rodando.

Container runner com Caddy já funcionando internamente (portas 8080 e 3333).

Uma conta gratuita no No-IP (crie se ainda não tiver).

1. Criar o hostname no No‑IP
Faça login no site do No‑IP.

Vá em “Dynamic DNS” → “No-IP Hostnames”.

Clique em “Create Hostname”.

Preencha:

Hostname: escolha um nome (ex: meusistema).

Domain: selecione um domínio gratuito (ex: ddns.net, hopto.org, zapto.org). Exemplo final: meusistema.ddns.net.

Record Type: A (IPv4 Address).

IPv4 Address: o sistema já detecta seu IP público automaticamente; como seu IP é fixo, pode deixar o valor sugerido.

Clique em “Create Hostname”.

Pronto, agora meusistema.ddns.net aponta para seu IP público.

Nota sobre a conta gratuita: O No‑IP exige que você confirme o hostname a cada 30 dias (eles enviam um e‑mail com um link; é só clicar). Se não confirmar, o hostname é removido. Para evitar isso, você pode usar o plano pago (barato) ou simplesmente confirmar mensalmente.

2. Liberar as portas no roteador (port forwarding)
No painel do seu roteador, crie duas regras:

Porta externa	IP interno	Porta interna	Protocolo
80	IP do servidor	80	TCP
443	IP do servidor	443	TCP
O IP interno é aquele da máquina onde o container runner está executando (ex: 192.168.1.100).

3. Ajustar o Caddyfile (dentro do container runner)
Edite o arquivo Caddyfile que está sendo copiado para o container. Substitua o conteúdo atual por:

caddy
meusistema.ddns.net {
    # Headers básicos de segurança
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        X-XSS-Protection "1; mode=block"
        Referrer-Policy strict-origin-when-cross-origin
        -Server
    }

    # Proxy reverso para a API NestJS
    handle /api/* {
        reverse_proxy localhost:8080 {
            header_up Host {host}
            header_up X-Real-IP {remote_host}
        }
    }

    # Frontend Next.js (rota padrão)
    handle {
        reverse_proxy localhost:3333 {
            header_up Host {host}
            header_up X-Real-IP {remote_host}
        }
    }

    # Log de acessos (opcional, mas útil)
    log {
        output stdout
    }
}
O que mudou?

Trocamos :80 por meusistema.ddns.net.

Com um nome de domínio real, o Caddy automaticamente tentará obter um certificado SSL via Let’s Encrypt e redirecionará HTTP → HTTPS.

Não é necessário declarar tls ou qualquer outro bloco; a mágica acontece sozinha.

Se, por algum motivo, você quiser forçar HTTP por enquanto (não recomendado), substitua a primeira linha por http://meusistema.ddns.net. Mas o ideal é usar HTTPS, pois gera confiança nos links compartilhados.

4. Atualizar o docker-compose.yml
Você precisa expor também a porta 443 e definir a variável de ambiente com a URL pública, para que os links gerados pelo NestJS usem o hostname.

Edite seu docker-compose.yml:

yaml
version: '3.8'

services:
  runner:
    build: .
    container_name: runner
    ports:
      - "80:80"
      - "443:443"           # ← adicionar esta linha
    volumes:
      - runner-data:/backend/data
    environment:
      - PUBLIC_URL=https://meusistema.ddns.net   # ← variável para o NestJS
    restart: unless-stopped

volumes:
  runner-data:
    driver: local
Explicação:

A porta 443 agora está mapeada, permitindo o tráfego HTTPS.

A variável PUBLIC_URL será lida pelo seu backend para montar os links dos compartilhamentos (ex: https://meusistema.ddns.net/share/xyz). Ajuste o código do NestJS se necessário, algo como:

typescript
const shareLink = `${process.env.PUBLIC_URL}/share/${token}`;
5. Reconstruir e iniciar o container
Pare o container atual, reconstrua a imagem (se o Caddyfile estiver dentro da build) e suba novamente:

bash
docker-compose down
docker-compose build --no-cache   # garante que a cópia do novo Caddyfile seja usada
docker-compose up -d
Verifique os logs para ver o Caddy provisionando o certificado:

bash
docker logs -f runner
Você deverá ver mensagens como:

text
[INFO] [meusistema.ddns.net] acme: Obtaining certificate...
[INFO] [meusistema.ddns.net] serving with TLS
Se a porta 80 e 443 estiverem corretamente abertas e o DNS propagado (normalmente instantâneo), o certificado será emitido em poucos segundos.

6. Testar
Acesse de qualquer navegador (inclusive externo) https://meusistema.ddns.net.

Deve aparecer o frontend Next.js, com o cadeado verde de conexão segura.

Teste a API: https://meusistema.ddns.net/api/... (algum endpoint público).

Verifique se os links gerados pelo sistema agora usam o hostname.

Extras e boas práticas
Manutenção do No‑IP
Fique atento ao e‑mail de confirmação a cada 30 dias. Se perder o prazo, o hostname some e os links param de funcionar. Você pode optar por um plano pago (cerca de US$ 2/mês) para eliminar essa exigência e ter mais domínios.

Como seu IP é fixo, não é necessário instalar o cliente de atualização dinâmica (DUC) do No‑IP. Porém, se houver a mínima chance de o IP mudar, instale o DUC no servidor ou use um script simples de atualização.

Streaming de vídeos
Lembre-se de que, com o Caddy servindo como proxy, o streaming de arquivos grandes ainda passará pelo NestJS, a menos que você sirva os arquivos diretamente pelo Caddy (file_server). Avalie se o desempenho está adequado.

Segurança adicional
O Caddy já aplica boas práticas de TLS (HTTP/2, ciphers modernos). Mas você pode adicionar mais cabeçalhos de segurança se necessário.

Como o tráfego agora é criptografado, o compartilhamento de links fica muito mais seguro.

Resumo visual do fluxo final
text
Internet (usuário externo)
     │
     ▼
https://meusistema.ddns.net
     │
     │ (portas 80/443 do roteador)
     ▼
Servidor local (IP fixo privado)
     │
     │ docker (portas 80/443 mapeadas)
     ▼
Container runner (Caddy)
     ├── /api/*  → NestJS :8080
     └── /*      → Next.js :3333
Com essa configuração, seus links ficarão assim:

text
https://meusistema.ddns.net/share/a1b2c3d4



Pré‑requisitos
IP público fixo (você já tem).

Portas 80 e 443 do seu roteador redirecionadas para o IP local do servidor onde o Docker está rodando.

Container runner com Caddy já funcionando internamente (portas 8080 e 3333).

Uma conta gratuita no No-IP (crie se ainda não tiver).

1. Criar o hostname no No‑IP
Faça login no site do No‑IP.

Vá em “Dynamic DNS” → “No-IP Hostnames”.

Clique em “Create Hostname”.

Preencha:

Hostname: escolha um nome (ex: meusistema).

Domain: selecione um domínio gratuito (ex: ddns.net, hopto.org, zapto.org). Exemplo final: meusistema.ddns.net.

Record Type: A (IPv4 Address).

IPv4 Address: o sistema já detecta seu IP público automaticamente; como seu IP é fixo, pode deixar o valor sugerido.

Clique em “Create Hostname”.

Pronto, agora meusistema.ddns.net aponta para seu IP público.

Nota sobre a conta gratuita: O No‑IP exige que você confirme o hostname a cada 30 dias (eles enviam um e‑mail com um link; é só clicar). Se não confirmar, o hostname é removido. Para evitar isso, você pode usar o plano pago (barato) ou simplesmente confirmar mensalmente.

2. Liberar as portas no roteador (port forwarding)
No painel do seu roteador, crie duas regras:

Porta externa	IP interno	Porta interna	Protocolo
80	IP do servidor	80	TCP
443	IP do servidor	443	TCP
O IP interno é aquele da máquina onde o container runner está executando (ex: 192.168.1.100).

3. Ajustar o Caddyfile (dentro do container runner)
Edite o arquivo Caddyfile que está sendo copiado para o container. Substitua o conteúdo atual por:

caddy
meusistema.ddns.net {
    # Headers básicos de segurança
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        X-XSS-Protection "1; mode=block"
        Referrer-Policy strict-origin-when-cross-origin
        -Server
    }

    # Proxy reverso para a API NestJS
    handle /api/* {
        reverse_proxy localhost:8080 {
            header_up Host {host}
            header_up X-Real-IP {remote_host}
        }
    }

    # Frontend Next.js (rota padrão)
    handle {
        reverse_proxy localhost:3333 {
            header_up Host {host}
            header_up X-Real-IP {remote_host}
        }
    }

    # Log de acessos (opcional, mas útil)
    log {
        output stdout
    }
}
O que mudou?

Trocamos :80 por meusistema.ddns.net.

Com um nome de domínio real, o Caddy automaticamente tentará obter um certificado SSL via Let’s Encrypt e redirecionará HTTP → HTTPS.

Não é necessário declarar tls ou qualquer outro bloco; a mágica acontece sozinha.

Se, por algum motivo, você quiser forçar HTTP por enquanto (não recomendado), substitua a primeira linha por http://meusistema.ddns.net. Mas o ideal é usar HTTPS, pois gera confiança nos links compartilhados.

4. Atualizar o docker-compose.yml
Você precisa expor também a porta 443 e definir a variável de ambiente com a URL pública, para que os links gerados pelo NestJS usem o hostname.

Edite seu docker-compose.yml:

yaml
version: '3.8'

services:
  runner:
    build: .
    container_name: runner
    ports:
      - "80:80"
      - "443:443"           # ← adicionar esta linha
    volumes:
      - runner-data:/backend/data
    environment:
      - PUBLIC_URL=https://meusistema.ddns.net   # ← variável para o NestJS
    restart: unless-stopped

volumes:
  runner-data:
    driver: local
Explicação:

A porta 443 agora está mapeada, permitindo o tráfego HTTPS.

A variável PUBLIC_URL será lida pelo seu backend para montar os links dos compartilhamentos (ex: https://meusistema.ddns.net/share/xyz). Ajuste o código do NestJS se necessário, algo como:

typescript
const shareLink = `${process.env.PUBLIC_URL}/share/${token}`;
5. Reconstruir e iniciar o container
Pare o container atual, reconstrua a imagem (se o Caddyfile estiver dentro da build) e suba novamente:

bash
docker-compose down
docker-compose build --no-cache   # garante que a cópia do novo Caddyfile seja usada
docker-compose up -d
Verifique os logs para ver o Caddy provisionando o certificado:

bash
docker logs -f runner
Você deverá ver mensagens como:

text
[INFO] [meusistema.ddns.net] acme: Obtaining certificate...
[INFO] [meusistema.ddns.net] serving with TLS
Se a porta 80 e 443 estiverem corretamente abertas e o DNS propagado (normalmente instantâneo), o certificado será emitido em poucos segundos.

6. Testar
Acesse de qualquer navegador (inclusive externo) https://meusistema.ddns.net.

Deve aparecer o frontend Next.js, com o cadeado verde de conexão segura.

Teste a API: https://meusistema.ddns.net/api/... (algum endpoint público).

Verifique se os links gerados pelo sistema agora usam o hostname.

Extras e boas práticas
Manutenção do No‑IP
Fique atento ao e‑mail de confirmação a cada 30 dias. Se perder o prazo, o hostname some e os links param de funcionar. Você pode optar por um plano pago (cerca de US$ 2/mês) para eliminar essa exigência e ter mais domínios.

Como seu IP é fixo, não é necessário instalar o cliente de atualização dinâmica (DUC) do No‑IP. Porém, se houver a mínima chance de o IP mudar, instale o DUC no servidor ou use um script simples de atualização.

Streaming de vídeos
Lembre-se de que, com o Caddy servindo como proxy, o streaming de arquivos grandes ainda passará pelo NestJS, a menos que você sirva os arquivos diretamente pelo Caddy (file_server). Avalie se o desempenho está adequado.

Segurança adicional
O Caddy já aplica boas práticas de TLS (HTTP/2, ciphers modernos). Mas você pode adicionar mais cabeçalhos de segurança se necessário.

Como o tráfego agora é criptografado, o compartilhamento de links fica muito mais seguro.

Resumo visual do fluxo final
text
Internet (usuário externo)
     │
     ▼
https://meusistema.ddns.net
     │
     │ (portas 80/443 do roteador)
     ▼
Servidor local (IP fixo privado)
     │
     │ docker (portas 80/443 mapeadas)
     ▼
Container runner (Caddy)
     ├── /api/*  → NestJS :8080
     └── /*      → Next.js :3333
Com essa configuração, seus links ficarão assim:

text
https://meusistema.ddns.net/share/a1b2c3d4


                    REDE INTERNA
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
         Windows PC              Docker
              │                     │
            SMB                  aplicação
              │                     │
              └──────────┬──────────┘
                         ▼
             /srv/controle-share-videos/
                     data/uploads/
                        shares/
                         │
                         ▼
                       vídeos


                       Ubuntu Server
Docker Engine oficial
Caddy
IP fixo, domínio gratis
SQLite
vídeos já existentes no servidor
vídeos em data/uploads/shares
acesso aos vídeos pelo sistema web
compartilhamento de uploads/shares pela rede interna via Samba
sem ClamAV
persistência de data
sem expor SMB para a Internet
Docker com runner único, conforme o Dockerfile 
