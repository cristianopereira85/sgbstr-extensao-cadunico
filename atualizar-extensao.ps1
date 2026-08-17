# =================================================================
# LABORATORIO SGBSTR - Atualizador da extensao CadunicoSLZ
# =================================================================
# Baixa a versao mais recente da extensao (branch main do repo dedicado
# no GitHub) e sobrescreve a pasta local. Nao precisa de Git instalado
# na maquina - so PowerShell (Invoke-WebRequest + Expand-Archive), que
# ja vem no Windows.
#
# Uso manual:   powershell -File atualizar-extensao.ps1
# Uso agendado: e o que o instalar-extensao.ps1 registra na Tarefa
#               Agendada, rodando isso sozinho de tempos em tempos.
#
# O reload da extensao dentro do Chrome (chrome.runtime.reload()) e
# feito pelo proprio background.js da extensao, que detecta a versao
# nova sozinho - este script so cuida de baixar os arquivos.

param(
    [string]$Destino = "$env:LOCALAPPDATA\SGBSTR-Extensao",
    [string]$RepoZipUrl = "https://github.com/cristianopereira85/sgbstr-extensao-cadunico/archive/refs/heads/main.zip"
)

$ErrorActionPreference = "Stop"

# Forca TLS 1.2: em maquina mais antiga/travada o .NET do PowerShell 5.1
# as vezes negocia um protocolo que o GitHub rejeita ("A conexao
# subjacente estava fechada"). Sem isso o download falha silenciosamente
# de forma diferente em cada maquina.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# Some proxy/AV corporativo bloqueia por User-Agent "de script" (o padrao
# do PowerShell se identifica como WindowsPowerShell/x.x, o que e um alvo
# comum de bloqueio automatico). Se identificar como navegador evita isso.
# String literal em vez de [Microsoft.PowerShell.Commands.PSUserAgent]::Chrome
# de proposito: esse type accelerator fica bloqueado ("Nao e possivel
# localizar o tipo") em maquina com Constrained Language Mode (AppLocker/GPO
# de orgao publico - visto na pratica num CRAS em 17/08/2026).
$userAgentNavegador = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

$pastaTemp = Join-Path $env:TEMP "sgbstr-update-$(Get-Random)"
$zipPath = Join-Path $pastaTemp "extensao.zip"

try {
    New-Item -ItemType Directory -Force -Path $pastaTemp | Out-Null

    Write-Output "Baixando ultima versao de $RepoZipUrl ..."
    Invoke-WebRequest -Uri $RepoZipUrl -OutFile $zipPath -UseBasicParsing -UserAgent $userAgentNavegador

    Expand-Archive -Path $zipPath -DestinationPath $pastaTemp -Force

    $pastaExtraida = Get-ChildItem -Path $pastaTemp -Directory |
        Where-Object { $_.Name -like "sgbstr-extensao-cadunico-*" } |
        Select-Object -First 1

    if (-not $pastaExtraida) {
        throw "Nao encontrei a pasta extraida do zip baixado."
    }

    New-Item -ItemType Directory -Force -Path $Destino | Out-Null
    Copy-Item -Path "$($pastaExtraida.FullName)\*" -Destination $Destino -Recurse -Force

    Write-Output "Extensao atualizada com sucesso em: $Destino"
} finally {
    Remove-Item -Path $pastaTemp -Recurse -Force -ErrorAction SilentlyContinue
}
