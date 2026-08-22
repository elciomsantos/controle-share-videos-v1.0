# Segurança do Compartilhamento Samba [videos]

**Script:** `scripts/provision/samba.sh` · **Firewall:** `scripts/provision/hardening.sh`
**Contexto:** ponte de entrada de vídeos — estações Windows da LAN colam arquivos em
`\\servidor\videos` e aparecem imediatamente no container (mesmo bind mount).
**Revisão de segurança:** 2026-08-22 (issue de triagem CodeQL #41 — escopo SAS/SMB).

---

## Modelo de ameaça

| Ativo | Risco |
|---|---|
| Vídeos institucionais (GML) | Exposição na LAN, interceptação, alteração em trânsito |
| Estações Windows | Estação comprometida usando a share como vetor de payload |
| Servidor | Brute-force SMB, exploração de versões antigas (SMB1), acesso anônimo |

## Controles implementados

### Identidade e acesso
- **Sem convidados:** `guest ok = no` + `map to guest = never`.
- **Usuário dedicado** `uploader` (UID 1102) com shell `nologin` — não é o usuário do container.
- **Único usuário válido:** `valid users = uploader`; senha gerenciada via `smbpasswd`
  (rotação: `smbpasswd uploader`).

### Rede
- `hosts allow` restrito a RFC1918 + loopback; `hosts deny = ALL`.
- **UFW:** porta 445 negada por padrão, liberada apenas para os ranges internos.
- **fail2ban:** jail `samba` ativa — 5 tentativas → ban de 1h (`/var/log/samba/log.smbd`).

### Protocolo (endurecimento adicionado em 2026-08-22)
- **SMB3 mínimo no servidor** (`server min protocol = SMB3`, máximo SMB3_11) — elimina
  SMB1 (vetor EternalBlue/WannaCry). Clientes precisam de Windows 8+.
- **Criptografia obrigatória** (`server smb encrypt = required`) — os vídeos trafegam
  cifrados na LAN (SMB3 AES). Requer Win8+/10+.
- **Assinatura obrigatória** (`server signing = mandatory`) — protege contra MITM/
  alteração em trânsito.
- `null passwords = no` explícito.

### Conteúdo
- **Veto de payload ampliado:** `.bat .exe .scr .com .cmd .vbs .js .jse .wsf .ps1`
  + `.hta .lnk .iso .img .msi .jar .dll .cpl` — droppers clássicos (HTA, atalhos
  maliciosos, ISOs montáveis, instaladores). Arquivos de vídeo legítimos não são afetados.

### Auditoria
- **VFS `full_audit`:** registra connect/disconnect/opendir/mkdir/rmdir/unlink/rename/pwrite
  com prefixo `usuário|IP|share|timestamp`.
- Destino: syslog `local7` → `/etc/rsyslog.d/30-samba-audit.conf` → `/var/log/samba/audit.log`.

### Permissões POSIX
- Diretório `1002:1002` + setgid (`2775`); arquivos `0664`.
- `force group = 1002`: todo arquivo colado pela estação herda o grupo do container —
  leitura/escrita coerente entre Samba e aplicação sem privilégios extras.

## Verificação pós-provisionamento

```bash
# Configuração válida?
testparm -s --suppress-prompt | grep -E "encrypt|signing|min protocol"

# Protocolo negociado por um cliente (a partir de uma estação Linux):
smbclient //servidor/videos -U uploader -m SMB3

# Tentativa com SMB1 deve FALHAR:
smbclient //servidor/videos -U uploader -m NT1   # esperado: erro de protocolo

# Auditoria gravando:
sudo tail -f /var/log/samba/audit.log   # ao colar/remover um arquivo na share

# Veto funcionando:
cp malware.hta /mnt/videos/ 2>&1        # esperado: operação recusada pelo servidor
```

## Procedimentos operacionais

| Tarefa | Comando |
|---|---|
| Rotacionar senha do uploader | `sudo smbpasswd uploader` |
| Revisar auditoria do dia | `grep "$(date +%b/%d)" /var/log/samba/audit.log` |
| Investigar exclusões suspeitas | `grep unlink /var/log/samba/audit.log` |
| Reaplicar provisionamento (idempotente) | `sudo UPLOADER_PASSWORD=... bash scripts/provision/samba.sh` |

## Limitações conhecidas

1. **Windows 7/XP não conectam mais** (sem SMB3/criptografia) — aceito; ambiente atual usa Win10+.
2. A auditoria do Samba cobre a porta dos fundos (SMB); a trilha canônica de eventos
   permanece no WORM da aplicação (`docs/auditoria/PENTEST-SHARE-LINK-2026-08-22.md` §controles).
3. `nmbd` segue ativo para descoberta NetBIOS; se a rede usar DNS interno, pode ser
   desativado (`systemctl disable --now nmbd`) como hardening adicional.
