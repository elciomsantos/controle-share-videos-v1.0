#Requires -RunAsAdministrator

# ============================================================================
# Reinicio completo do WSL2 + Docker + portproxy para o sistema Controle Share
# Videos, expondo as portas na LAN do Windows.
#
# Uso tipico (PowerShell COMO ADMINISTRADOR, apos reboot do Windows ou quando
# o IP do WSL2 mudou):
#   powershell -ExecutionPolicy Bypass -File scripts\wsl2\fix-wsl-restart.ps1
#
# O script:
#   1) wsl --shutdown
#   2) Boot da distro e iniciar o Docker (dockerd nativo no WSL2)
#   3) Aguarda o docker.sock ficar pronto
#   4) docker compose up -d (compose local)
#   5) Roda apply-portproxy.ps1 (portproxy dinamico + firewall) para o IP
#      atual do WSL2
#   6) Garante o override do hostname NO-IP no hosts do Windows (NAT loopback)
#   7) Mostra o status final dos containers
#
# Se a config da sua maquina difere dos defaults, passe os parametros:
#   .\fix-wsl-restart.ps1 -Distro Debian -User urubu `
#     -ProjectPath /home/urubu/projects/controle-share-videos-v1.0
# ============================================================================

param(
    [string]$Distro = "Debian",
    [string]$User   = "urubu",
    [string]$ProjectPath = "/home/urubu/projects/controle-share-videos-v1.0",
    [string]$ComposeFile = "docker-compose.local.yml",
    [string]$EnvFile     = ".env.local",
    [string]$Hostname = "gmlondrina-share.ddns.net",
    [string]$LanIP    = "192.168.0.200",
    [switch]$SkipPortProxy,
    [switch]$SkipHostsOverride
)

$ErrorActionPreference = 'Continue'
$log = "$env:TEMP\wsl-restart.log"
function Log($m) { "$(Get-Date -Format 'HH:mm:ss') $m" | Out-File -FilePath $log -Append -Encoding utf8 }

Write-Host "=== Reinicio do WSL2 ($Distro / usuario $User) ===" -ForegroundColor Cyan
Log '=== INICIO do script de reinicio WSL ==='

Log 'wsl --shutdown'
& wsl.exe --shutdown
Start-Sleep -Seconds 12

Log "boot da distro $Distro"
& wsl.exe -d $Distro -u root true
Start-Sleep -Seconds 6

Log 'inicia servico docker (se preciso)'
& wsl.exe -d $Distro -u root sh -c "service docker start 2>/dev/null || systemctl start docker 2>/dev/null || true"

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  $out = & wsl.exe -d $Distro -u root sh -c "test -S /var/run/docker.sock && echo READY || echo WAIT" 2>$null
  if ($out -match 'READY') { Log "docker.sock pronto na tentativa $i"; $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ready) { Log 'AVISO: docker.sock nao detectado apos retries' }

Log "docker compose up -d ($ComposeFile)"
& wsl.exe -d $Distro -u $User sh -c "cd $ProjectPath && docker compose -f $ComposeFile --env-file $EnvFile up -d 2>&1"
Start-Sleep -Seconds 12

Log '--- STATUS DOS CONTAINERS ---'
& wsl.exe -d $Distro -u root sh -c "docker ps --format '{{.Names}} | {{.Status}}'"

if (-not $SkipPortProxy) {
    Log 'aplicando portproxy'
    $applyScript = Join-Path $PSScriptRoot "apply-portproxy.ps1"
    if (Test-Path $applyScript) {
        & $applyScript
    } else {
        Write-Host "apply-portproxy.ps1 nao encontrado em $PSScriptRoot" -ForegroundColor Yellow
    }
}

if (-not $SkipHostsOverride) {
    Log "garantindo override de hosts: $Hostname -> $LanIP"
    $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
    $entry = "$LanIP`t$Hostname"

    if (Test-Path $hostsPath) {
        $content = Get-Content $hostsPath -Raw
        if ($content -match [regex]::Escape($Hostname)) {
            Write-Host "Override ja existe em hosts: $entry" -ForegroundColor DarkGray
        } else {
            Add-Content -Path $hostsPath -Value "`n# Controle Share Videos (override NO-IP para uso na LAN)`n$entry" -Encoding ascii
            Write-Host "Override adicionado ao hosts: $entry" -ForegroundColor Green
        }
        ipconfig /flushdns | Out-Null
    } else {
        Write-Host "hosts nao encontrado em $hostsPath" -ForegroundColor Yellow
    }
}

Log '=== FIM do script ==='
Write-Host ""
Write-Host "Log: $log" -ForegroundColor DarkGray