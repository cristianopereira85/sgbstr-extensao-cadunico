# =================================================================
# LABORATORIO SGBSTR - Identifica esta maquina fisica (16/09/2026)
# =================================================================
# Roda direto na maquina, na frente dela (nao precisa de rede alem do
# acesso normal ao Supabase). Le o id_instalacao gravado localmente pelo
# instalador (config_maquina.json) e devolve o que o sistema ja sabe
# sobre essa maquina - apelido, CRAS, versao, navegadores - pra usar na
# hora de nomear o cliente do DWService (ou qualquer outra ferramenta)
# com o nome certo, sem precisar perguntar antes.
#
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File identificar-maquina.ps1

$SupabaseUrl = "https://vxinqteushefztszmhdb.supabase.co"
$SupabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4aW5xdGV1c2hlZnp0c3ptaGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMTgzNjUsImV4cCI6MjA3NDU5NDM2NX0.I9lPwicVkLUmd9e_eRfK_gC0zLgbeRoYVIE2PxtoYDs"
$ConfigPath = "$env:LOCALAPPDATA\SGBSTR-Extensao\config_maquina.json"

Write-Output "=================================================================="
Write-Output " Identificando esta maquina..."
Write-Output "=================================================================="
Write-Output " Nome do Windows: $env:COMPUTERNAME"
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
