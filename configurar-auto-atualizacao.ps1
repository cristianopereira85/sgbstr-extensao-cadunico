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
# So pergunta se o CRAS ainda nao estiver definido. O atualizador
# silencioso (atualizar-extensao.ps1, roda sozinho a cada 30min sem tela
# pra perguntar nada) pode ja ter criado este arquivo so com o
# id_instalacao (cras null) numa maquina que so recebeu a atualizacao
# automatica sem passar pelo instalador de novo - nesse caso, mantem o
# MESMO id_instalacao (nao gera outro) e so completa o CRAS que faltava.
$configPath = Join-Path $Destino "config_maquina.json"

$configAtual = $null
if (Test-Path $configPath) {
    $configAtual = Get-Content $configPath -Raw | ConvertFrom-Json
}

if ($configAtual -and -not [string]::IsNullOrWhiteSpace($configAtual.cras)) {
    Write-Output "OK: maquina ja identificada antes (CRAS: $($configAtual.cras))."
} else {
    if ($configAtual -and $configAtual.id_instalacao) {
        $idInstalacao = $configAtual.id_instalacao
    } else {
        $idInstalacao = [guid]::NewGuid().ToString()
    }

    Write-Output ""
    Write-Output "=================================================================="
    Write-Output " Qual e o CRAS/unidade desta maquina?"
    Write-Output "=================================================================="
    # Lista fechada (16/09/2026) em vez de texto livre - antes era Read-Host
    # sem nenhuma validacao, o que gerou 5 maquinas com CRAS errado (Anil 6,
    # Turu 5, Bacanga 6, Liberdade 8, Centro 11 - ver CLAUDE.md). Precisa
    # bater com unidades_cras_validas no Supabase e com UNIDADES_CRAS em
    # sandbox.js (nenhum dos dois le a tabela ao vivo, sincronizar a mao se
    # abrir CRAS novo). Maquina de TESTE (ex: "Casa Cristiano") nao se
    # nomeia aqui - digite 0 e responda pelo aviso na tela do Cadastro
    # Unico, que tem o codigo de acesso (este script roda offline, sem
    # rede, entao nao da pra validar o codigo aqui).
    $unidades = @(
        "ANIL", "ANJO DA GUARDA", "BACANGA", "BAIRRO DE FATIMA", "BEQUIMAO", "CENTRO",
        "CENTRO POP CENTRO", "CENTRO POP COHAB", "CIDADE OLIMPICA", "CIDADE OPERARIA",
        "COHAB", "COROADINHO", "ESTIVA", "JANAINA", "JOAO DE DEUS", "LIBERDADE",
        "MARACANA", "SAO FRANCISCO", "SAO RAIMUNDO", "SEDE DA SEMCAS", "TURU",
        "VILA NOVA", "VINHAIS"
    )
    for ($i = 0; $i -lt $unidades.Count; $i++) {
        Write-Output ("  {0,2}) {1}" -f ($i + 1), $unidades[$i])
    }
    Write-Output "   0) Nao sei agora / e maquina de teste - definir depois pelo navegador"
    Write-Output ""

    $cras = $null
    while ($true) {
        $entrada = Read-Host "Digite o numero"
        if ($entrada -eq "0") { break }
        $numero = 0
        if ([int]::TryParse($entrada, [ref]$numero) -and $numero -ge 1 -and $numero -le $unidades.Count) {
            $cras = $unidades[$numero - 1]
            break
        }
        Write-Output ("Numero invalido - digite de 0 a {0}." -f $unidades.Count)
    }

    $configObj = @{ id_instalacao = $idInstalacao; cras = $cras }
    $configObj | ConvertTo-Json | Set-Content -Path $configPath -Encoding utf8

    if ($cras) {
        Write-Output "OK: maquina identificada como '$cras' (id_instalacao $idInstalacao)."
    } else {
        Write-Output "OK: id_instalacao gravado ($idInstalacao) - a unidade sera perguntada na tela do Cadastro Unico na primeira navegacao."
    }
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
