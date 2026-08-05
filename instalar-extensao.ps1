# =================================================================
# LABORATORIO SGBSTR - Instalador (1a vez) da extensao CadunicoSLZ
# =================================================================
# Rodar isso UMA VEZ numa maquina nova (secretaria ou CRAS). Ele:
#   1. Baixa a extensao do GitHub pra uma pasta fixa do usuario.
#   2. Poe um atalho na pasta "Inicializar" do usuario que, a cada
#      login, sobe um loop escondido checando atualizacao sozinho.
#      NAO usa Agendador de Tarefas de proposito: muita maquina de
#      orgao publico bloqueia usuario comum de registrar tarefa
#      agendada via GPO (visto na pratica), mas escrever na propria
#      pasta de Inicializar nunca exige permissao especial.
#
# Depois de rodar, falta so 1 passo manual e inevitavel (o Chrome
# exige interacao humana pra isso, nao da pra automatizar):
#   - abrir chrome://extensions
#   - ativar "Modo do desenvolvedor"
#   - clicar "Carregar sem compactacao" e apontar pra pasta impressa
#     no final deste script.
#
# Uso: powershell -ExecutionPolicy Bypass -File instalar-extensao.ps1

param(
    [string]$Destino = "$env:LOCALAPPDATA\SGBSTR-Extensao",
    [string]$RepoZipUrl = "https://github.com/cristianopereira85/sgbstr-extensao-cadunico/archive/refs/heads/main.zip",
    [int]$IntervaloMinutos = 30
)

$ErrorActionPreference = "Stop"

# --- 1. Baixa a extensao (mesma logica do atualizar-extensao.ps1) ---
$pastaTemp = Join-Path $env:TEMP "sgbstr-install-$(Get-Random)"
$zipPath = Join-Path $pastaTemp "extensao.zip"

try {
    New-Item -ItemType Directory -Force -Path $pastaTemp | Out-Null

    Write-Output "Baixando extensao de $RepoZipUrl ..."
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

    Write-Output "Extensao instalada em: $Destino"
} finally {
    Remove-Item -Path $pastaTemp -Recurse -Force -ErrorAction SilentlyContinue
}

# --- 2. Poe um atalho na pasta Inicializar (sem precisar de admin) ---
$scriptLoop = Join-Path $Destino "manter-atualizado.ps1"
$pastaInicializar = [Environment]::GetFolderPath('Startup')
$atalhoPath = Join-Path $pastaInicializar "SGBSTR - Atualizar Extensao CadUnico.lnk"
$argumentosLoop = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptLoop`" -Destino `"$Destino`" -IntervaloMinutos $IntervaloMinutos"

$wshShell = New-Object -ComObject WScript.Shell
$atalho = $wshShell.CreateShortcut($atalhoPath)
$atalho.TargetPath = "powershell.exe"
$atalho.Arguments = $argumentosLoop
$atalho.WorkingDirectory = $Destino
$atalho.Description = "Mantem a extensao CadunicoSLZ atualizada sozinha (sem Agendador de Tarefas)"
$atalho.Save()

# Inicia o loop agora tambem, sem esperar o proximo login.
Start-Process -FilePath "powershell.exe" -ArgumentList $argumentosLoop -WindowStyle Hidden

Write-Output "Atalho de auto-atualizacao criado em: $atalhoPath"
Write-Output ""
Write-Output "=================================================================="
Write-Output " A mesma pasta atualizada sozinha serve pro Chrome E pro Edge (os"
Write-Output " dois sao Chromium, leem extensao descompactada do mesmo jeito)."
Write-Output " So falta o passo manual abaixo, UMA VEZ EM CADA NAVEGADOR que for"
Write-Output " usar (o proprio navegador exige interacao humana pra isso, nao"
Write-Output " da pra automatizar):"
Write-Output ""
Write-Output "   Google Chrome:"
Write-Output "   1. Abra chrome://extensions"
Write-Output "   2. Ative 'Modo do desenvolvedor' (canto superior direito)"
Write-Output "   3. Clique 'Carregar sem compactacao' e selecione esta pasta:"
Write-Output "      $Destino"
Write-Output ""
Write-Output "   Microsoft Edge:"
Write-Output "   1. Abra edge://extensions"
Write-Output "   2. Ative 'Modo de desenvolvedor' (menu lateral esquerdo)"
Write-Output "   3. Clique 'Carregar sem compactacao' e selecione a MESMA pasta:"
Write-Output "      $Destino"
Write-Output ""
Write-Output " Depois disso cada navegador se atualiza sozinho (auto-reload via"
Write-Output " background.js) sempre que o loop em segundo plano baixar versao nova."
Write-Output "=================================================================="
