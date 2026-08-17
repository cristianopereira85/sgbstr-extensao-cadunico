# =================================================================
# LABORATORIO SGBSTR - Configura a auto-atualizacao (Tarefa Agendada,
# com fallback pra atalho de Inicializar se der "Acesso negado" por GPO)
# =================================================================
# Uso: depois que a extensao ja estiver instalada em $Destino - seja pelo
# fluxo automatico normal (instalar-extensao.ps1) ou pelo contorno manual
# (baixar o ZIP do repo pelo navegador e extrair na pasta manualmente,
# usado quando o download automatico falha por instabilidade de rede) -
# rode este script uma vez pra deixar a extensao se atualizando sozinha.
#
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File configurar-auto-atualizacao.ps1

param(
    [string]$Destino = "$env:LOCALAPPDATA\SGBSTR-Extensao"
)

$ErrorActionPreference = "Stop"

$scriptAtualizador = Join-Path $Destino "atualizar-extensao.ps1"

if (-not (Test-Path $scriptAtualizador)) {
    Write-Output "ERRO: nao encontrei $scriptAtualizador"
    Write-Output "Baixe e extraia a extensao primeiro em: $Destino"
    exit 1
}

$nomeTarefa = "SGBSTR - Atualizar Extensao CadUnico"

try {
    $acaoParams = @{
        Execute  = "powershell.exe"
        Argument = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptAtualizador`" -Destino `"$Destino`""
    }
    $acao = New-ScheduledTaskAction @acaoParams

    $agora = Get-Date
    $triggerParams = @{
        Once               = $true
        At                 = $agora
        RepetitionInterval = New-TimeSpan -Minutes 30
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
        Description = "Baixa sozinho a versao mais recente da extensao CadunicoSLZ do GitHub a cada 30 min."
        Force       = $true
    }
    # -ErrorAction Stop explicito na propria chamada: o modulo ScheduledTasks
    # (CIM por baixo) as vezes ignora $ErrorActionPreference = "Stop" ambiente
    # e escreve "Acesso negado" como erro nao-terminante mesmo assim - visto
    # na pratica em 17/08/2026 (o catch nao rodava, seguia direto pro "OK").
    Register-ScheduledTask @tarefaParams -ErrorAction Stop | Out-Null

    # Confirma que a tarefa existe de verdade antes de declarar sucesso -
    # nao confiar so na ausencia de excecao visivel (mesmo motivo acima).
    if (-not (Get-ScheduledTask -TaskName $nomeTarefa -ErrorAction SilentlyContinue)) {
        throw "Register-ScheduledTask nao lancou erro mas a tarefa nao existe."
    }

    Write-Output "OK: Tarefa Agendada registrada (roda a cada 30min + a cada login)."
} catch {
    Write-Output "Tarefa Agendada bloqueada ($($_.Exception.Message)) - usando fallback."

    $pastaInicializar = [Environment]::GetFolderPath('Startup')
    $atalhoPath = Join-Path $pastaInicializar "SGBSTR - Atualizar Extensao CadUnico.lnk"
    $wshShell = New-Object -ComObject WScript.Shell
    $atalho = $wshShell.CreateShortcut($atalhoPath)
    $atalho.TargetPath = "powershell.exe"
    $atalho.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptAtualizador`" -Destino `"$Destino`""
    $atalho.WorkingDirectory = $Destino
    $atalho.Save()

    Write-Output "OK: Atalho criado em Inicializar (atualiza 1x por login)."
}
