#Requires -RunAsAdministrator

# Limpa TODAS as regras portproxy que estavam interferindo com o WSL2 mirrored
# Em modo mirrored com localhostForwarding=true, o Windows deveria conseguir
# acessar portas docker pela pilha de loopback compartilhada — mas regras
# portproxy antigas em 0.0.0.0:8080/8081 estavam "ocupando" o espaço.

Write-Host "Limpando regras portproxy existentes..." -ForegroundColor Cyan
# Lista todas as portas em uso e remove
$existing = netsh interface portproxy show v4tov4
$ports = @(3000, 3333, 8090, 8080, 8081)
foreach ($port in $ports) {
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null | Out-Null
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=127.0.0.1 2>$null | Out-Null
}

Write-Host ""
Write-Host "Regras restantes:" -ForegroundColor Cyan
netsh interface portproxy show v4tov4
Write-Host ""
Write-Host "Feito. Agora reinicie o WSL para aplicar o localhostForwarding limpo:" -ForegroundColor Green
Write-Host "  wsl --shutdown   (no PowerShell)" -ForegroundColor Yellow
Write-Host "  Depois abra o WSL novamente e rode:" -ForegroundColor Yellow
Write-Host "  docker compose -f docker-compose.local.yml up -d" -ForegroundColor Yellow
