#Requires -RunAsAdministrator

# Limpa as regras antigas (que apontavam pra 127.0.0.1, que nao funciona)
$ports = @(3000, 3333, 8090)
foreach ($port in $ports) {
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=127.0.0.1 2>$null | Out-Null
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null | Out-Null
}

# Em WSL2 mirrored, o IP da LAN (192.168.0.200) é compartilhado entre Windows e WSL.
# Ao apontar o portproxy para esse IP, o Windows alcança o Docker publicado em 0.0.0.0:port dentro do WSL.
$wslIP = "192.168.0.200"
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
Write-Host "=== Teste via Windows ===" -ForegroundColor Cyan
foreach ($port in $ports) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "http://localhost:$port/api/health" -ErrorAction Stop
        Write-Host "  http://localhost:$port/api/health -> $($r.StatusCode)" -ForegroundColor Green
    } catch {
        try {
            $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "http://localhost:$port/" -ErrorAction Stop
            Write-Host "  http://localhost:$port/ -> $($r.StatusCode)" -ForegroundColor Green
        } catch {
            Write-Host "  http://localhost:$port -> FALHOU: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}
