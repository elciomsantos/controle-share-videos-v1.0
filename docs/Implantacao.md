markdown
# Guia de Implantação em Produção - Expandido

## Controle Share Videos v1.0

Este documento descreve a configuração recomendada para executar o
sistema **Controle Share Videos v1.0** em produção utilizando:

- Ubuntu Linux como sistema operacional do host;
- Docker CLI compatível com Podman;
- Um container único com:
  - Frontend Next.js;
  - Backend NestJS;
  - Caddy como reverse proxy interno;
- SQLite3 para usuários, compartilhamentos, tokens, configurações e
  logs;
- Um segundo disco dedicado aos dados persistentes, principalmente
  vídeos e uploads;
- Nginx como reverse proxy externo com suporte a HTTPS e
  rate limiting.

---

# 1. Arquitetura final

A arquitetura recomendada é:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ DISCO 1 - SISTEMA                                                   │
│                                                                     │
│ Ubuntu Linux                                                        │
│ ├── Docker/Podman                                                   │
│ ├── Nginx (reverse proxy externo)                                   │
│ ├── Projeto controle-share-videos-v1.0                             │
│ └── Container da aplicação                                          │
│     ├── Next.js                                                     │
│     ├── NestJS                                                      │
│     └── Caddy (reverse proxy interno)                              │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 │ volumes persistentes
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ DISCO 2 - DADOS                                                     │
│                                                                     │
│ /data                                                               │
│ ├── controle-videos.db                                              │
│ ├── images/                                                         │
│ ├── uploads/                                                        │
│ ├── backups/                                                        │
│ ├── prometheus/                                                     │
│ ├── grafana/                                                        │
│ └── loki/                                                           │
└─────────────────────────────────────────────────────────────────────┘
Fluxo das conexões:

text
Cliente
   │ HTTPS
   ▼
Nginx (porta 80/443)
   │ TLS termination, rate limiting, security headers
   ▼
Container (porta 3000)
   │
   ├── Caddy (reverse proxy interno)
   │   │
   │   ├── Frontend Next.js
   │   └── Backend NestJS (porta 8090)
   │
   └── SQLite (via Prisma)
A regra principal é:

O sistema e o código ficam no disco do Ubuntu. Os dados persistentes
ficam no segundo disco.

2. Estrutura real do projeto
A estrutura atual do projeto é:

text
controle-share-videos-v1.0/
├── Dockerfile
├── LICENSE
├── README.md
├── SECURITY.md
├── .env.production
├── backend/
│   ├── check-users.ts
│   ├── data/
│   ├── data-teste-clean/
│   ├── dist/
│   ├── eslint.config.mjs
│   ├── nest-cli.json
│   ├── node_modules/
│   ├── package-lock.json
│   ├── package.json
│   ├── prisma/
│   ├── prisma.config.ts
│   ├── server.log
│   ├── src/
│   ├── test/
│   ├── tsconfig.build.json
│   ├── tsconfig.json
│   └── tsconfig.seed.json
├── config.example.yaml
├── data/
│   ├── controle-videos.db
│   ├── images/
│   └── uploads/
├── docker-compose.dev.yml
├── docker-compose.local.yml
├── docker-compose.yml
├── docker-compose.prod.yml
├── docker-compose.monitoring.yml
├── docker-compose.logging.yml
├── docs/
├── eslint.config.mjs
├── frontend/
│   ├── next.config.js
│   ├── package.json
│   ├── public/
│   ├── src/
│   └── ...
├── monitoring/
│   ├── prometheus.yml
│   └── promtail.yml
├── nginx/
│   └── sites-available/
│       └── controle-share-videos
├── opencode.json
├── package-lock.json
├── package.json
├── reverse-proxy/
│   ├── Caddyfile
│   ├── Caddyfile.trust-proxy
│   └── Caddyfile.prod
└── scripts/
    ├── backup.sh
    ├── health-check.sh
    ├── verify-db.sh
    ├── nginx-setup-ssl.sh
    └── docker/
        ├── create-user.sh
        └── entrypoint.sh
3. Banco de dados SQLite
O sistema utiliza SQLite através do Prisma.

O banco real atualmente é:

text
data/controle-videos.db
O arquivo possui aproximadamente 172 KB e é o banco válido do sistema.

Existe também:

text
data/controle-videos.db?connection_limit=1
Esse arquivo possui tamanho zero e não deve ser utilizado como banco de
produção.

3.1 Configuração do Prisma
O arquivo:

text
backend/prisma.config.ts
utiliza:

typescript
datasource: {
  url: process.env.DATABASE_URL || "file:./data/controle-videos.db",
}
Em produção, a variável deve apontar explicitamente para:

text
file:/opt/app/backend/data/controle-videos.db
4. Modelo de dados
O banco SQLite contém, entre outros, os seguintes modelos:

User
Responsável pelos usuários do sistema:

username;

email;

senha;

administrador;

role;

limite de compartilhamento;

alteração obrigatória de senha;

autenticação TOTP;

tokens de ativação;

tokens de recuperação de senha.

Share
Representa um compartilhamento:

nome;

descrição;

expiração;

visualizações;

downloads;

bloqueio de upload;

criador;

arquivos;

destinatários;

segurança.

File
Representa os arquivos vinculados aos compartilhamentos:

nome;

tamanho;

compartilhamento associado.

DownloadLog
Registra:

compartilhamento;

arquivo;

usuário;

nome de usuário;

IP;

User-Agent;

sucesso ou falha;

motivo;

evento;

data.

5. Estrutura do segundo disco
O segundo disco deve ser montado no Ubuntu como:

text
/data
A estrutura final recomendada:

text
/data/
├── controle-videos.db
├── images/
├── uploads/
├── backups/
│   ├── sqlite/
│   ├── uploads/
│   └── images/
├── prometheus/
├── grafana/
└── loki/
Finalidade
Diretório	Finalidade
/data/controle-videos.db	Banco SQLite
/data/images/	Imagens públicas e recursos de imagem
/data/uploads/	Arquivos e vídeos enviados pelos usuários
/data/backups/	Backups do sistema
/data/prometheus/	Métricas do Prometheus
/data/grafana/	Dashboards do Grafana
/data/loki/	Logs centralizados
6. Preparação do Ubuntu
6.1 Verificar discos
bash
lsblk
Exemplo:

text
sda
├─sda1  /
└─...

sdb
└─sdb1
Descobrir o UUID:

bash
sudo blkid
Criar o ponto de montagem:

bash
sudo mkdir -p /data
Editar:

bash
sudo nano /etc/fstab
Adicionar:

text
UUID=SEU-UUID /data ext4 defaults,nofail 0 2
Testar:

bash
sudo mount -a
Confirmar:

bash
df -h
O resultado deve mostrar o segundo disco montado em:

text
/data
6.2 Instalar dependências do sistema
bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx \
  ufw fail2ban sqlite3 curl rsync
7. Criar os diretórios persistentes
bash
sudo mkdir -p /data/images
sudo mkdir -p /data/uploads
sudo mkdir -p /data/backups/{sqlite,uploads,images}
sudo mkdir -p /data/prometheus
sudo mkdir -p /data/grafana
sudo mkdir -p /data/loki
Copiar o banco atual:

bash
sudo cp data/controle-videos.db /data/controle-videos.db
Copiar imagens:

bash
sudo cp -a data/images/. /data/images/
Copiar uploads:

bash
sudo cp -a data/uploads/. /data/uploads/
8. Usuário interno do container
O arquivo:

text
scripts/docker/create-user.sh
cria o usuário utilizado pela aplicação.

A lógica principal é:

sh
PUID=${PUID:-1000}
PGID=${PGID:-1000}
O script:

cria o grupo;

cria o usuário;

altera a propriedade dos diretórios;

executa a aplicação como usuário não-root.

O proprietário atual dos dados é:

text
100999:100999
Isso indica que o container foi executado anteriormente com:

text
PUID=100999
PGID=100999
A configuração deve ser mantida de forma explícita em produção para
evitar problemas de permissão.

9. Dockerfile
O Dockerfile utiliza cinco estágios.

Stage 1 - Dependências do frontend
text
node:24-alpine
Instala as dependências do Next.js usando:

bash
npm ci
Stage 2 - Build do frontend
Executa:

bash
npm run build
O Next.js é gerado em modo standalone.

Stage 3 - Dependências do backend
Instala Python 3 e executa:

bash
npm ci
Stage 4 - Build do backend
Instala OpenSSL e executa:

bash
npx prisma generate
npm run build
npm prune --production
Stage 5 - Imagem final
A imagem final utiliza:

text
node:24-alpine
Também instala:

curl;

Caddy;

su-exec;

OpenSSL.

A imagem final não mantém npm e npx.

O container expõe:

text
3000
O healthcheck verifica:

text
/api/health
10. Fluxo interno da aplicação
A arquitetura interna é:

text
Cliente
   │
   ▼
Caddy (porta 3000)
   │
   ▼
Frontend Next.js
   │
   ▼
Backend NestJS (porta 8090)
   │
   ▼
Prisma
   │
   ▼
SQLite
O backend utiliza:

text
BACKEND_PORT=8090
A API local é:

text
http://localhost:8090
11. Docker Compose de produção
O arquivo recomendado para produção:

yaml
# docker-compose.prod.yml
services:
  controle-share-videos-v1:
    container_name: controle-share-videos-v1.0

    build:
      context: .
      dockerfile: Dockerfile

    restart: unless-stopped

    network_mode: host

    environment:
      NODE_ENV: docker
      TRUST_PROXY: "true"  # Habilitado com Nginx
      BACKEND_PORT: 8090
      API_URL: http://localhost:8090
      DATABASE_URL: file:/opt/app/backend/data/controle-videos.db
      PUID: 100999
      PGID: 100999

    volumes:
      - /data:/opt/app/backend/data:rw,z
      - /data/images:/opt/app/frontend/public/img:rw,z

    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 40s

    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 512M

    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"
11.1 Docker Compose para monitoramento
yaml
# docker-compose.monitoring.yml
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - /data/prometheus:/prometheus
    ports:
      - "9090:9090"
    restart: unless-stopped
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
      - '--web.enable-lifecycle'

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    volumes:
      - /data/grafana:/var/lib/grafana
    ports:
      - "3001:3000"
    restart: unless-stopped
    depends_on:
      - prometheus
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_INSTALL_PLUGINS=grafana-clock-panel,grafana-simple-json-datasource
11.2 Docker Compose para logs
yaml
# docker-compose.logging.yml
services:
  loki:
    image: grafana/loki:latest
    container_name: loki
    volumes:
      - /data/loki:/loki
    ports:
      - "3100:3100"
    restart: unless-stopped
    command: -config.file=/etc/loki/local-config.yaml

  promtail:
    image: grafana/promtail:latest
    container_name: promtail
    volumes:
      - /var/log:/var/log:ro
      - ./monitoring/promtail.yml:/etc/promtail/promtail.yml
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
    restart: unless-stopped
    depends_on:
      - loki
    command: -config.file=/etc/promtail/promtail.yml
Mapeamento dos volumes
Banco SQLite
Host:

text
/data/controle-videos.db
Container:

text
/opt/app/backend/data/controle-videos.db
Uploads
Host:

text
/data/uploads
Container:

text
/opt/app/backend/data/uploads
Imagens
Host:

text
/data/images
Container:

text
/opt/app/frontend/public/img
12. Por que usar bind mounts?
Os dados não devem depender do ciclo de vida do container.

Com:

yaml
- /data:/opt/app/backend/data:rw,z
a aplicação pode ser recriada:

bash
docker compose down
docker compose up -d
sem apagar:

usuários;

configurações;

tokens;

compartilhamentos;

logs;

uploads;

vídeos.

Os dados continuam no segundo disco.

13. Configuração de permissões
O container utiliza o usuário definido por:

text
PUID=100999
PGID=100999
Verificar permissões:

bash
ls -lah /data
Verificar UID e GID:

bash
stat -c '%u:%g %n' /data/controle-videos.db
A saída esperada:

text
100999:100999 /data/controle-videos.db
Se necessário:

bash
sudo chown -R 100999:100999 /data
⚠️ Essa alteração deve ser feita somente se o UID/GID utilizado pelo
container realmente for 100999:100999.

14. Configuração do Nginx
O Nginx será instalado no Ubuntu host e funcionará como reverse proxy.

14.1 Instalação
bash
sudo apt update
sudo apt install nginx
Verificar:

bash
sudo systemctl status nginx
14.2 Configuração com HTTPS
Criar:

bash
sudo nano /etc/nginx/sites-available/controle-share-videos
Configuração completa:

nginx
# /etc/nginx/sites-available/controle-share-videos

# Redirecionamento HTTP para HTTPS
server {
    listen 80;
    server_name seu-dominio.com;
    return 301 https://$server_name$request_uri;
}

# Servidor HTTPS
server {
    listen 443 ssl http2;
    server_name seu-dominio.com;

    # Certificados SSL (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/seu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seu-dominio.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Headers de segurança
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;" always;

    client_max_body_size 10G;
    client_body_timeout 600s;
    client_header_timeout 600s;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=general_limit:10m rate=100r/m;

    # Logs
    access_log /var/log/nginx/controle-share-videos_access.log;
    error_log /var/log/nginx/controle-share-videos_error.log;

    # Health check
    location /health {
        access_log off;
        proxy_pass http://127.0.0.1:3000/api/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API endpoints com rate limit específico
    location /api/ {
        limit_req zone=api_limit burst=50 nodelay;
        limit_req_status 429;

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts para uploads grandes
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        proxy_connect_timeout 600s;

        # Buffer para uploads grandes
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
    }

    # Login com rate limit específico
    location /api/auth/login {
        limit_req zone=login_limit burst=3 nodelay;
        limit_req_status 429;

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Aplicação
    location / {
        limit_req zone=general_limit burst=20;

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_connect_timeout 300s;

        # Cache de conteúdo estático
        proxy_cache_bypass $http_upgrade;
    }

    # Arquivos estáticos com cache
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 302 60m;
        proxy_cache_valid 404 1m;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
Ativar o site:

bash
sudo ln -s /etc/nginx/sites-available/controle-share-videos \
  /etc/nginx/sites-enabled/controle-share-videos
Testar configuração:

bash
sudo nginx -t
Recarregar:

bash
sudo systemctl reload nginx
14.3 Configurar HTTPS com Let's Encrypt
Script automatizado:

bash
# scripts/nginx-setup-ssl.sh
#!/bin/bash

DOMAIN=$1
EMAIL=$2

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "Uso: $0 <dominio> <email>"
    exit 1
fi

echo "Instalando Certbot..."
sudo apt update
sudo apt install -y certbot python3-certbot-nginx

echo "Obtendo certificado SSL para $DOMAIN..."
sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN \
  --non-interactive --agree-tos -m $EMAIL \
  --redirect

echo "Configurando renovação automática..."
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

echo "SSL configurado com sucesso!"
echo "Teste de renovação: sudo certbot renew --dry-run"
Executar:

bash
chmod +x scripts/nginx-setup-ssl.sh
sudo ./scripts/nginx-setup-ssl.sh seu-dominio.com seu-email@dominio.com
14.4 Configurar Firewall
bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
14.5 Configurar Fail2ban
bash
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local
Adicionar:

text
[nginx-http-auth]
enabled = true
port = http,https
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 5
bantime = 3600
Reiniciar:

bash
sudo systemctl restart fail2ban
Fluxo das conexões
text
Cliente
   │ HTTPS (porta 443)
   ▼
Nginx
   │ TLS termination
   │ Rate limiting
   │ Security headers
   ▼
127.0.0.1:3000
   │
   ▼
Container
   │
   ├── Caddy (reverse proxy interno)
   │   │
   │   ├── Frontend Next.js (porta 3000)
   │   └── Backend NestJS (porta 8090)
   │
   └── SQLite (via Prisma)
O Nginx deve ser o único componente exposto diretamente à rede externa.

15. Remover arquivo SQLite vazio incorreto
O arquivo:

text
data/controle-videos.db?connection_limit=1
está vazio.

Depois de confirmar que não é utilizado:

bash
rm 'data/controle-videos.db?connection_limit=1'
O banco válido é:

text
data/controle-videos.db
16. Build da imagem
Na raiz do projeto:

bash
cd ~/projects/controle-share-videos-v1.0
Construir sem cache:

bash
docker compose -f docker-compose.prod.yml build --no-cache
Como o ambiente atual utiliza Docker CLI emulado pelo Podman, também
pode ser necessário:

bash
podman compose -f docker-compose.prod.yml build --no-cache
17. Inicialização do sistema
Subir o container:

bash
docker compose -f docker-compose.prod.yml up -d
Subir monitoramento (opcional):

bash
docker compose -f docker-compose.monitoring.yml up -d
docker compose -f docker-compose.logging.yml up -d
Verificar:

bash
docker compose -f docker-compose.prod.yml ps
docker ps
Ver logs:

bash
docker compose -f docker-compose.prod.yml logs -f
Ver logs somente do serviço:

bash
docker compose -f docker-compose.prod.yml logs -f controle-share-videos-v1
18. Verificação do container
Listar containers:

bash
docker ps
Ver detalhes:

bash
docker inspect controle-share-videos-v1.0
Verificar healthcheck:

bash
docker inspect --format='{{json .State.Health}}' controle-share-videos-v1.0
19. Acessar o container
Como o container é baseado em Alpine:

bash
docker exec -it controle-share-videos-v1.0 sh
Verificar estrutura:

bash
ls -lah /opt/app
Ver backend:

bash
ls -lah /opt/app/backend
Ver dados:

bash
ls -lah /opt/app/backend/data
Ver frontend:

bash
ls -lah /opt/app/frontend
20. Verificar o SQLite
O SQLite pode ser acessado dentro do container se o binário estiver
disponível:

bash
docker exec -it controle-share-videos-v1.0 sqlite3 \
  /opt/app/backend/data/controle-videos.db
Caso o SQLite não esteja instalado na imagem final, o banco pode ser
analisado diretamente no host:

bash
sqlite3 /data/controle-videos.db
Comandos úteis:

sql
.tables
.schema
.quit
21. Backup do SQLite
21.1 Backup simples
Criar backup simples:

bash
sqlite3 /data/controle-videos.db \
  ".backup '/data/backups/sqlite/controle-videos-$(date +%Y-%m-%d-%H%M).db'"
Exemplo de resultado:

text
/data/backups/sqlite/controle-videos-2026-07-26-1200.db
21.2 Backup completo automatizado
Criar script de backup:

bash
# scripts/backup.sh
#!/bin/bash

BACKUP_DIR="/data/backups"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y-%m-%d-%H%M)
DATE=$(date +%Y-%m-%d)

echo "=== Iniciando backup em $TIMESTAMP ==="

# Criar diretórios se não existirem
mkdir -p $BACKUP_DIR/sqlite
mkdir -p $BACKUP_DIR/uploads/$DATE
mkdir -p $BACKUP_DIR/images/$DATE

# Backup do SQLite
echo "🔹 Backup do banco SQLite..."
sqlite3 /data/controle-videos.db ".backup '$BACKUP_DIR/sqlite/controle-videos-$TIMESTAMP.db'"
gzip $BACKUP_DIR/sqlite/controle-videos-$TIMESTAMP.db

# Backup dos uploads
echo "🔹 Backup dos uploads..."
rsync -a /data/uploads/ "$BACKUP_DIR/uploads/$DATE/"

# Backup das imagens
echo "🔹 Backup das imagens..."
rsync -a /data/images/ "$BACKUP_DIR/images/$DATE/"

# Verificar integridade do backup
echo "🔹 Verificando integridade do backup..."
if sqlite3 "$BACKUP_DIR/sqlite/controle-videos-$TIMESTAMP.db.gz" ".tables" > /dev/null 2>&1; then
    echo "✅ Backup do banco verificado com sucesso"
else
    echo "❌ Erro na verificação do backup do banco"
fi

# Remover backups antigos
echo "🔹 Removendo backups com mais de $RETENTION_DAYS dias..."
find $BACKUP_DIR/sqlite -name "controle-videos-*.db.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR/uploads -type d -mtime +$RETENTION_DAYS -exec rm -rf {} \; 2>/dev/null
find $BACKUP_DIR/images -type d -mtime +$RETENTION_DAYS -exec rm -rf {} \; 2>/dev/null

# Estatísticas
echo ""
echo "=== Estatísticas do Backup ==="
DU_SQLITE=$(du -sh $BACKUP_DIR/sqlite 2>/dev/null | cut -f1)
DU_UPLOADS=$(du -sh $BACKUP_DIR/uploads 2>/dev/null | cut -f1)
DU_IMAGES=$(du -sh $BACKUP_DIR/images 2>/dev/null | cut -f1)

echo "Tamanho total SQLite: $DU_SQLITE"
echo "Tamanho total Uploads: $DU_UPLOADS"
echo "Tamanho total Imagens: $DU_IMAGES"

echo "✅ Backup concluído com sucesso em $TIMESTAMP"
Tornar executável:

bash
chmod +x scripts/backup.sh
21.3 Configurar cron para backup automático
bash
sudo crontab -e
Adicionar:

bash
# Backup diário às 2h
0 2 * * * /opt/controle-share-videos-v1.0/scripts/backup.sh >> /var/log/backup.log 2>&1

# Backup semanal completo aos domingos às 3h
0 3 * * 0 /opt/controle-share-videos-v1.0/scripts/backup.sh >> /var/log/backup-weekly.log 2>&1
21.4 Backup externo (recomendado)
bash
# scripts/backup-remote.sh
#!/bin/bash

# Exemplo com rsync para servidor remoto
REMOTE_USER="user"
REMOTE_HOST="backup-server.com"
REMOTE_PATH="/backups/controle-share-videos"

rsync -avz --delete /data/backups/ $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/
22. Health Check e Monitoramento
22.1 Script de health check
bash
# scripts/health-check.sh
#!/bin/bash

URL="http://localhost:3000/api/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $URL)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Health Check:"

if [ $RESPONSE -eq 200 ]; then
    echo "✅ Sistema saudável (HTTP $RESPONSE)"
    exit 0
else
    echo "❌ Sistema não respondeu (HTTP $RESPONSE)"
    
    # Tentar reiniciar automaticamente
    if [ $RESPONSE -eq 0 ] || [ $RESPONSE -ge 500 ]; then
        echo "🔄 Tentando reiniciar o container..."
        docker compose -f /opt/controle-share-videos-v1.0/docker-compose.prod.yml restart
        sleep 10
        # Verificar novamente
        RETRY=$(curl -s -o /dev/null -w "%{http_code}" $URL)
        if [ $RETRY -eq 200 ]; then
            echo "✅ Container reiniciado com sucesso"
        else
            echo "❌ Falha na reinicialização do container"
        fi
    fi
    exit 1
fi
22.2 Verificação de integridade do banco
bash
# scripts/verify-db.sh
#!/bin/bash

DB_PATH="/data/controle-videos.db"
BACKUP_DIR="/data/backups/sqlite"

echo "=== Verificação do Banco de Dados ==="

# Verificar se o banco existe
if [ ! -f "$DB_PATH" ]; then
    echo "❌ Banco de dados não encontrado em $DB_PATH"
    echo "Tentando restaurar do backup mais recente..."
    
    LATEST_BACKUP=$(ls -t $BACKUP_DIR/controle-videos-*.db.gz 2>/dev/null | head -1)
    if [ -f "$LATEST_BACKUP" ]; then
        echo "🔄 Restaurando de $LATEST_BACKUP..."
        gunzip -c $LATEST_BACKUP > $DB_PATH
        chown 100999:100999 $DB_PATH
        echo "✅ Banco restaurado com sucesso"
    else
        echo "❌ Nenhum backup encontrado"
        exit 1
    fi
fi

# Verificar integridade
echo "🔍 Verificando integridade do banco..."
INTEGRITY=$(sqlite3 $DB_PATH "PRAGMA integrity_check;")

if [ "$INTEGRITY" = "ok" ]; then
    echo "✅ Banco íntegro"
    
    # Mostrar estatísticas
    echo ""
    echo "📊 Estatísticas do banco:"
    sqlite3 $DB_PATH <<EOF
.mode column
.headers on
SELECT 'Usuários' as "Entidade", COUNT(*) as "Total" FROM User;
SELECT 'Compartilhamentos' as "Entidade", COUNT(*) as "Total" FROM Share;
SELECT 'Arquivos' as "Entidade", COUNT(*) as "Total" FROM File;
SELECT 'Downloads' as "Entidade", COUNT(*) as "Total" FROM DownloadLog;
EOF
    
    # Verificar tamanho
    SIZE=$(du -h $DB_PATH | cut -f1)
    echo ""
    echo "📁 Tamanho do banco: $SIZE"
    
else
    echo "❌ Banco corrompido!"
    echo "🔄 Restaurando do backup mais recente..."
    
    LATEST_BACKUP=$(ls -t $BACKUP_DIR/controle-videos-*.db.gz 2>/dev/null | head -1)
    if [ -f "$LATEST_BACKUP" ]; then
        gunzip -c $LATEST_BACKUP > $DB_PATH
        chown 100999:100999 $DB_PATH
        echo "✅ Banco restaurado do backup $LATEST_BACKUP"
    else
        echo "❌ Nenhum backup encontrado para restauração"
        exit 1
    fi
fi
23. Monitoramento com Prometheus e Grafana
23.1 Configuração do Prometheus
yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']

  - job_name: 'docker'
    static_configs:
      - targets: ['localhost:9323']

  - job_name: 'application'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['localhost:3000']

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']

rule_files:
  - 'alerts.yml'
23.2 Alertas
yaml
# monitoring/alerts.yml
groups:
  - name: application_alerts
    rules:
      - alert: ApplicationDown
        expr: up{job="application"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Aplicação Controle Share Videos está inacessível"
          description: "A aplicação está com status DOWN por mais de 1 minuto"
          
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Alta taxa de erros HTTP 5xx"
          description: "Taxa de erros superior a 10% nos últimos 5 minutos"
          
      - alert: DatabaseSize
        expr: node_file_size{path="/data/controle-videos.db"} > 1073741824
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Banco de dados SQLite grande"
          description: "O banco de dados excedeu 1GB"
24. Atualização do sistema
Antes da atualização:

bash
docker compose -f docker-compose.prod.yml down
Atualizar o código:

bash
git pull
Reconstruir:

bash
docker compose -f docker-compose.prod.yml build
Subir novamente:

bash
docker compose -f docker-compose.prod.yml up -d
Verificar:

bash
docker compose -f docker-compose.prod.yml ps
Ver logs:

bash
docker compose -f docker-compose.prod.yml logs -f
Os dados do segundo disco não devem ser removidos durante esse processo.

25. Procedimento de recuperação
Se o container for removido:

bash
docker compose -f docker-compose.prod.yml down
Os dados permanecem em:

text
/data
Para reconstruir:

bash
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
O sistema deve reutilizar:

text
/data/controle-videos.db
/data/images/
/data/uploads/
26. Checklist de produção
Nginx
□ Nginx instalado no Ubuntu
□ domínio ou hostname definido
□ reverse proxy configurado
□ portas 80 e 443 configuradas
□ HTTPS configurado com Let's Encrypt
□ Headers de segurança habilitados
□ Rate limiting configurado
□ acesso direto às portas internas bloqueado
□ Firewall configurado
Sistema operacional
□ Ubuntu instalado
□ Segundo disco identificado
□ Segundo disco montado em /data
□ /etc/fstab configurado
□ df -h validado
□ Fail2ban configurado
Projeto
□ Código atualizado
□ Dockerfile validado
□ docker-compose.prod.yml configurado
□ .env.production configurado
□ .gitignore revisado
□ arquivos de desenvolvimento não utilizados em produção
Banco
□ controle-videos.db identificado
□ arquivo SQLite vazio incorreto removido
□ banco copiado para /data/controle-videos.db
□ DATABASE_URL configurado corretamente
□ Permissões do banco validadas
Dados
□ /data/images criado
□ /data/uploads criado
□ /data/backups criado
□ permissões validadas (PUID/PGID 100999)
Container
□ imagem construída
□ container iniciado
□ healthcheck funcionando
□ logs sem erros críticos
□ API respondendo
□ frontend acessível
□ Limites de recursos configurados
Backup
□ backup do SQLite configurado
□ backup dos uploads configurado
□ backup das imagens configurado
□ backup externo configurado
□ Script de backup testado
□ Cron configurado
□ Verificação de integridade configurada
Monitoramento
□ Logs centralizados (Loki)
□ Métricas (Prometheus)
□ Dashboards (Grafana)
□ Alertas configurados
□ Health check externo configurado
Segurança
□ Firewall UFW configurado
□ Fail2ban configurado
□ HTTPS habilitado
□ Headers de segurança habilitados
□ Rate limiting ativo
□ Secrets/JWT gerados
27. Comandos principais
Build
bash
docker compose -f docker-compose.prod.yml build --no-cache
Subir
bash
docker compose -f docker-compose.prod.yml up -d
Parar
bash
docker compose -f docker-compose.prod.yml down
Reiniciar
bash
docker compose -f docker-compose.prod.yml restart
Status
bash
docker compose -f docker-compose.prod.yml ps
Logs
bash
docker compose -f docker-compose.prod.yml logs -f
Container
bash
docker exec -it controle-share-videos-v1.0 sh
Volumes e dados
bash
ls -lah /data
Banco
bash
sqlite3 /data/controle-videos.db
Nginx
bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status nginx
SSL
bash
sudo certbot renew --dry-run
sudo certbot certificates
Backup
bash
sudo /opt/controle-share-videos-v1.0/scripts/backup.sh
Health Check
bash
/opt/controle-share-videos-v1.0/scripts/health-check.sh
Verificar DB
bash
/opt/controle-share-videos-v1.0/scripts/verify-db.sh
Monitoramento
bash
# Logs
docker compose -f docker-compose.logging.yml logs -f

# Métricas
docker compose -f docker-compose.monitoring.yml logs -f
28. Estado final esperado
A instalação final deve ficar semelhante a:

text
DISCO 1
└── Ubuntu
    ├── Nginx (portas 80/443)
    ├── Docker/Podman
    └── Projeto
        └── controle-share-videos-v1.0
            ├── Dockerfile
            ├── docker-compose.prod.yml
            ├── docker-compose.monitoring.yml
            ├── docker-compose.logging.yml
            ├── backend
            ├── frontend
            ├── reverse-proxy
            └── scripts

DISCO 2
└── /data
    ├── controle-videos.db
    ├── images
    ├── uploads
    └── backups
        ├── sqlite
        ├── uploads
        └── images
    ├── prometheus
    ├── grafana
    └── loki
Dentro do container:

text
/opt/app
├── frontend
│   ├── .next
│   └── public
│       └── img
│
├── backend
│   ├── dist
│   ├── prisma
│   └── data
│       ├── controle-videos.db
│       └── uploads
│
├── reverse-proxy
└── scripts
    └── docker
29. Solução de problemas comuns
29.1 Problemas de permissão
bash
# Verificar proprietário
ls -lah /data

# Corrigir permissões
sudo chown -R 100999:100999 /data
29.2 Nginx não inicia
bash
sudo nginx -t
sudo journalctl -u nginx
29.3 Container não inicia
bash
docker logs controle-share-videos-v1.0
docker compose -f docker-compose.prod.yml logs
29.4 Banco corrompido
bash
# Verificar
sqlite3 /data/controle-videos.db "PRAGMA integrity_check;"

# Tentar recuperar
sqlite3 /data/controle-videos.db ".dump" > /tmp/dump.sql
sqlite3 /data/controle-videos.db.new < /tmp/dump.sql
mv /data/controle-videos.db /data/controle-videos.db.corrupt
mv /data/controle-videos.db.new /data/controle-videos.db
chown 100999:100999 /data/controle-videos.db
29.5 Problemas de SSL
bash
sudo certbot renew --dry-run
sudo certbot certificates
sudo systemctl status certbot.timer
29.6 Performance do SQLite
bash
# Otimizar banco
sqlite3 /data/controle-videos.db "PRAGMA optimize;"
sqlite3 /data/controle-videos.db "VACUUM;"

# Verificar tamanho
du -h /data/controle-videos.db

# Verificar índices
sqlite3 /data/controle-videos.db "SELECT name FROM sqlite_master WHERE type='index';"
30. Otimizações adicionais
30.1 Cache do Nginx
nginx
# Adicionar ao local / do Nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=app_cache:10m max_size=1g inactive=60m use_temp_path=off;

location / {
    proxy_cache app_cache;
    proxy_cache_valid 200 302 60m;
    proxy_cache_valid 404 1m;
    proxy_cache_key "$scheme$request_method$host$request_uri";
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    proxy_cache_lock on;
    
    # ... resto da configuração
}
30.2 Compressão gzip
nginx
# Adicionar ao nginx.conf
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
gzip_comp_level 6;
gzip_disable "msie6";
30.3 Otimização do SQLite
sql
-- Configurações recomendadas
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-2000000;
PRAGMA temp_store=MEMORY;
30.4 Conexões persistentes
nginx
# Adicionar ao Nginx
keepalive_timeout 65;
keepalive_requests 100;
Conclusão
A arquitetura recomendada mantém o código e o ambiente de execução no
disco do Ubuntu e separa os dados persistentes no segundo disco.

O ponto mais importante é manter:

text
/data/controle-videos.db
/data/images/
/data/uploads/
fora do ciclo de vida do container.

Assim, a aplicação pode ser:

reconstruída;

atualizada;

removida;

recriada;

sem perder os usuários, o banco SQLite, os vídeos, os uploads e as
imagens.

O arquivo create-user.sh garante que a aplicação execute como usuário
não-root e controle corretamente as permissões através de PUID e
PGID.

A adição do Nginx como reverse proxy externo oferece:

✅ Terminação TLS (HTTPS)

✅ Rate limiting

✅ Headers de segurança

✅ Cache de conteúdo estático

✅ Compressão gzip

✅ Balanceamento de carga (se necessário futuramente)

O monitoramento com Prometheus e Grafana permite:

✅ Métricas de performance

✅ Alertas proativos

✅ Dashboards visuais

✅ Identificação rápida de problemas

Os backups automatizados garantem:

✅ Recuperação de desastres

✅ Integridade dos dados

✅ Retenção configurável

Esta configuração é adequada para produção em ambientes de pequeno a
médio porte, com capacidade de escalar conforme necessário.