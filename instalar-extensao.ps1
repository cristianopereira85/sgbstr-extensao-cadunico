# =================================================================
# LABORATORIO SGBSTR - Instalador (1a vez) da extensao CadunicoSLZ
# =================================================================
# Rodar isso UMA VEZ numa maquina nova (secretaria ou CRAS). Ele:
#   1. Baixa a extensao do GitHub pra uma pasta fixa do usuario.
#   2. Registra uma Tarefa Agendada que roda o atualizador sozinho
#      de tempos em tempos, sem precisar de ninguem mexer em nada
#      depois disso.
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

# --- 2. Registra a Tarefa Agendada que mantem isso atualizado sozinho ---
# Usa splatting (@hash) em vez de continuacao de linha com backtick: mais
# robusto contra CRLF/LF e evita ambiguidade de binding com os cmdlets de
# ScheduledTask (que sao CIM, sensiveis a como os parametros chegam).
$nomeTarefa = "SGBSTR - Atualizar Extensao CadUnico"
$scriptAtualizador = Join-Path $Destino "atualizar-extensao.ps1"

$acaoParams = @{
    Execute  = "powershell.exe"
    Argument = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptAtualizador`""
}
$acao = New-ScheduledTaskAction @acaoParams

$agora = Get-Date
$triggerParams = @{
    Once               = $true
    At                 = $agora
    RepetitionInterval = New-TimeSpan -Minutes $IntervaloMinutos
    RepetitionDuration = New-TimeSpan -Days 3650
}
$triggerPeriodico = New-ScheduledTaskTrigger @triggerParams
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn

$configuracoes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

$tarefaParams = @{
    TaskName    = $nomeTarefa
    Action      = $acao
    Trigger     = @($triggerPeriodico, $triggerLogon)
    Settings    = $configuracoes
    Description = "Baixa sozinho a versao mais recente da extensao CadunicoSLZ do GitHub a cada $IntervaloMinutos min."
    Force       = $true
}
Register-ScheduledTask @tarefaParams | Out-Null

Write-Output "Tarefa Agendada '$nomeTarefa' registrada (roda a cada $IntervaloMinutos min e a cada logon)."
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
Write-Output " background.js) sempre que a Tarefa Agendada baixar versao nova."
Write-Output "=================================================================="
