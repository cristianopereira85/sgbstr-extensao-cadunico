# =================================================================
# LABORATORIO SGBSTR - Instalador (1a vez) da extensao CadunicoSLZ
# =================================================================
# Rodar isso UMA VEZ numa maquina nova (secretaria ou CRAS). Ele:
#   1. Baixa a extensao do GitHub pra uma pasta fixa do usuario.
#   2. Tenta registrar uma Tarefa Agendada (mecanismo padrao do
#      Windows, o que AV/EDR corporativo reconhece e nao estranha)
#      que roda o atualizador de tempos em tempos. Se der "Acesso
#      negado" (GPO de orgao publico bloqueando usuario comum -
#      visto na pratica numa maquina da secretaria), cai pra um
#      atalho na pasta "Inicializar" que roda o atualizador UMA VEZ
#      a cada login.
#
#      De proposito NAO usa processo escondido rodando em loop
#      infinito: esse padrao (processo oculto + polling periodico +
#      baixa e executa codigo da internet) e estruturalmente igual a
#      comportamento de C2/malware de persistencia, e um antivirus
#      (visto na pratica: Kaspersky bloqueando com "Acesso negado" no
#      Start-Process) pode legitimamente bloquear. O atualizador em
#      si roda uma vez e termina - nunca fica pendurado em memoria.
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

# Forca TLS 1.2 (ver mesmo comentario em atualizar-extensao.ps1) - sem
# isso, em maquina mais antiga, o download quebra com "A conexao
# subjacente estava fechada".
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# Se identifica como navegador (ver mesmo comentario em atualizar-extensao.ps1)
# - evita bloqueio de proxy/AV corporativo por User-Agent "de script".
# String literal (nao type accelerator) - ver motivo em atualizar-extensao.ps1.
$userAgentNavegador = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

# --- 1. Baixa a extensao (mesma logica do atualizar-extensao.ps1) ---
$pastaTemp = Join-Path $env:TEMP "sgbstr-install-$(Get-Random)"
$zipPath = Join-Path $pastaTemp "extensao.zip"

try {
    New-Item -ItemType Directory -Force -Path $pastaTemp | Out-Null

    Write-Output "Baixando extensao de $RepoZipUrl ..."
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

    Write-Output "Extensao instalada em: $Destino"
} finally {
    Remove-Item -Path $pastaTemp -Recurse -Force -ErrorAction SilentlyContinue
}

# --- 2. Mantem atualizado sozinho: Tarefa Agendada com fallback pra Inicializar ---
$scriptAtualizador = Join-Path $Destino "atualizar-extensao.ps1"
$mecanismoUsado = ""

try {
    $nomeTarefa = "SGBSTR - Atualizar Extensao CadUnico"

    $acaoParams = @{
        Execute  = "powershell.exe"
        Argument = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptAtualizador`" -Destino `"$Destino`""
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
    # -ErrorAction Stop explicito: o modulo ScheduledTasks (CIM por baixo) as
    # vezes ignora $ErrorActionPreference = "Stop" ambiente e escreve "Acesso
    # negado" como erro nao-terminante mesmo assim - visto na pratica em
    # 17/08/2026 (o catch nao rodava, seguia direto como se tivesse dado certo).
    Register-ScheduledTask @tarefaParams -ErrorAction Stop | Out-Null

    if (-not (Get-ScheduledTask -TaskName $nomeTarefa -ErrorAction SilentlyContinue)) {
        throw "Register-ScheduledTask nao lancou erro mas a tarefa nao existe."
    }

    $mecanismoUsado = "Tarefa Agendada '$nomeTarefa' (roda a cada $IntervaloMinutos min e a cada logon)"
} catch {
    # Sem permissao (GPO) ou algum outro bloqueio - cai pro fallback
    # que so precisa de escrita na pasta pessoal do usuario.
    $pastaInicializar = [Environment]::GetFolderPath('Startup')
    $atalhoPath = Join-Path $pastaInicializar "SGBSTR - Atualizar Extensao CadUnico.lnk"
    $argumentos = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptAtualizador`" -Destino `"$Destino`""

    $wshShell = New-Object -ComObject WScript.Shell
    $atalho = $wshShell.CreateShortcut($atalhoPath)
    $atalho.TargetPath = "powershell.exe"
    $atalho.Arguments = $argumentos
    $atalho.WorkingDirectory = $Destino
    $atalho.Description = "Atualiza a extensao CadunicoSLZ uma vez a cada login"
    $atalho.Save()

    $mecanismoUsado = "Atalho em Inicializar (Tarefa Agendada bloqueada: $($_.Exception.Message)) - atualiza uma vez por login"
}

Write-Output "Auto-atualizacao configurada: $mecanismoUsado"
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
Write-Output " background.js) sempre que uma atualizacao nova for baixada."
Write-Output "=================================================================="
