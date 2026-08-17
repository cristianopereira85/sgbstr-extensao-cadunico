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
    # Bucket proprio do Supabase, nao mais o GitHub (raw.githubusercontent.com/
    # codeload deram erro de conexao, tipo bloqueado por GPO e rate limit (429)
    # em maquinas de CRAS diferentes em 17/08/2026 - infraestrutura nossa nao
    # depende de limite de terceiro).
    [string]$RepoZipUrl = "https://vxinqteushefztszmhdb.supabase.co/storage/v1/object/public/extensao%20lab%20chrome/sgbstr-extensao-cadunico-main.zip"
)

$ErrorActionPreference = "Stop"

# Forca TLS 1.2: em maquina mais antiga/travada o .NET do PowerShell 5.1
# as vezes negocia um protocolo que o GitHub rejeita ("A conexao
# subjacente estava fechada"). Sem isso o download falha silenciosamente
# de forma diferente em cada maquina.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# NAO usar -UserAgent disfarçado de Chrome aqui: era necessario so pro
# GitHub (que ja nao usamos mais no download direto). Contra o Supabase
# (Cloudflare por baixo), esse disfarce faz o EFEITO CONTRARIO - a
# Cloudflare desconfia quando o User-Agent diz "Chrome" mas o handshake
# TLS por baixo nao bate com um Chrome de verdade, e rejeita com 400 Bad
# Request. Visto na pratica em 17/08/2026 (maquina domestica, nao de
# CRAS): mesmo link funcionava liso sem -UserAgent e dava 400 com ele.

$pastaTemp = Join-Path $env:TEMP "sgbstr-update-$(Get-Random)"
$zipPath = Join-Path $pastaTemp "extensao.zip"

try {
    New-Item -ItemType Directory -Force -Path $pastaTemp | Out-Null

    Write-Output "Baixando ultima versao de $RepoZipUrl ..."
    Invoke-WebRequest -Uri $RepoZipUrl -OutFile $zipPath -UseBasicParsing

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
