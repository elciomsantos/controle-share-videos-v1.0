# Diagrama do Sistema — Controle Share Videos

> Renderização: GitHub exibe Mermaid nativamente. Duas visões:
> **1. Implantação (componentes)** e **2. Fluxo de compartilhamento**.

---

## 1. Visão de implantação (host on-premise)

```mermaid
flowchart TB
    subgraph LAN["Rede interna GML (RFC1918)"]
        WS["🖥️ Estação Windows\n(coleção de vídeos)"]
        U["👤 Usuários\n(admin/operador/auditor)"]
    end

    subgraph HOST["Servidor on-premise (Ubuntu + Docker + Swarm secrets)"]
        direction TB

        subgraph EDGE["Edge"]
            CADDY["Caddy :3000\nTLS automático · HSTS\ncabecalhos de segurança\nrate limit · mascara pwd= nos logs"]
        end

        subgraph APP["Aplicação"]
            FE["Next.js frontend :3333\n(PWA standalone)\nvalidação client-side"]
            BE["NestJS backend :8080\nArgon2id · sessões opacas\nCSRF · throttler · WORM audit\nAPI versionada /api/vN"]
        end

        SMB["Samba [videos] :445\nSMB3 + encrypt required\nsigning mandatory · full_audit\nveto de payload · fail2ban"]

        DB[("SQLite\ncontrole-videos.db\n+ WAL")]
        VOL[("Volume uploads/\nshares · certificados PDF")]

        subgraph MON["Monitoramento (compose.monitoring)"]
            PROM["Prometheus"]
            ALERT["Alertmanager\n→ Slack / PagerDuty"]
            GRAF["Grafana"]
            LOKI["Loki + Promtail\n(logs agregados)"]
        end

        BAK["Backups\nSQLite + uploads\n→ 2º servidor/NAS\ncifrados + restore testado"]
    end

    SMTP["SMTP institucional\n(notificações, convites,\nreset de senha)"]

    %% Tráfego principal
    U -->|HTTPS 443| CADDY
    CADDY -->|proxy /api/*| BE
    CADDY -->|páginas| FE
    WS -->|"\\\\servidor\\videos (SMB3)"| SMB

    %% Dados
    BE -->|Prisma parametrizado| DB
    BE -->|lê/escreve| VOL
    SMB -.->|bind mount setgid 1002:1002| VOL

    %% Observabilidade
    BE -->|"/api/metrics"| PROM
    LOKI <--> BE
    PROM --> ALERT
    GRAF --- PROM
    LOKI --- GRAF

    %% Integrações
    BE -->|587 TLS opcional| SMTP
    BAK -.->|cron diário| DB
    BAK -.->|rsync/rclone cifrado| VOL

    classDef edge fill:#e8f4fd,stroke:#1976d2;
    classDef app fill:#e8f8ee,stroke:#388e3c;
    classDef data fill:#fff8e1,stroke:#f9a825;
    classDef mon fill:#f3e5f5,stroke:#7b1fa2;
    class CADDY edge; FE,BE,SMB app; DB,VOL data; PROM,ALERT,GRAF,LOKI mon;
```

## 2. Fluxo do compartilhamento seguro

```mermaid
sequenceDiagram
    autonumber
    actor D as Dono (autenticado)
    participant FE as Frontend
    participant API as Backend API
    participant R as Destinatário (link)

    D->>FE: Upload chunked (vídeo)
    FE->>API: POST chunks (cookie de sessão opaca + CSRF)
    API->>API: valida extensão + magic bytes + tamanho
    API->>API: gera certificado SHA-256 (PDF + QR)
    D->>FE: cria share (senha gerada, expiração,\nmaxViews/maxDownloads)
    FE->>API: POST /api/v1/shares
    Note over API: senha hasheada Argon2id<br/>token opaco emitido no acesso

    R->>API: GET /share/{id} → 403 share_password_required
    R->>API: POST /token {senha} (argon verify,<br/>checa maxViews, rate limit 20/5min)
    API-->>R: cookie share_{id}_token (httpOnly)

    R->>API: stream ?download=false (Range)
    API->>API: ShareSecurityGuard re-lê views/downloads<br/>(revogação efetiva pós-limite — #40)
    API-->>R: 206 video/mp4 (CSP sandbox, no-store)

    R->>API: download=true (1ª vez)
    API->>API: DownloadLimitGuard atômico (anti-TOCTOU)
    API-->>R: ZIP vídeo + certificado
    R->>API: download=true (2ª vez) --> 403 limite atingido

    Note over API: cada passo grava trilha WORM<br/>(hash chain SHA-256, verificação diária)
```

## 3. Camadas de segurança (resumo visual)

```mermaid
flowchart LR
    subgraph Perímetro
        FW["UFW default-deny\n80/443 · SSH limit\n445 só RFC1918"] --- F2B["fail2ban\nSSH + Samba"]
    end
    subgraph Aplicação
        AUTH["Argon2id · MFA TOTP\nRBAC · reauth recente"] --- RL["Rate limits\n3 camadas"]
        VAL["ValidationPipe\nglobal DTOs"] --- SAN["safeRedirectPath\nsanitização"]
        GUARD["ShareSecurityGuard\nlimites em toda via (#40)"] --- CSRF["CSRF double-submit"]
    end
    subgraph Dados
        ENC["Secrets AES-256-GCM\nno banco"] --- WORM["AuditLog WORM\nhash chain diária"]
    end
    Perímetro --> Aplicação --> Dados
```

**Documentos relacionados:** `docs/VISAO-GERAL.md` (arquitetura textual completa) ·
`docs/GOLIVE-CHECKLIST.md` (implantação) · `docs/operacional/SAMBA-SEGURANCA.md` (SMB).
