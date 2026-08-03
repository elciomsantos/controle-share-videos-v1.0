# ============================================================================
# Corrige acesso do Windows (navegador) às portas do container Docker rodando
# dentro do WSL2 em modo mirrored networking.
#
# SINTOMA: `curl http://localhost:3000` dentro do WSL2 funciona (200), mas o
# navegador no Windows dá "ERR_CONNECTION_REFUSED" / timeout. No netstat do
# Windows as conexões ficam em SYN_SENT porque o Windows não expõe as portas
# Docker publicadas em 0.0.0.0 dentro do WSL2 (bug do modo mirrored + Docker).
#
# SOLUÇÃO: criar regras `netsh portproxy` no Windows que encaminham
# 127.0.0.1:<porta> -> 127.0.0.1:<porta> forçando o binding no loopback do
# Windows. Em WSL2 mirrored, 127.0.0.1 é compartilhado entre Windows e WSL,
# mas só portas não-Docker são forwardadas automaticamente — portas Docker
# precisam de portproxy explícito.
#
# COMO USAR:
#   1) Abra PowerShell COMO ADMINISTRADOR no Windows
#   2) Execute este script:
#        powershell -ExecutionPolicy Bypass -File <caminho>\fix-wsl2-ports.ps1
#   3) Teste no navegador: http://localhost:3000
#
# Para remover as regras depois (se quiser limpar):
#   netsh interface portproxy delete v4tov4 listenport=3000
#   netsh interface portproxy delete v4tov4 listenport=3333
#   netsh interface portproxy delete v4tov4 listenport=8090
# ============================================================================

#Requires -RunAsAdministrator

$ports = @(3000, 3333, 8090)
$target = "127.0.0.1"

Write-Host "=== Configurando portproxy WSL2 -> Docker ports ===" -ForegroundColor Cyan
Write-Host ""

foreach ($port in $ports) {
    # Limpa regra existente (ignora erros se não houver)
    netsh interface portproxy delete v4tov4 listenport=$port 2>$null | Out-Null
    # Cria regra: Windows 127.0.0.1:port -> WSL 127.0.0.1:port
    netsh interface portproxy add v4tov4 listenport=$port listenaddress=127.0.0.1 connectport=$port connectaddress=$target | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] Porta $port -> $target`:$port" -ForegroundColor Green
    } else {
        Write-Host "  [FALHA] Porta $port (codigo=$LASTEXITCODE)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== Regras atuais ===" -ForegroundColor Cyan
netsh interface portproxy show v4tov4
Write-Host ""
Write-Host "=== Testando conexao (pode levar alguns segundos) ===" -ForegroundColor Cyan
foreach ($port in $ports) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "http://localhost:$port/api/health" -ErrorAction Stop
        Write-Host "  http://localhost:$port/api/health -> $($r.StatusCode) OK" -ForegroundColor Green
    } catch {
        # /api/health so existe no backend (8090/3000); 3333 (frontend puro) tambem e valido
        try {
            $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "http://localhost:$port/" -ErrorAction Stop
            Write-Host "  http://localhost:$port/ -> $($r.StatusCode) OK" -ForegroundColor Green
        } catch {
            Write-Host "  http://localhost:$port -> falhou: $($_.Exception.Message)" -ForegroundColor Yellow
            Write-Host "    (reinicie o WSL: 'wsl --shutdown' pelo PowerShell se persistir)" -ForegroundColor DarkGray
        }
    }
}
Write-Host ""
Write-Host "Pronto. Abra http://localhost:3000 no navegador." -ForegroundColor Cyan
