# =============================================================================
# wsl-lan-expose.ps1 — expõe as portas 80/443 do WSL2 para a rede interna
#
# Contexto: WSL2 em modo NAT tem IP próprio (eth0, ex.: 172.30.x.x) que muda
# a cada reinício do WSL. Máquinas da LAN só alcançam os serviços publicados
# pelo Docker (caddy :80/:443) via portproxy no Windows host.
#
# O que faz (requer PowerShell como Administrador):
#   1. Descobre o IP atual do WSL (wsl hostname -I)
#   2. Recria netsh portproxy 0.0.0.0:80 → <ip-wsl>:80 e 0.0.0.0:443 → <ip-wsl>:443
#   3. Crea regra de firewall de entrada para TCP 80/443 (escopo opcional)
#
# Uso:
#   .\scripts\provision\wsl-lan-expose.ps1                       # acesso liberado na LAN toda
#   .\scripts\provision\wsl-lan-expose.ps1 -Scope 10.10.10.0/24  # restringe por subrede
#
# Re-executar sempre após reiniciar o WSL (o IP do eth0 muda).
# Remover tudo: .\scripts\provision\wsl-lan-expose.ps1 -Remove
# =============================================================================

#Requires -RunAsAdministrator

param(
    # Restringe o firewall a uma subrede (ex.: "10.10.10.0/24"). Vazio = LAN inteira.
    [string]$Scope = "",

    # Remove portproxy + regra de firewall em vez de criar.
    [switch]$Remove
)

$ErrorActionPreference = "Stop"
$FirewallRuleName = "controle-videos-homologacao 80-443"

function Get-WslIp {
    $raw = wsl.exe hostname -I 2>$null
    $ip = ($raw | Out-String).Trim().Split(" ")[0]
    if (-not $ip -or $ip -notmatch '^\d+\.\d+\.\d+\.\d+$') {
        throw "Nao foi possivel obter o IP do WSL (eth0). O WSL esta rodando? (wsl -l -v)"
    }
    return $ip
}

if ($Remove) {
    Write-Host "[*] Removendo portproxy 80/443..."
    netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=80  | Out-Null
    netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=443 | Out-Null
    if (Get-NetFirewallRule -DisplayName $FirewallRuleName -ErrorAction SilentlyContinue) {
        Remove-NetFirewallRule -DisplayName $FirewallRuleName
    }
    Write-Host "[OK] Portproxy e regra de firewall removidos."
    exit 0
}

$wslIp = Get-WslIp
Write-Host "[*] IP do WSL detectado: $wslIp"

Write-Host "[*] Recriando portproxy 0.0.0.0:80 -> ${wslIp}:80 ..."
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=80  2>$null | Out-Null
netsh interface portproxy add    v4tov4 listenaddress=0.0.0.0 listenport=80  connectaddress=$wslIp connectport=80  | Out-Null

Write-Host "[*] Recriando portproxy 0.0.0.0:443 -> ${wslIp}:443 ..."
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=443 2>$null | Out-Null
netsh interface portproxy add    v4tov4 listenaddress=0.0.0.0 listenport=443 connectaddress=$wslIp connectport=443 | Out-Null

if (Get-NetFirewallRule -DisplayName $FirewallRuleName -ErrorAction SilentlyContinue) {
    Remove-NetFirewallRule -DisplayName $FirewallRuleName
}

$ruleParams = @{
    DisplayName = $FirewallRuleName
    Direction   = "Inbound"
    Protocol    = "TCP"
    LocalPort   = @(80, 443)
    Action      = "Allow"
    # Perfil Any: redes domésticas/corporativas costumam vir classificadas
    # como Public no Windows e uma regra só Private seria ignorada. O
    # controle de exposição fica no RemoteAddress (-Scope).
    Profile     = "Any"
}
if ($Scope) {
    $ruleParams["RemoteAddress"] = $Scope
    Write-Host "[*] Criando regra de firewall (TCP 80,443) restrita a $Scope ..."
} else {
    Write-Host "[*] Criando regra de firewall (TCP 80,443) sem restricao de origem ..."
}
New-NetFirewallRule @ruleParams | Out-Null

Write-Host ""
Write-Host "[OK] Pronto. Teste a partir de outra maquina da rede:"
Write-Host "     curl.exe -k https://<IP-da-maquina>/api/health"
Write-Host ""
Write-Host "[i] Regras ativas:"
netsh interface portproxy show v4tov4
