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
    [string]$Destino = "$env:LOCALAPPDATA\SGBSTR-Extensao",
    [switch]$SoOcultarIconeDwAgent
)

$ErrorActionPreference = "Stop"

# =================================================================
# Ocultar icone do DWAgent (DWService) - 17/09/2026
# =================================================================
# So mexe na entrada de inicializacao do "Monitor" (o programa que mostra
# o icone/menu na bandeja) - o SERVICO do Windows (DWAgent, o que faz o
# acesso remoto funcionar de verdade) nunca e tocado. Testado ao vivo em
# 17/09/2026 (ver notas.md na pasta "DWService CRAS" do laboratorio).
function Test-Administrador {
    $identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identidade)
    return $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}

function Invoke-OcultarIconeDwAgent {
    if (-not (Test-Administrador)) {
        Write-Output "Pedindo permissao de administrador para ocultar o icone do DWAgent..."
        Write-Output "(vai aparecer uma tela cinza do Windows pedindo confirmacao)"
        try {
            $argumentos = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Destino `"$Destino`" -SoOcultarIconeDwAgent"
            Start-Process powershell -Verb RunAs -ArgumentList $argumentos -Wait -ErrorAction Stop
        } catch {
            Write-Output "Permissao de administrador nao foi concedida - o icone NAO foi ocultado."
            Write-Output "Rode este script de novo mais tarde pra tentar de novo."
        }
        return
    }

    Write-Output ""
    Write-Output "=================================================================="
    Write-Output " Ocultando o icone do DWAgent (o servico de acesso remoto continua"
    Write-Output " rodando normalmente - so o icone/menu na bandeja e removido)"
    Write-Output "=================================================================="

    $backupPath = Join-Path $Destino "backup_autostart_dwagent.json"

    $runKeys = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run",
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
    )
    $locais = @()
    foreach ($chave in $runKeys) {
        if (Test-Path $chave) {
            $props = Get-ItemProperty -Path $chave
            foreach ($prop in $props.PSObject.Properties) {
                if ($prop.Name -notmatch '^PS' -and "$($prop.Value)" -match '(?i)dwag|dwservice') {
                    $locais += [pscustomobject]@{ Tipo = "RegistroRun"; Chave = $chave; Nome = $prop.Name; Valor = "$($prop.Value)" }
                }
            }
        }
    }
    $startupFolders = @([Environment]::GetFolderPath("Startup"), [Environment]::GetFolderPath("CommonStartup"))
    foreach ($pasta in $startupFolders) {
        if (Test-Path $pasta) {
            Get-ChildItem -Path $pasta -Filter "*.lnk" -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -match '(?i)dwag|dwservice' } |
                ForEach-Object { $locais += [pscustomobject]@{ Tipo = "AtalhoInicializacao"; Chave = $pasta; Nome = $_.Name; Valor = $_.FullName } }
        }
    }

    if ($locais.Count -eq 0) {
        Write-Output "Nenhuma entrada de inicializacao do DWAgent encontrada -- o icone ja"
        Write-Output "nao deveria aparecer (ou o DWAgent usa um mecanismo diferente nesta"
        Write-Output "versao/maquina - se ainda aparecer, me avise)."
    } else {
        $locais | ConvertTo-Json | Out-File -FilePath $backupPath -Encoding utf8
        Write-Output "Backup salvo em: $backupPath"
        foreach ($item in $locais) {
            if ($item.Tipo -eq "RegistroRun") {
                Remove-ItemProperty -Path $item.Chave -Name $item.Nome -ErrorAction SilentlyContinue
                Write-Output "Removido do registro: $($item.Chave)\$($item.Nome)"
            } else {
                Remove-Item -Path $item.Valor -Force -ErrorAction SilentlyContinue
                Write-Output "Atalho removido: $($item.Valor)"
            }
        }
    }

    $processosMonitor = Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -match '(?i)dwag' -and $_.ProcessName -notmatch '(?i)^dwagsvc$'
    }
    foreach ($p in $processosMonitor) {
        Write-Output "Encerrando processo do icone: $($p.ProcessName) (PID $($p.Id))"
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }

    $servico = Get-Service -Name "DWAgent" -ErrorAction SilentlyContinue
    if ($servico) {
        Write-Output "Servico DWAgent: $($servico.Status) (precisa continuar Running)."
        if ($servico.Status -ne "Running") {
            Write-Warning "O servico NAO esta rodando! Isso NAO deveria acontecer so por remover o icone -- verifique manualmente."
        }
    } else {
        Write-Output "Servico 'DWAgent' nao encontrado nesta maquina ainda (normal se o"
        Write-Output "DWAgent acabou de ser instalado agora mesmo - pode levar alguns"
        Write-Output "segundos pra aparecer)."
    }

    Write-Output ""
    Write-Output "Pronto. O icone do DWAgent nao deve aparecer mais, nem no proximo login."
}

if ($SoOcultarIconeDwAgent) {
    Invoke-OcultarIconeDwAgent
    exit 0
}

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
    $cras = $configAtual.cras
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

# =================================================================
# Nome desta maquina pra usar tambem no DWAgent (DWService) - 17/09/2026
# =================================================================
# So roda se a unidade foi definida (nao roda pra "0 / nao sei agora").
# Duas situacoes bem diferentes:
#   1. Maquina que JA usou a extensao no Cadastro Unico antes (reinstalacao,
#      ex: Cristiano passando de novo no CRAS pra instalar o DWService) -
#      ja existe um nome DEFINITIVO gravado (maquinas_cras.apelido).
#      Busca esse nome de verdade via identificar_maquina_por_instalacao()
#      (mesma RPC do identificar-maquina.ps1, ja usada em campo).
#   2. Maquina nova (ou que ainda nao abriu o Cadastro Unico) - RESERVA de
#      verdade via reservar_apelido_instalacao() (nao so estima): trava por
#      CRAS no Postgres, garante que nenhuma outra maquina do mesmo CRAS
#      instalada nesse meio-tempo vai pegar o mesmo numero. Quando a
#      extensao rodar pela 1a vez no Cadastro Unico, aplicar_cras_config()
#      usa exatamente essa reserva -- o nome mostrado aqui e garantido, nao
#      e só palpite.
if ($cras) {
    $SupabaseUrl = "https://vxinqteushefztszmhdb.supabase.co"
    $SupabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4aW5xdGV1c2hlZnp0c3ptaGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMTgzNjUsImV4cCI6MjA3NDU5NDM2NX0.I9lPwicVkLUmd9e_eRfK_gC0zLgbeRoYVIE2PxtoYDs"

    $idInstalacaoAtual = $null
    if ($configAtual -and $configAtual.id_instalacao) {
        $idInstalacaoAtual = $configAtual.id_instalacao
    } elseif ($idInstalacao) {
        $idInstalacaoAtual = $idInstalacao
    }

    Write-Output ""
    Write-Output "=================================================================="
    Write-Output " Nome desta maquina (use tambem no DWAgent)"
    Write-Output "=================================================================="

    $apelidoReal = $null
    if ($idInstalacaoAtual) {
        try {
            $bodyIdent = @{ p_id_instalacao = $idInstalacaoAtual } | ConvertTo-Json
            $respIdent = Invoke-RestMethod -Method Post `
                -Uri "$SupabaseUrl/rest/v1/rpc/identificar_maquina_por_instalacao" `
                -Headers @{ apikey = $SupabaseKey; Authorization = "Bearer $SupabaseKey"; "Content-Type" = "application/json" } `
                -Body $bodyIdent

            $linhaComApelido = $respIdent | Where-Object { $_.apelido } | Select-Object -First 1
            if ($linhaComApelido) {
                $apelidoReal = $linhaComApelido.apelido
            }
        } catch {
            # segue pro fallback de sugestao abaixo
        }
    }

    if ($apelidoReal) {
        Write-Output " Nome JA CONFIRMADO: $apelidoReal"
        Write-Output " (esta maquina ja usou a extensao no Cadastro Unico antes - use"
        Write-Output " exatamente esse nome, ja e definitivo.)"
    } elseif ($idInstalacaoAtual) {
        try {
            $bodyReserva = @{ p_id_instalacao = $idInstalacaoAtual; p_cras = $cras } | ConvertTo-Json
            $apelidoReservado = Invoke-RestMethod -Method Post `
                -Uri "$SupabaseUrl/rest/v1/rpc/reservar_apelido_instalacao" `
                -Headers @{ apikey = $SupabaseKey; Authorization = "Bearer $SupabaseKey"; "Content-Type" = "application/json" } `
                -Body $bodyReserva

            if ($apelidoReservado) {
                Write-Output " Nome RESERVADO para esta maquina: $apelidoReservado"
                Write-Output " (reservado agora no nosso sistema - nenhuma outra maquina do"
                Write-Output " '$cras' vai receber esse mesmo numero, mesmo que seja instalada"
                Write-Output " antes desta abrir o Cadastro Unico pela 1a vez. Pode usar com"
                Write-Output " confianca ao nomear o cliente do DWAgent.)"
            } else {
                Write-Output " Nao consegui reservar um nome agora (resposta vazia)."
                Write-Output " Confira o nome certo depois em slz-extensoes.netlify.app antes"
                Write-Output " de nomear o cliente do DWAgent."
            }
        } catch {
            Write-Output " Nao consegui reservar um nome agora ($($_.Exception.Message))."
            Write-Output " Confira o nome certo depois em slz-extensoes.netlify.app antes de"
            Write-Output " nomear o cliente do DWAgent."
        }
    } else {
        Write-Output " Nao ha id_instalacao pra reservar um nome (inesperado - confira"
        Write-Output " $configPath)."
    }
    Write-Output ""
    Write-Output " Anote e use ESSE NOME ao configurar o cliente do DWAgent (DWService)"
    Write-Output " nesta maquina - assim os dois sistemas mostram a mesma identificacao,"
    Write-Output " e fica facil achar a maquina certa depois."

    # -----------------------------------------------------------------
    # DWAgent (DWService) - pergunta se ja foi instalado e se quer ocultar
    # -----------------------------------------------------------------
    Write-Output ""
    $jaInstalouDw = Read-Host "Voce ja instalou o DWService (DWAgent) nesta maquina? (S/N)"
    if ($jaInstalouDw -match '^[Ss]') {
        $ocultarDw = Read-Host "Deseja ocultar agora o icone do DWAgent na bandeja? (S/N)"
        if ($ocultarDw -match '^[Ss]') {
            Invoke-OcultarIconeDwAgent
        } else {
            Write-Output "OK, icone mantido visivel por enquanto. Pra ocultar depois, rode"
            Write-Output "este mesmo script de novo."
        }
    } else {
        Write-Output "OK. Depois de instalar o DWAgent, rode este mesmo script de novo"
        Write-Output "pra ter a opcao de ocultar o icone."
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
