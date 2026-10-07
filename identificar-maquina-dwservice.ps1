# =================================================================
# LABORATORIO SGBSTR - Identifica esta maquina fisica, via shell do
# DWService (07/10/2026)
# =================================================================
# Mesma finalidade do identificar-maquina.ps1 (le o id_instalacao
# gravado localmente e devolve apelido/CRAS/navegadores conhecidos),
# mas usado quando o comando roda PELO SHELL REMOTO DO PROPRIO
# DWSERVICE em vez de na frente da maquina.
#
# Diferenca importante: o shell do DWService roda como NT AUTHORITY\
# SYSTEM, nao como o usuario logado - entao $env:LOCALAPPDATA nesse
# contexto aponta pro perfil do SYSTEM (C:\Windows\system32\config\
# systemprofile\...), nao pro perfil real onde o Laboratorio esta
# instalado. Este arquivo usa $PSScriptRoot (o caminho real de onde
# ELE MESMO esta gravado no disco) em vez de $env:LOCALAPPDATA - como
# ele ja vive dentro da pasta SGBSTR-Extensao (foi copiado junto no
# ultimo ciclo de atualizacao, igual qualquer outro arquivo da
# extensao), isso sempre acha o config_maquina.json certo, sem
# precisar descobrir o nome do usuario nem sobrescrever variavel
# nenhuma.
#
# Uso, direto no shell do DWService, de dentro da pasta
# SGBSTR-Extensao (ou de qualquer lugar, com caminho completo):
#   powershell -ExecutionPolicy Bypass -File identificar-maquina-dwservice.ps1

$SupabaseUrl = "https://vxinqteushefztszmhdb.supabase.co"
$SupabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4aW5xdGV1c2hlZnp0c3ptaGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMTgzNjUsImV4cCI6MjA3NDU5NDM2NX0.I9lPwicVkLUmd9e_eRfK_gC0zLgbeRoYVIE2PxtoYDs"
$ConfigPath = Join-Path $PSScriptRoot "config_maquina.json"

Write-Output "=================================================================="
Write-Output " Identificando esta maquina (via shell do DWService)..."
Write-Output "=================================================================="
Write-Output " Nome do Windows: $env:COMPUTERNAME"
Write-Output " Pasta do script: $PSScriptRoot"
Write-Output ""

if (-not (Test-Path $ConfigPath)) {
    Write-Output "Nao achei $ConfigPath"
    Write-Output "Essa maquina ainda nao tem id_instalacao (Laboratorio nao instalado,"
    Write-Output "ou instalado antes de 20/08/2026 sem passar por configurar-auto-atualizacao.ps1)."
    exit 0
}

$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json

if (-not $config.id_instalacao) {
    Write-Output "config_maquina.json existe mas sem id_instalacao - inesperado, confira o arquivo:"
    Get-Content $ConfigPath -Raw
    exit 0
}

Write-Output "id_instalacao: $($config.id_instalacao)"
if ($config.cras) { Write-Output "CRAS gravado no instalador: $($config.cras)" }
Write-Output ""
Write-Output "Consultando o Supabase o que ja sabemos sobre essa maquina..."
Write-Output ""

try {
    $body = @{ p_id_instalacao = $config.id_instalacao } | ConvertTo-Json
    $resp = Invoke-RestMethod -Method Post `
        -Uri "$SupabaseUrl/rest/v1/rpc/identificar_maquina_por_instalacao" `
        -Headers @{ apikey = $SupabaseKey; Authorization = "Bearer $SupabaseKey"; "Content-Type" = "application/json" } `
        -Body $body

    if (-not $resp -or $resp.Count -eq 0) {
        Write-Output "Nenhum registro encontrado ainda pra esse id_instalacao (a maquina pode"
        Write-Output "nao ter navegado no Cadastro Unico ainda, ou o heartbeat ainda nao rodou)."
    } else {
        $resp | Format-Table -AutoSize apelido, cras, navegador, versao_extensao, ultimo_heartbeat
    }
} catch {
    Write-Output "Nao consegui consultar o Supabase agora ($($_.Exception.Message))."
    Write-Output "Anote o id_instalacao acima e confira depois."
}

Write-Output "=================================================================="
Write-Output " Dica: se aparecer '(sem apelido)'/'(sem CRAS)' ou nada, essa"
Write-Output " maquina ainda nao respondeu o aviso de CRAS na tela do Cadastro"
Write-Output " Unico - abra o sistema uma vez antes de seguir."
Write-Output "=================================================================="
