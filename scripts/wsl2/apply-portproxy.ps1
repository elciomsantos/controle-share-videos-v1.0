#Requires -RunAsAdministrator

# ============================================================================
# Configura portproxy no Windows para expor portas do Docker (WSL2) na LAN.
#
# WSL2 em modo NAT (ver C:\Users\<user>\.wslconfig -> networkingMode=NAT):
#   - O WSL2 tem IP proprio na rede virtual (ex: 172.30.x.y), que MUDA a cada
#     reboot do WSL.
#   - O Windows alcanca o WSL2 via localhost (localhostForwarding=true) OU via
#     o IP virtual do WSL2.
#   - Outros PCs da LAN alcancam o servico pelo IP LAN do Windows (ex:
#     192.168.0.200) SOMENTE se houver portproxy encaminhando para o IP do WSL2.
#
# Este script:
#   1) Descobre dinamicamente o IP atual do WSL2 (wsl hostname -I)
#   2) Remove regras antigas dessas portas
#   3) Cria portproxy 0.0.0.0:<porta> -> <ip-wsl2>:<porta>
#   4) Garante regra de firewall inbound (TCP) para cada porta
#   5) Testa localmente pelo Windows
#
# COMO USAR (PowerShell como ADMINISTRADOR):
#   powershell -ExecutionPolicy Bypass -File scripts\wsl2\apply-portproxy.ps1
# ============================================================================

# Portas expostas: 80/443 (HTTPS, modo prod com Let's Encrypt) e 3000/3333/8090
# (modo local/debug). 80/443 sao as portas padrao - acesso por dominio.
$ports = @(80, 443, 3000, 3333, 8090)

# Descobre o IP atual do WSL2 (primeiro IP da saida de `wsl hostname -I`).
$wslIP = (wsl.exe hostname -I).Trim().Split(' ')[0]
if (-not $wslIP -or $wslIP -notmatch '^\d+\.\d+\.\d+\.\d+$') {
    Write-Host "[ERRO] Nao foi possivel obter o IP do WSL2. Abra o WSL primeiro." -ForegroundColor Red
    exit 1
}
Write-Host "IP atual do WSL2: $wslIP" -ForegroundColor Cyan

# Firewall: libera TCP inbound para as portas (idempotente).
foreach ($port in $ports) {
    $ruleName = "WSL2 Porta $port"
    if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -LocalPort $port `
            -Protocol TCP -Action Allow -Profile Private, Domain | Out-Null
        Write-Host "[FW] criada regra inbound $ruleName" -ForegroundColor Green
    }
}

# Limpa regras antigas dessas portas (qualquer listenaddress).
foreach ($port in $ports) {
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=127.0.0.1 2>$null | Out-Null
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null | Out-Null
}

# Cria portproxy 0.0.0.0:<porta> -> <wslIP>:<porta>.
foreach ($port in $ports) {
    netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$wslIP
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] 0.0.0.0:$port -> ${wslIP}:$port" -ForegroundColor Green
    } else {
        Write-Host "[ERRO] porta $port (codigo=$LASTEXITCODE)" -ForegroundColor Red
    }
}

Write-Host ""
netsh interface portproxy show v4tov4
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "=== Teste via Windows (localhost) ===" -ForegroundColor Cyan
foreach ($port in $ports) {
    try {
        $uri = if ($port -in 80, 443) { "http://localhost:$port/api/health" } else { "http://localhost:$port/api/health" }
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri $uri -ErrorAction Stop
        Write-Host "  $uri -> $($r.StatusCode)" -ForegroundColor Green
    } catch {
        try {
            $uri2 = if ($port -eq 443) { "https://localhost/" } else { "http://localhost:$port/" }
            $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri $uri2 -ErrorAction Stop
            Write-Host "  $uri2 -> $($r.StatusCode)" -ForegroundColor Green
        } catch {
            Write-Host "  http(s)://localhost:$port -> FALHOU: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "Acesse de outros PCs da LAN por:" -ForegroundColor Cyan
$lanIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL' } | Select-Object -First 1).IPAddress
foreach ($port in $ports) {
    Write-Host "  http://${lanIP}:$port" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Obs.: ao reiniciar o WSL o IP muda - rode este script de novo" -ForegroundColor DarkGray
Write-Host "      (ou use o fix-wsl-restart.ps1 que chama este script)." -ForegroundColor DarkGray