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

# =================================================================
# Identidade da maquina fisica (20/08/2026)
# =================================================================
# config_maquina.json fica na MESMA pasta compartilhada de onde Chrome e
# Edge carregam a extensao descompactada - por isso o id_instalacao
# gerado aqui e o CRAS digitado aqui valem pros dois navegadores igual,
# sem precisar repetir esse passo por navegador. O atualizador
# (atualizar-extensao.ps1) so copia arquivos do ZIP por cima da pasta -
# nunca apaga esse arquivo (nao faz parte do ZIP), entao sobrevive a
# qualquer atualizacao futura sem esforco extra.
#
# So pergunta na PRIMEIRA vez (arquivo ainda nao existe). Rodar este
# script de novo numa maquina ja configurada nao repete a pergunta.
$configPath = Join-Path $Destino "config_maquina.json"

if (Test-Path $configPath) {
    $configAtual = Get-Content $configPath -Raw | ConvertFrom-Json
    Write-Output "OK: maquina ja identificada antes (CRAS: $($configAtual.cras))."
} else {
    $idInstalacao = [guid]::NewGuid().ToString()

    Write-Output ""
    Write-Output "=================================================================="
    Write-Output " Qual e o CRAS/unidade desta maquina?"
    Write-Output " (obrigatorio - exemplos: ANIL, COHAB, TURU, BAIRRO DE FATIMA,"
    Write-Output " SEDE DA SEMCAS, CENTRO POP CENTRO)"
    Write-Output "=================================================================="
    $cras = ""
    while ([string]::IsNullOrWhiteSpace($cras)) {
        $cras = Read-Host "Digite o nome do CRAS/unidade"
        if ([string]::IsNullOrWhiteSpace($cras)) {
            Write-Output "Nao pode ficar em branco - digite o nome do CRAS/unidade."
        }
    }
    $cras = $cras.Trim().ToUpper()

    $configObj = @{ id_instalacao = $idInstalacao; cras = $cras }
    $configObj | ConvertTo-Json | Set-Content -Path $configPath -Encoding utf8

    Write-Output "OK: maquina identificada como '$cras' (id_instalacao $idInstalacao)."
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
